import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "../src/lib/db";
import {
  getAnalytics,
  inspectAnalyticsRecord,
  reportRecords,
  saveAnalyticsView,
  saveDashboardPreference,
} from "../src/lib/analytics";
import { parseFilters } from "../src/lib/analytics-core";
import {
  register,
  login,
  createSession,
  userForToken,
  hashToken,
  verifyPassword,
  rateLimit,
} from "../src/lib/auth";
import {
  applyForMembership,
  atomic,
  castVote,
  contribute,
  createCommunity,
  createProposal,
  manageMember,
  proposalAction,
  reviewApplication,
} from "../src/lib/service";
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Tests require the isolated runner",
  );
  const people: User[] = [];
  for (let i = 0; i < 6; i++)
    people.push(
      await register({
        email: `person${i}@test.invalid`,
        username: `person${i}`,
        displayName: `Person ${i}`,
        password: "SecureTestPassword!42",
      }),
    );
  const [admin, mod, member, late, outsider] = people;
  const c = await createCommunity(admin.id, {
    name: "Integration collective",
    slug: "integration-collective",
    description: "A real PostgreSQL integrity test community.",
    purpose:
      "Verify that every shared financial decision is correctly authorized and recorded.",
    currency: "USD",
    minimumContribution: "10",
    questions: "Why would you like to join?",
  });
  const questions = await db.membershipQuestion.findMany({
    where: { communityId: c.id },
  });
  const apply = async (userId: string) =>
    applyForMembership(userId, {
      communityId: c.id,
      introduction:
        "I want to contribute to the collective and help with shared projects.",
      proposedContribution: "10",
      answers: {
        [questions[0].id]: "I can volunteer and contribute to shared projects.",
      },
    });
  const active = async () =>
    db.communityMembership.findMany({
      where: { communityId: c.id, status: "ACTIVE" },
    });
  const admit = async (userId: string) => {
    const a = await apply(userId);
    await reviewApplication(admin.id, {
      communityId: c.id,
      applicationId: a.id,
      decision: "ballot",
      reason: "Eligible application reviewed.",
    });
    const p = await db.proposal.findUniqueOrThrow({
      where: { applicationId: a.id },
    });
    for (const m of await active())
      await castVote(m.userId, {
        communityId: c.id,
        proposalId: p.id,
        choice: "YES",
      });
    await proposalAction(admin.id, {
      communityId: c.id,
      proposalId: p.id,
      action: "finalize",
    });
    return p;
  };
  await check("password hashing and authentication", async () => {
    assert.notEqual(admin.passwordHash, "SecureTestPassword!42");
    assert.ok(
      await verifyPassword("SecureTestPassword!42", admin.passwordHash),
    );
    assert.equal(
      (await login({ email: admin.email, password: "SecureTestPassword!42" }))
        .id,
      admin.id,
    );
    await assert.rejects(() =>
      login({ email: admin.email, password: "wrong" }),
    );
  });
  await check("session expiration and revocation", async () => {
    const s = await createSession(admin.id);
    assert.equal((await userForToken(s.token))?.id, admin.id);
    await db.session.update({
      where: { tokenHash: hashToken(s.token) },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(await userForToken(s.token), null);
    const s2 = await createSession(admin.id);
    await db.session.update({
      where: { tokenHash: hashToken(s2.token) },
      data: { revokedAt: new Date() },
    });
    assert.equal(await userForToken(s2.token), null);
  });
  await check("persistent authentication rate limit", async () => {
    await rateLimit("test-limit", 1);
    await assert.rejects(() => rateLimit("test-limit", 1), /Too many/);
  });
  await check("membership requires a recorded majority decision", async () => {
    const p = await admit(mod.id);
    assert.equal(
      (await db.proposal.findUniqueOrThrow({ where: { id: p.id } })).status,
      "APPROVED",
    );
    assert.equal(
      (
        await db.communityMembership.findUniqueOrThrow({
          where: { communityId_userId: { communityId: c.id, userId: mod.id } },
        })
      ).status,
      "ACTIVE",
    );
  });
  await admit(member.id);
  await manageMember(admin.id, {
    communityId: c.id,
    userId: mod.id,
    action: "moderator",
  });
  await check(
    "moderator cannot appoint moderators or transfer authority",
    async () => {
      await assert.rejects(
        () =>
          manageMember(mod.id, {
            communityId: c.id,
            userId: member.id,
            action: "moderator",
          }),
        /administrator/,
      );
      await assert.rejects(
        () =>
          manageMember(mod.id, {
            communityId: c.id,
            userId: member.id,
            action: "transfer",
            confirmName: c.name,
          }),
        /administrator/,
      );
    },
  );
  await check(
    "community-scoped authorization and member/staff separation",
    async () => {
      await assert.rejects(
        () =>
          contribute(outsider.id, {
            communityId: c.id,
            amount: "10",
            idempotencyKey: randomUUID(),
          }),
        /active membership/,
      );
      const a = await apply(late.id);
      await assert.rejects(
        () =>
          reviewApplication(member.id, {
            communityId: c.id,
            applicationId: a.id,
            decision: "ballot",
            reason: "A review reason",
          }),
        /moderator/,
      );
      await assert.rejects(
        () =>
          reviewApplication(mod.id, {
            communityId: c.id,
            applicationId: a.id,
            decision: "approve",
            reason: "A review reason",
          }),
        /requires a membership vote/,
      );
    },
  );
  const make = async (
    amount = "80",
    title = "Fund a shared project",
    publish = true,
  ) =>
    createProposal(admin.id, {
      communityId: c.id,
      title,
      description:
        "Fund a useful shared project with measurable community outcomes.",
      type: "FUNDING",
      amount,
      recipient: "Test project",
      quorumBps: 5000,
      thresholdBps: 5001,
      opensAt: new Date(Date.now() - 3600000).toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      publish,
    });
  const p = await make();
  await check(
    "one vote per eligible member and no outsider ballots",
    async () => {
      await castVote(admin.id, {
        communityId: c.id,
        proposalId: p.id,
        choice: "YES",
      });
      await assert.rejects(
        () =>
          castVote(admin.id, {
            communityId: c.id,
            proposalId: p.id,
            choice: "NO",
          }),
        /already/,
      );
      await assert.rejects(
        () =>
          castVote(outsider.id, {
            communityId: c.id,
            proposalId: p.id,
            choice: "YES",
          }),
        /active membership/,
      );
    },
  );
  await check(
    "cannot finalize a partial ballot before its deadline",
    async () => {
      await assert.rejects(
        () =>
          proposalAction(mod.id, {
            communityId: c.id,
            proposalId: p.id,
            action: "finalize",
          }),
        /Wait for the deadline/,
      );
    },
  );
  await check("voter snapshots do not expand after admission", async () => {
    const a = await db.membershipApplication.findFirstOrThrow({
      where: { communityId: c.id, userId: late.id, status: "PENDING" },
    });
    await reviewApplication(admin.id, {
      communityId: c.id,
      applicationId: a.id,
      decision: "ballot",
      reason: "Ready for member voting",
    });
    const ap = await db.proposal.findUniqueOrThrow({
      where: { applicationId: a.id },
    });
    for (const m of await active())
      await castVote(m.userId, {
        communityId: c.id,
        proposalId: ap.id,
        choice: "YES",
      });
    await proposalAction(admin.id, {
      communityId: c.id,
      proposalId: ap.id,
      action: "finalize",
    });
    await assert.rejects(
      () =>
        castVote(late.id, {
          communityId: c.id,
          proposalId: p.id,
          choice: "YES",
        }),
      /snapshot/,
    );
  });
  await check("votes and audit events are database-immutable", async () => {
    const v = await db.vote.findFirstOrThrow({ where: { proposalId: p.id } });
    await assert.rejects(
      () => db.vote.update({ where: { id: v.id }, data: { choice: "NO" } }),
      /immutable/,
    );
    const a = await db.auditEvent.findFirstOrThrow({
      where: { communityId: c.id },
    });
    await assert.rejects(
      () => db.auditEvent.delete({ where: { id: a.id } }),
      /immutable/,
    );
  });
  await check("votes are rejected after the closing time", async () => {
    const closed = await make("1", "An expired voting window", false);
    await db.proposal.update({
      where: { id: closed.id },
      data: {
        status: "OPEN",
        closesAt: new Date(Date.now() - 1000),
        eligibleVoters: {
          create: (await active()).map((m) => ({ userId: m.userId })),
        },
      },
    });
    await assert.rejects(
      () =>
        castVote(member.id, {
          communityId: c.id,
          proposalId: closed.id,
          choice: "YES",
        }),
      /not open/,
    );
  });
  await check(
    "administrator cannot leave or lose active membership",
    async () => {
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: admin.id,
            action: "leave",
          }),
        /Transfer/,
      );
      await assert.rejects(
        () =>
          db.communityMembership.update({
            where: {
              communityId_userId: { communityId: c.id, userId: admin.id },
            },
            data: { status: "LEFT" },
          }),
        /sole administrator/,
      );
    },
  );
  await check("contribution idempotency and balanced ledger", async () => {
    const key = randomUUID();
    const first = await contribute(member.id, {
      communityId: c.id,
      amount: "100",
      idempotencyKey: key,
    });
    const second = await contribute(member.id, {
      communityId: c.id,
      amount: "100",
      idempotencyKey: key,
    });
    assert.equal(first.id, second.id);
    await assert.rejects(
      () =>
        contribute(member.id, {
          communityId: c.id,
          amount: "101",
          idempotencyKey: key,
        }),
      /already used/,
    );
    const tx = await db.ledgerTransaction.findUniqueOrThrow({
      where: { id: first.id },
      include: { entries: true },
    });
    assert.equal(
      tx.entries.reduce((sum, e) => sum + e.amount, 0n),
      0n,
    );
    assert.equal(tx.entries.length, 2);
  });
  await check("cross-community proposal IDs cannot be used", async () => {
    const other = await createCommunity(outsider.id, {
      name: "Other collective",
      slug: "other-collective",
      description: "A second isolated community for object access checks.",
      purpose: "Validate isolation between communities.",
      currency: "USD",
      minimumContribution: "0",
      questions: "",
    });
    await assert.rejects(
      () =>
        proposalAction(outsider.id, {
          communityId: other.id,
          proposalId: p.id,
          action: "finalize",
        }),
      /not found/,
    );
  });
  const approve = async (id: string) => {
    const voters = await db.eligibleVoter.findMany({
      where: { proposalId: id },
    });
    for (const v of voters)
      if (
        !(await db.vote.findUnique({
          where: { proposalId_userId: { proposalId: id, userId: v.userId } },
        }))
      )
        await castVote(v.userId, {
          communityId: c.id,
          proposalId: id,
          choice: "YES",
        });
    await proposalAction(mod.id, {
      communityId: c.id,
      proposalId: id,
      action: "finalize",
    });
  };
  await approve(p.id);
  const p2 = await make(
    "80",
    "A second allocation competes for the same funds",
  );
  await approve(p2.id);
  let executedId = "";
  await check(
    "concurrent spending is atomic and rejects overspending",
    async () => {
      const results = await Promise.allSettled(
        [p, p2].map((q) =>
          proposalAction(mod.id, {
            communityId: c.id,
            proposalId: q.id,
            action: "execute",
          }),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const failed = results.find(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult;
      assert.match(failed.reason.message, /enough available funds/);
      executedId = (
        await db.proposal.findFirstOrThrow({
          where: { communityId: c.id, status: "EXECUTED" },
        })
      ).id;
      const treasury = await db.treasuryAccount.findUniqueOrThrow({
        where: { communityId_kind: { communityId: c.id, kind: "TREASURY" } },
      });
      assert.equal(treasury.balance, 2000n);
    },
  );
  await check("duplicate payout execution returns one receipt", async () => {
    await Promise.all(
      [1, 2].map(() =>
        proposalAction(mod.id, {
          communityId: c.id,
          proposalId: executedId,
          action: "execute",
        }),
      ),
    );
    assert.equal(
      await db.fundingExecution.count({ where: { proposalId: executedId } }),
      1,
    );
    assert.equal(
      await db.ledgerTransaction.count({ where: { proposalId: executedId } }),
      1,
    );
  });
  await check(
    "database rejects balance drift and unbalanced financial records",
    async () => {
      const account = await db.treasuryAccount.findUniqueOrThrow({
        where: { communityId_kind: { communityId: c.id, kind: "TREASURY" } },
      });
      await assert.rejects(
        () =>
          db.treasuryAccount.update({
            where: { id: account.id },
            data: { balance: 999999n },
          }),
        /balance must equal/,
      );
      const source = await db.treasuryAccount.findUniqueOrThrow({
        where: { communityId_kind: { communityId: c.id, kind: "EXTERNAL" } },
      });
      await assert.rejects(
        () =>
          atomic(async (tx) => {
            await tx.ledgerTransaction.create({
              data: {
                communityId: c.id,
                initiatedById: admin.id,
                amount: 100n,
                currency: "USD",
                type: "CONTRIBUTION",
                idempotencyKey: randomUUID(),
                sourceAccount: source.id,
                destinationAccount: account.id,
              },
            });
          }),
        /balanced entries/,
      );
    },
  );
  await check(
    "removal requires two-thirds and retains financial history",
    async () => {
      const removal = await createProposal(admin.id, {
        communityId: c.id,
        title: "Formal membership removal decision",
        description:
          "Consider this formal membership removal with the exact two-thirds threshold.",
        type: "REMOVAL",
        amount: "0",
        targetUserId: late.id,
        quorumBps: 5000,
        thresholdBps: 5001,
        opensAt: new Date(Date.now() - 3600000).toISOString(),
        closesAt: new Date(Date.now() + 86400000).toISOString(),
        publish: true,
      });
      await castVote(admin.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "YES",
      });
      await castVote(mod.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "YES",
      });
      await castVote(member.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "NO",
      });
      await proposalAction(admin.id, {
        communityId: c.id,
        proposalId: removal.id,
        action: "finalize",
      });
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: c.id, userId: late.id },
            },
          })
        ).status,
        "REMOVED",
      );
      assert.ok(
        (await db.vote.count({ where: { userId: late.id } })) > 0,
        "Removed members retain their historical ballots",
      );
      assert.ok(
        (await db.ledgerTransaction.count({ where: { communityId: c.id } })) >
          0,
      );
    },
  );
  await check(
    "secure administrator transfer preserves exactly one administrator",
    async () => {
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: member.id,
            action: "transfer",
            confirmName: "wrong",
          }),
        /exact community/,
      );
      await manageMember(admin.id, {
        communityId: c.id,
        userId: member.id,
        action: "transfer",
        confirmName: c.name,
      });
      assert.equal(
        (await db.community.findUniqueOrThrow({ where: { id: c.id } })).adminId,
        member.id,
      );
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: mod.id,
            action: "member",
          }),
        /administrator/,
      );
    },
  );
  await check("every account reconciles and audit trail exists", async () => {
    for (const a of await db.treasuryAccount.findMany({
      where: { communityId: c.id },
      include: { entries: true },
    }))
      assert.equal(
        a.balance,
        a.entries.reduce((s, e) => s + e.amount, 0n),
      );
    assert.ok(
      (await db.auditEvent.count({ where: { communityId: c.id } })) > 25,
    );
  });
  await check(
    "administrator membership cannot be deleted directly",
    async () => {
      await assert.rejects(
        () =>
          db.communityMembership.delete({
            where: {
              communityId_userId: { communityId: c.id, userId: member.id },
            },
          }),
        /sole administrator/,
      );
    },
  );
  await check(
    "emergency suspension opens a mandatory community review",
    async () => {
      await assert.rejects(
        () =>
          manageMember(mod.id, {
            communityId: c.id,
            userId: member.id,
            action: "suspend",
            reason: "A detailed emergency safety concern for review.",
          }),
        /administrator/,
      );
      await manageMember(mod.id, {
        communityId: c.id,
        userId: admin.id,
        action: "suspend",
        reason: "A detailed emergency safety concern requiring review.",
      });
      const review = await db.proposal.findFirstOrThrow({
        where: { communityId: c.id, type: "SUSPENSION_REVIEW", status: "OPEN" },
      });
      await assert.rejects(
        () =>
          proposalAction(mod.id, {
            communityId: c.id,
            proposalId: review.id,
            action: "cancel",
            reason: "Cannot bypass a required safety review.",
          }),
        /must be decided/,
      );
      await assert.rejects(
        () =>
          castVote(admin.id, {
            communityId: c.id,
            proposalId: review.id,
            choice: "YES",
          }),
        /active membership/,
      );
      for (const voter of await db.eligibleVoter.findMany({
        where: { proposalId: review.id },
      }))
        await castVote(voter.userId, {
          communityId: c.id,
          proposalId: review.id,
          choice: "YES",
        });
      await proposalAction(member.id, {
        communityId: c.id,
        proposalId: review.id,
        action: "finalize",
      });
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: c.id, userId: admin.id },
            },
          })
        ).status,
        "ACTIVE",
      );
    },
  );
  await check(
    "governance changes affect future admission and submission policy",
    async () => {
      const change = await createProposal(member.id, {
        communityId: c.id,
        title: "Change future membership and proposal rules",
        description:
          "Use recorded staff admission review and limit proposal submissions to staff going forward.",
        type: "GOVERNANCE",
        amount: "0",
        quorumBps: 5000,
        thresholdBps: 5001,
        opensAt: new Date(Date.now() - 3600000).toISOString(),
        closesAt: new Date(Date.now() + 86400000).toISOString(),
        publish: true,
        allowMemberProposals: false,
        admissionPolicy: "REVIEW",
      });
      for (const voter of await db.eligibleVoter.findMany({
        where: { proposalId: change.id },
      }))
        await castVote(voter.userId, {
          communityId: c.id,
          proposalId: change.id,
          choice: "YES",
        });
      await proposalAction(member.id, {
        communityId: c.id,
        proposalId: change.id,
        action: "finalize",
      });
      assert.equal(
        (
          await db.governancePolicy.findUniqueOrThrow({
            where: { communityId: c.id },
          })
        ).admissionPolicy,
        "REVIEW",
      );
      const application = await apply(outsider.id);
      await reviewApplication(mod.id, {
        communityId: c.id,
        applicationId: application.id,
        decision: "approve",
        reason: "Approved under the newly voted staff review policy.",
      });
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: c.id, userId: outsider.id },
            },
          })
        ).status,
        "ACTIVE",
      );
      await assert.rejects(
        () =>
          createProposal(outsider.id, {
            communityId: c.id,
            title: "A member proposal after the rule change",
            description:
              "This should be rejected because member submissions are now disabled.",
            type: "FUNDING",
            amount: "1",
            recipient: "Test",
            quorumBps: 5000,
            thresholdBps: 5001,
            opensAt: new Date().toISOString(),
            closesAt: new Date(Date.now() + 86400000).toISOString(),
            publish: true,
          }),
        /Member submissions are disabled/,
      );
    },
  );
  await check("analytics reconcile to the immutable ledger", async () => {
    const r = await getAnalytics(
      member.id,
      parseFilters({ community: c.slug, range: "all" }),
    );
    assert.equal(r.money.length, 1);
    assert.equal(r.money[0].incoming, 10000n);
    assert.equal(r.money[0].outgoing, 8000n);
    assert.equal(r.money[0].closing, 2000n);
    assert.equal(r.money[0].current, 2000n);
    assert.equal(r.money[0].trend.at(-1)?.balance, 2000n);
  });
  await check(
    "analytics reject cross-community scopes and record inspection",
    async () => {
      await assert.rejects(
        () => getAnalytics(people[5].id, parseFilters({ community: c.slug })),
        /active communities/,
      );
      const r = await getAnalytics(
        people[5].id,
        parseFilters({ range: "all" }),
      );
      assert.equal(r.transactions.length, 0);
      const tx = await db.ledgerTransaction.findFirstOrThrow({
        where: { communityId: c.id },
      });
      await assert.rejects(
        () => inspectAnalyticsRecord(people[5].id, "transactions", tx.id),
        /not found/,
      );
    },
  );
  await check(
    "dashboard preferences and saved analyses are owned by the authenticated user",
    async () => {
      await saveDashboardPreference(member.id, {
        widgets: ["treasury", "votes"],
      });
      assert.deepEqual(
        (
          await db.dashboardPreference.findUniqueOrThrow({
            where: { userId: member.id },
          })
        ).widgets,
        ["treasury", "votes"],
      );
      await assert.rejects(() =>
        saveDashboardPreference(member.id, {
          widgets: ["treasury", "treasury"],
        }),
      );
      const view = await saveAnalyticsView(member.id, {
        name: "My funding view",
        section: "treasury",
        filters: parseFilters({ community: c.slug, range: "all" }),
      });
      const another = await getAnalytics(
        mod.id,
        parseFilters({ community: c.slug, range: "all" }),
      );
      assert.ok(!another.savedViews.some((v) => v.id === view.id));
      await assert.rejects(
        () =>
          saveAnalyticsView(people[5].id, {
            name: "Forbidden report",
            filters: parseFilters({ community: c.slug }),
          }),
        /active communities/,
      );
    },
  );
  await check(
    "analytics never combine currencies or miss events from another currency community",
    async () => {
      const eur = await createCommunity(admin.id, {
        name: "Euro collective",
        slug: "euro-collective",
        description: "A separate euro treasury to verify currency isolation.",
        purpose: "Verify exact currency grouping and vote event populations.",
        currency: "EUR",
        minimumContribution: "0",
        questions: "",
      });
      await contribute(admin.id, {
        communityId: eur.id,
        amount: "12.34",
        idempotencyKey: randomUUID(),
      });
      const p = await createProposal(admin.id, {
        communityId: eur.id,
        title: "An earlier euro decision with a new ballot",
        description:
          "An earlier decision can receive a vote in the current reporting window.",
        type: "FUNDING",
        amount: "1",
        recipient: "A euro project",
        quorumBps: 5000,
        thresholdBps: 5001,
        opensAt: new Date(Date.now() - 3600000).toISOString(),
        closesAt: new Date(Date.now() + 86400000).toISOString(),
        publish: false,
      });
      await db.proposal.update({
        where: { id: p.id },
        data: { createdAt: new Date(Date.now() - 60 * 86400000) },
      });
      await proposalAction(admin.id, {
        communityId: eur.id,
        proposalId: p.id,
        action: "open",
      });
      const vote = await castVote(admin.id, {
        communityId: eur.id,
        proposalId: p.id,
        choice: "YES",
      });
      const all = await getAnalytics(admin.id, parseFilters({ range: "all" }));
      assert.equal(all.money.find((m) => m.currency === "USD")?.current, 2000n);
      assert.equal(all.money.find((m) => m.currency === "EUR")?.current, 1234n);
      const events = await getAnalytics(
        admin.id,
        parseFilters({ range: "30d", dataset: "votes" }),
      );
      assert.ok(reportRecords(events).some((v) => v.id === vote.id));
      assert.equal(
        events.activityTrend.reduce((sum, p) => sum + p.votes, 0),
        events.votes.length,
      );
      const cohort = await getAnalytics(
        admin.id,
        parseFilters({ range: "30d", dataset: "votes", cohort: "decisions" }),
      );
      assert.ok(!reportRecords(cohort).some((v) => v.id === vote.id));
    },
  );
  console.log(`\n${passed} PostgreSQL integrity/security checks passed.`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
