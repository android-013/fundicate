import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import {
  applyForMembership,
  castVote,
  createCommunity,
  createProposal,
  declareContribution,
  manageMember,
  proposalAction,
  reviewApplication,
} from "../src/lib/service";

export async function runGovernanceProfileChecks(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Governance checks require an isolated test database",
  );
  const prefix = `gov${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const people = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      db.user.create({
        data: {
          email: `${prefix}${index}@test.invalid`,
          username: `${prefix}${index}`,
          displayName: `Governance ${index}`,
          passwordHash: "isolated-fixture-not-for-login",
        },
      }),
    ),
  );
  const [
    admin,
    successor,
    member,
    dissent,
    outsider,
    inactive,
    applicant,
    legacyMember,
  ] = people;
  const base = {
    name: "Governance collective",
    slug: `${prefix}-strict`,
    description: "An isolated collective verifying published governance rules.",
    purpose:
      "Make collective decisions with preserved and honest membership records.",
    currency: "USD",
    minimumContribution: "10",
    questions: "Why join?\nWhat will you offer?",
  };
  const strictInput = {
    ...base,
    governanceProfile: "STRICT",
    founderContribution: "25.29",
    founderIntroduction:
      "I am founding this collective to support member-led projects.",
    founderAnswers:
      "I want to build useful projects.\nI can contribute research and time.",
  };
  await check(
    "strict creation requires the founder's own declaration, introduction and matching answers",
    async () => {
      await assert.rejects(() =>
        createCommunity(admin.id, { ...base, governanceProfile: "STRICT" }),
      );
      await assert.rejects(() =>
        createCommunity(admin.id, { ...strictInput, founderContribution: "9" }),
      );
      await assert.rejects(() =>
        createCommunity(admin.id, {
          ...strictInput,
          founderAnswers: "Only one answer",
        }),
      );
    },
  );
  const c = await createCommunity(admin.id, strictInput);
  const legacy = await createCommunity(admin.id, {
    ...base,
    slug: `${prefix}-legacy`,
    questions: "",
  });
  const questions = await db.membershipQuestion.findMany({
    where: { communityId: c.id },
  });
  const active = () =>
    db.communityMembership.findMany({
      where: { communityId: c.id, status: "ACTIVE" },
    });
  const apply = (userId: string, pledge = "12.34") =>
    applyForMembership(userId, {
      communityId: c.id,
      introduction:
        "I want to help this collective with useful shared projects.",
      proposedContribution: pledge,
      answers: Object.fromEntries(
        questions.map((question) => [
          question.id,
          "I will contribute time and constructive participation.",
        ]),
      ),
    });
  const admit = async (userId: string) => {
    const app = await apply(userId);
    await reviewApplication(admin.id, {
      communityId: c.id,
      applicationId: app.id,
      decision: "ballot",
      reason: "Reviewed the complete application.",
    });
    const ballot = await db.proposal.findUniqueOrThrow({
      where: { applicationId: app.id },
    });
    for (const voter of await active())
      await castVote(voter.userId, {
        communityId: c.id,
        proposalId: ballot.id,
        choice: "YES",
      });
    await proposalAction(admin.id, {
      communityId: c.id,
      proposalId: ballot.id,
      action: "finalize",
    });
    return ballot;
  };
  const proposalInput = (extra: Record<string, unknown> = {}) => ({
    communityId: c.id,
    title: "Published member decision",
    description:
      "A detailed proposal for a member-governed community decision.",
    type: "FUNDRAISING",
    amount: "20",
    quorumBps: 10000,
    thresholdBps: 5001,
    opensAt: new Date(Date.now() - 1000).toISOString(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
    publish: true,
    ...extra,
  });
  await check(
    "strict founder bootstrap records actual pledge and answers without inventing a ballot or funds",
    async () => {
      assert.equal(c.governanceProfile, "STRICT");
      const membership = await db.communityMembership.findUniqueOrThrow({
        where: { communityId_userId: { communityId: c.id, userId: admin.id } },
      });
      assert.equal(membership.declaredContribution, 2529n);
      assert.ok(membership.declaredAt);
      const app = await db.membershipApplication.findFirstOrThrow({
        where: { communityId: c.id, userId: admin.id },
        include: { answers: { include: { question: true } }, proposal: true },
      });
      assert.equal(app.status, "APPROVED");
      assert.equal(app.proposedContribution, 2529n);
      assert.equal(app.proposal, null);
      assert.deepEqual(
        Object.fromEntries(
          app.answers.map((answer) => [answer.question.prompt, answer.answer]),
        ),
        {
          "Why join?": "I want to build useful projects.",
          "What will you offer?": "I can contribute research and time.",
        },
      );
      assert.equal(
        await db.ledgerTransaction.count({ where: { communityId: c.id } }),
        0,
      );
      assert.equal(
        (
          await db.treasuryAccount.findMany({ where: { communityId: c.id } })
        ).every((account) => account.balance === 0n),
        true,
      );
      assert.ok(
        await db.auditEvent.findFirst({
          where: { communityId: c.id, action: "FOUNDER_DECLARATION_RECORDED" },
        }),
      );
    },
  );
  await check(
    "legacy defaults preserve unknown founder declarations and avoid fabricated historical applications",
    async () => {
      assert.equal(legacy.governanceProfile, "LEGACY");
      const membership = await db.communityMembership.findUniqueOrThrow({
        where: {
          communityId_userId: { communityId: legacy.id, userId: admin.id },
        },
      });
      assert.equal(membership.declaredContribution, null);
      assert.equal(membership.declaredAt, null);
      assert.equal(
        await db.membershipApplication.count({
          where: { communityId: legacy.id },
        }),
        0,
      );
    },
  );
  await check(
    "unknown legacy declarations are prospective, minimum-bound, immutable and idempotent",
    async () => {
      await assert.rejects(
        () =>
          declareContribution(outsider.id, {
            communityId: legacy.id,
            amount: "12",
          }),
        /active membership/i,
      );
      await assert.rejects(
        () =>
          declareContribution(admin.id, {
            communityId: legacy.id,
            amount: "9.99",
          }),
        /minimum/i,
      );
      const [declared, simultaneous] = await Promise.all([
        declareContribution(admin.id, {
          communityId: legacy.id,
          amount: "12.34",
        }),
        declareContribution(admin.id, {
          communityId: legacy.id,
          amount: "12.34",
        }),
      ]);
      assert.equal(
        simultaneous.declaredAt?.toISOString(),
        declared.declaredAt?.toISOString(),
      );
      const replay = await declareContribution(admin.id, {
        communityId: legacy.id,
        amount: "12.34",
      });
      assert.equal(declared.declaredContribution, 1234n);
      assert.equal(
        replay.declaredAt?.toISOString(),
        declared.declaredAt?.toISOString(),
      );
      await assert.rejects(
        () =>
          declareContribution(admin.id, {
            communityId: legacy.id,
            amount: "13",
          }),
        (error: unknown) => (error as { status?: number }).status === 409,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { communityId: legacy.id, action: "CONTRIBUTION_DECLARED" },
        }),
        1,
      );
      assert.equal(
        await db.ledgerTransaction.count({ where: { communityId: legacy.id } }),
        0,
      );
    },
  );
  await check(
    "strict admission denies both unilateral staff decisions and stores the actual approved pledge",
    async () => {
      const app = await apply(successor.id);
      for (const decision of ["approve", "reject"])
        await assert.rejects(
          () =>
            reviewApplication(admin.id, {
              communityId: c.id,
              applicationId: app.id,
              decision,
              reason: "Staff must follow the published majority ballot.",
            }),
          /requires a membership vote/i,
        );
      await reviewApplication(admin.id, {
        communityId: c.id,
        applicationId: app.id,
        decision: "ballot",
        reason: "A complete membership application.",
      });
      const ballot = await db.proposal.findUniqueOrThrow({
        where: { applicationId: app.id },
      });
      assert.equal(ballot.governanceProfile, "STRICT");
      assert.equal(ballot.thresholdBps, 5001);
      await castVote(admin.id, {
        communityId: c.id,
        proposalId: ballot.id,
        choice: "YES",
      });
      await proposalAction(admin.id, {
        communityId: c.id,
        proposalId: ballot.id,
        action: "finalize",
      });
      const membership = await db.communityMembership.findUniqueOrThrow({
        where: {
          communityId_userId: { communityId: c.id, userId: successor.id },
        },
      });
      assert.equal(membership.declaredContribution, 1234n);
      assert.ok(membership.declaredAt);
    },
  );
  await admit(member.id);
  await admit(dissent.id);
  await db.communityMembership.create({
    data: { communityId: c.id, userId: inactive.id, status: "LEFT" },
  });
  await check(
    "database guards preserve profile and declarations and require honest strict activation",
    async () => {
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Community" SET "governanceProfile" = 'LEGACY' WHERE id = ${c.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Community" SET "governanceProfile" = 'STRICT' WHERE id = ${legacy.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "CommunityMembership" SET "declaredContribution" = 3000 WHERE "communityId" = ${c.id}::uuid AND "userId" = ${admin.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "CommunityMembership" SET "declaredContribution" = NULL, "declaredAt" = NULL WHERE "communityId" = ${c.id}::uuid AND "userId" = ${admin.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "CommunityMembership" SET "declaredContribution" = 1000 WHERE "communityId" = ${c.id}::uuid AND "userId" = ${inactive.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "CommunityMembership" SET "declaredContribution" = -1, "declaredAt" = CURRENT_TIMESTAMP WHERE "communityId" = ${c.id}::uuid AND "userId" = ${inactive.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "CommunityMembership" SET status = 'ACTIVE' WHERE "communityId" = ${c.id}::uuid AND "userId" = ${inactive.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`INSERT INTO "CommunityMembership" (id, "communityId", "userId", status) VALUES (${randomUUID()}::uuid, ${c.id}::uuid, ${outsider.id}::uuid, 'ACTIVE')`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`INSERT INTO "CommunityMembership" (id, "communityId", "userId", status, "declaredContribution", "declaredAt") VALUES (${randomUUID()}::uuid, ${c.id}::uuid, ${outsider.id}::uuid, 'ACTIVE', 999, CURRENT_TIMESTAMP)`,
      );
      assert.equal(
        (await db.community.findUniqueOrThrow({ where: { id: c.id } }))
          .governanceProfile,
        "STRICT",
      );
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: c.id, userId: admin.id },
            },
          })
        ).declaredContribution,
        2529n,
      );
    },
  );
  await check(
    "strict governance rejects REVIEW changes, emergency voter suspension and published ballot cancellation",
    async () => {
      await assert.rejects(
        () =>
          createProposal(
            admin.id,
            proposalInput({
              type: "GOVERNANCE",
              allowMemberProposals: true,
              admissionPolicy: "REVIEW",
            }),
          ),
        /majority vote/i,
      );
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: member.id,
            action: "suspend",
            reason:
              "This reason cannot authorize strict unilateral suspension.",
          }),
        /cannot unilaterally suspend/i,
      );
      const p = await createProposal(admin.id, proposalInput());
      await assert.rejects(
        () =>
          proposalAction(admin.id, {
            communityId: c.id,
            proposalId: p.id,
            action: "cancel",
            reason: "The incumbent wants the ballot cancelled.",
          }),
        /decided by the community/i,
      );
      assert.equal(
        (await db.proposal.findUniqueOrThrow({ where: { id: p.id } })).status,
        "OPEN",
      );
    },
  );
  await db.governancePolicy.update({
    where: { communityId: c.id },
    data: { allowMemberProposals: false },
  });
  await check(
    "strict removal remains available to ordinary members when other member submissions are disabled",
    async () => {
      await assert.rejects(
        () => createProposal(member.id, proposalInput()),
        /submissions are disabled/i,
      );
      for (const successorId of ["", admin.id, outsider.id, inactive.id])
        await assert.rejects(
          () =>
            createProposal(
              member.id,
              proposalInput({
                type: "REMOVAL",
                targetUserId: admin.id,
                successorId,
                publish: false,
              }),
            ),
          /successor|different active member/i,
        );
    },
  );
  await check(
    "a member facing an open removal cannot become the published administrator successor",
    async () => {
      const removal = await createProposal(
        member.id,
        proposalInput({
          type: "REMOVAL",
          targetUserId: successor.id,
          publish: false,
        }),
      );
      assert.equal(
        (await db.proposal.findUniqueOrThrow({ where: { id: removal.id } }))
          .status,
        "OPEN",
      );
      await assert.rejects(
        () =>
          createProposal(
            member.id,
            proposalInput({
              type: "REMOVAL",
              targetUserId: admin.id,
              successorId: successor.id,
            }),
          ),
        /facing an open removal/i,
      );
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: successor.id,
            action: "transfer",
            confirmName: c.name,
          }),
        /facing an open removal/i,
      );
      for (const voter of await db.eligibleVoter.findMany({
        where: { proposalId: removal.id },
      }))
        await castVote(voter.userId, {
          communityId: c.id,
          proposalId: removal.id,
          choice: "NO",
        });
      await proposalAction(member.id, {
        communityId: c.id,
        proposalId: removal.id,
        action: "finalize",
      });
      assert.equal(
        (await db.proposal.findUniqueOrThrow({ where: { id: removal.id } }))
          .status,
        "REJECTED",
      );
    },
  );
  const removal = await createProposal(
    member.id,
    proposalInput({
      type: "REMOVAL",
      targetUserId: admin.id,
      successorId: successor.id,
      publish: false,
    }),
  );
  await check(
    "published strict succession freezes nominee and incumbent authority while allowing member control",
    async () => {
      const p = await db.proposal.findUniqueOrThrow({
        where: { id: removal.id },
        include: { eligibleVoters: true },
      });
      assert.equal(p.status, "OPEN");
      assert.equal(p.successorId, successor.id);
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "governanceProfile" = 'LEGACY' WHERE id = ${p.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "successorId" = ${dissent.id}::uuid WHERE id = ${p.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "targetUserId" = ${member.id}::uuid WHERE id = ${p.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "thresholdBps" = 5001 WHERE id = ${p.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "quorumBps" = 1 WHERE id = ${p.id}::uuid`,
      );
      await assert.rejects(
        () =>
          db.$executeRaw`UPDATE "Proposal" SET "closesAt" = "closesAt" + INTERVAL '1 day' WHERE id = ${p.id}::uuid`,
      );
      assert.equal(p.eligibleVoters.length, 3);
      assert.equal(
        p.eligibleVoters.some((voter) => voter.userId === admin.id),
        false,
      );
      await assert.rejects(
        () =>
          createProposal(
            dissent.id,
            proposalInput({
              type: "REMOVAL",
              targetUserId: admin.id,
              successorId: dissent.id,
            }),
          ),
        /already open/i,
      );
      await assert.rejects(
        () =>
          manageMember(admin.id, {
            communityId: c.id,
            userId: dissent.id,
            action: "transfer",
            confirmName: c.name,
          }),
        /locked/i,
      );
      await assert.rejects(
        () =>
          manageMember(successor.id, {
            communityId: c.id,
            userId: successor.id,
            action: "leave",
          }),
        /successor cannot leave/i,
      );
      await assert.rejects(
        () =>
          createProposal(
            member.id,
            proposalInput({ type: "REMOVAL", targetUserId: successor.id }),
          ),
        /successor is protected/i,
      );
      await assert.rejects(
        () =>
          castVote(admin.id, {
            communityId: c.id,
            proposalId: p.id,
            choice: "NO",
          }),
        /eligibility snapshot/i,
      );
      await assert.rejects(
        () =>
          proposalAction(admin.id, {
            communityId: c.id,
            proposalId: p.id,
            action: "cancel",
            reason: "An incumbent cannot veto this removal vote.",
          }),
        /decided by the community/i,
      );
    },
  );
  await check(
    "exact two-thirds member approval atomically removes the administrator and installs the published successor",
    async () => {
      await castVote(successor.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "YES",
      });
      await castVote(member.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "YES",
      });
      await castVote(dissent.id, {
        communityId: c.id,
        proposalId: removal.id,
        choice: "NO",
      });
      const result = await proposalAction(member.id, {
        communityId: c.id,
        proposalId: removal.id,
        action: "finalize",
      });
      assert.equal("approved" in result && result.approved, true);
      const current = await db.community.findUniqueOrThrow({
        where: { id: c.id },
      });
      assert.equal(current.adminId, successor.id);
      const old = await db.communityMembership.findUniqueOrThrow({
        where: { communityId_userId: { communityId: c.id, userId: admin.id } },
      });
      assert.equal(old.status, "REMOVED");
      assert.equal(old.declaredContribution, 2529n);
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: c.id, userId: successor.id },
            },
          })
        ).status,
        "ACTIVE",
      );
      assert.ok(
        await db.auditEvent.findFirst({
          where: { communityId: c.id, action: "GOVERNED_ADMIN_SUCCESSION" },
        }),
      );
    },
  );
  await check(
    "legacy REVIEW, emergency suspension and direct authority transfer remain available",
    async () => {
      await db.governancePolicy.update({
        where: { communityId: legacy.id },
        data: { admissionPolicy: "REVIEW" },
      });
      for (const userId of [legacyMember.id, applicant.id]) {
        const app = await applyForMembership(userId, {
          communityId: legacy.id,
          introduction: "I want to participate in this legacy collective.",
          proposedContribution: "15",
          answers: {},
        });
        await reviewApplication(admin.id, {
          communityId: legacy.id,
          applicationId: app.id,
          decision: "approve",
          reason: "Complete legacy staff review.",
        });
      }
      const accepted = await db.communityMembership.findUniqueOrThrow({
        where: {
          communityId_userId: {
            communityId: legacy.id,
            userId: legacyMember.id,
          },
        },
      });
      assert.equal(accepted.declaredContribution, 1500n);
      await manageMember(admin.id, {
        communityId: legacy.id,
        userId: applicant.id,
        action: "suspend",
        reason: "A documented emergency safety concern needs member review.",
      });
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: {
                communityId: legacy.id,
                userId: applicant.id,
              },
            },
          })
        ).status,
        "SUSPENDED",
      );
      const review = await db.proposal.findFirstOrThrow({
        where: { communityId: legacy.id, type: "SUSPENSION_REVIEW" },
      });
      assert.equal(review.governanceProfile, "LEGACY");
      assert.equal(review.status, "OPEN");
      await manageMember(admin.id, {
        communityId: legacy.id,
        userId: legacyMember.id,
        action: "transfer",
        confirmName: legacy.name,
      });
      assert.equal(
        (await db.community.findUniqueOrThrow({ where: { id: legacy.id } }))
          .adminId,
        legacyMember.id,
      );
    },
  );
  await check(
    "returning strict members retain their original declaration while the new application meets the current minimum",
    async () => {
      const before = await db.communityMembership.findUniqueOrThrow({
        where: { communityId_userId: { communityId: c.id, userId: member.id } },
      });
      await manageMember(member.id, {
        communityId: c.id,
        userId: member.id,
        action: "leave",
      });
      // A fixture-only minimum change exercises the declaration/activation invariant.
      await db.community.update({
        where: { id: c.id },
        data: { minimumContribution: 10000n },
      });
      await assert.rejects(() => apply(member.id, "99.99"), /minimum/i);
      const application = await apply(member.id, "100");
      await reviewApplication(successor.id, {
        communityId: c.id,
        applicationId: application.id,
        decision: "ballot",
        reason: "The returning application meets the current minimum.",
      });
      const ballot = await db.proposal.findUniqueOrThrow({
        where: { applicationId: application.id },
      });
      for (const voter of await active())
        await castVote(voter.userId, {
          communityId: c.id,
          proposalId: ballot.id,
          choice: "YES",
        });
      await proposalAction(successor.id, {
        communityId: c.id,
        proposalId: ballot.id,
        action: "finalize",
      });
      const restored = await db.communityMembership.findUniqueOrThrow({
        where: { communityId_userId: { communityId: c.id, userId: member.id } },
      });
      assert.equal(restored.status, "ACTIVE");
      assert.equal(restored.declaredContribution, before.declaredContribution);
      assert.equal(
        restored.declaredAt?.toISOString(),
        before.declaredAt?.toISOString(),
      );
      const approved = await db.membershipApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.proposedContribution, 10000n);
      assert.equal(
        await db.ledgerTransaction.count({ where: { communityId: c.id } }),
        0,
      );
    },
  );
}
