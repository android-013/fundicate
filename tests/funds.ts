import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "../src/lib/db";
import { createCommunity, contribute } from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castSelectionVote,
} from "../src/lib/rounds";
import {
  contributeToRound,
  prepareRoundSettlement,
  processRoundSettlement,
  getRoundFinanceView,
} from "../src/lib/funded-rounds";
import { runGovernanceProfileChecks } from "./governance-profile";

const day = 24 * 60 * 60 * 1000;
const origin = process.env.APP_ORIGIN!;
let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
async function post(
  operation: string,
  body: unknown,
  cookie = "",
  status = 200,
  requestOrigin = origin,
) {
  const response = await fetch(`${origin}/api/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const json = await response.json();
  assert.equal(response.status, status, JSON.stringify(json));
  return json;
}
async function account(name: string) {
  const response = await fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: `${name}@funds.invalid`,
      username: name,
      displayName: name,
      password: "FundsSecurePassword!2026",
    }),
  });
  assert.equal(response.status, 200, await response.text());
  return {
    user: await db.user.findUniqueOrThrow({
      where: { email: `${name}@funds.invalid` },
    }),
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
type Actor = Awaited<ReturnType<typeof account>>;
function scope(communityId: string, roundId: string) {
  return { communityId, roundId };
}

async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Fund tests require an isolated database.",
  );
  const [admin, member, donor, outsider] = await Promise.all(
    ["fundadmin", "fundmember", "funddonor", "fundoutside"].map(account),
  );
  const community = await createCommunity(admin.user.id, {
    name: "Funded Futures",
    slug: "funded-futures",
    description:
      "A community for attributable funding and fair shared decisions.",
    purpose:
      "Choose useful community projects with clear money and voting rules.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  await db.communityMembership.createMany({
    data: [member, donor].map((actor) => ({
      communityId: community.id,
      userId: actor.user.id,
    })),
  });
  const cid = community.id;
  const old = new Date(Date.now() - 12 * day);
  const at = (days: number) => new Date(old.getTime() + days * day);
  const baseRound = {
    communityId: cid,
    title: "A complete dedicated funding round",
    description:
      "Choose a useful shared scheme and track each received contribution precisely.",
    proposalPolicy: "EVERYONE",
    quorumBps: 5000,
  };
  function fundedInput(now = old, overrides: Record<string, unknown> = {}) {
    return {
      ...baseRound,
      funded: true,
      fundingTarget: "1.00",
      minimumContribution: "0.01",
      maximumContribution: "1000.00",
      submissionsCloseAt: new Date(now.getTime() + day).toISOString(),
      collectionClosesAt: new Date(now.getTime() + day / 2).toISOString(),
      expiresAt: new Date(now.getTime() + 8 * day).toISOString(),
      ...overrides,
    };
  }
  async function open(overrides: Record<string, unknown> = {}, now = old) {
    const round = await createFundingRound(
      admin.user.id,
      fundedInput(now, overrides),
      now,
    );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(cid, round.id), action: "open" },
      now,
    );
    return round;
  }
  async function deposit(
    roundId: string,
    actor: Actor,
    amount: string,
    now = old,
    key = randomUUID(),
  ) {
    return contributeToRound(
      actor.user.id,
      { ...scope(cid, roundId), amount, idempotencyKey: key },
      now,
    );
  }
  async function scheme(
    roundId: string,
    amount = "1.25",
    recipient = "Shared project recipient",
    actor = outsider,
  ) {
    return submitFundingScheme(
      actor.user.id,
      {
        ...scope(cid, roundId),
        title: "A practical community scheme",
        description:
          "A detailed and practical plan with a clearly described community benefit.",
        amount,
        recipient,
        supportingUrl: "",
        category: "DONATION",
      },
      old,
    );
  }
  async function startScreen(roundId: string) {
    return fundingRoundAction(
      admin.user.id,
      { ...scope(cid, roundId), action: "screen" },
      at(1),
    );
  }
  async function qualify(
    roundId: string,
    schemeIds: string[],
    voters = [admin, member, donor],
  ) {
    for (const id of schemeIds)
      for (const actor of voters)
        await castScreeningVote(
          actor.user.id,
          { ...scope(cid, roundId), schemeId: id, choice: "YES" },
          at(1.01),
        );
    return fundingRoundAction(
      admin.user.id,
      { ...scope(cid, roundId), action: "close-screening" },
      at(2.01),
    );
  }
  async function choose(
    roundId: string,
    choices: { actor: Actor; schemeId: string }[],
  ) {
    for (const { actor, schemeId } of choices)
      await castSelectionVote(
        actor.user.id,
        { ...scope(cid, roundId), schemeId },
        at(2.02),
      );
    return fundingRoundAction(
      admin.user.id,
      { ...scope(cid, roundId), action: "close-selection" },
      at(3.02),
    );
  }
  async function reconcile(roundId: string) {
    const settlement = await db.roundSettlement.findUniqueOrThrow({
      where: { roundId },
    });
    const accounts = await db.roundAccount.findMany({
      where: { roundId },
      include: { entries: true },
    });
    const byKey = new Map(accounts.map((entry) => [entry.key, entry]));
    for (const account of accounts)
      assert.equal(
        account.balance,
        account.entries.reduce((sum, entry) => sum + entry.amount, 0n),
      );
    assert.equal(
      accounts.reduce((sum, account) => sum + account.balance, 0n),
      0n,
    );
    assert.equal(
      settlement.received,
      byKey.get("HELD")!.balance +
        byKey.get("RESERVED")!.balance +
        settlement.paid +
        settlement.refunded,
    );
    assert.equal(byKey.get("PAID")!.balance, settlement.paid);
    const transactions = await db.roundLedgerTransaction.findMany({
      where: { roundId },
      include: { entries: true },
    });
    for (const transaction of transactions) {
      assert.equal(transaction.entries.length, 2);
      assert.equal(
        transaction.entries.reduce((sum, entry) => sum + entry.amount, 0n),
        0n,
      );
      assert.equal(transaction.assetId, settlement.assetId);
    }
    return settlement;
  }

  let paidRoundId = "";
  await check(
    "STAFF, MEMBERS and EVERYONE schemes enforce roles and funded categories on the server",
    async () => {
      await assert.rejects(
        () => createFundingRound(member.user.id, fundedInput(), old),
        /moderator|administrator/,
      );
      await db.communityMembership.update({
        where: {
          communityId_userId: { communityId: cid, userId: donor.user.id },
        },
        data: { role: "MODERATOR" },
      });
      try {
        for (const policy of ["STAFF", "MEMBERS", "EVERYONE"]) {
          const round = await open({ proposalPolicy: policy });
          await scheme(round.id, "1.00", "Staff project", admin);
          await scheme(round.id, "1.00", "Moderator project", donor);
          if (policy === "STAFF")
            await assert.rejects(
              () => scheme(round.id, "1.00", "Member project", member),
              /moderator|administrator/,
            );
          else await scheme(round.id, "1.00", "Member project", member);
          if (policy === "EVERYONE") await scheme(round.id);
          else
            await assert.rejects(
              () => scheme(round.id),
              /active community members/,
            );
          await assert.rejects(
            () =>
              submitFundingScheme(
                admin.user.id,
                {
                  ...scope(cid, round.id),
                  title: "Missing funding category",
                  description:
                    "A proposal must clearly identify the kind of funding request.",
                  amount: "1.00",
                  recipient: "Category test",
                  category: "UNSPECIFIED",
                },
                old,
              ),
            /category/,
          );
        }
      } finally {
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: cid, userId: donor.user.id },
          },
          data: { role: "MEMBER" },
        });
      }
    },
  );
  await check(
    "V1 remains decision-only and cannot gain payment rights",
    async () => {
      const round = await createFundingRound(
        admin.user.id,
        { ...baseRound, submissionsCloseAt: at(1).toISOString() },
        old,
      );
      assert.equal(round.rulesVersion, 1);
      assert.equal(
        await getRoundFinanceView(cid, round.id, admin.user.id, old),
        null,
      );
      await assert.rejects(
        () => deposit(round.id, admin, "1.00"),
        /decision-only/,
      );
      await assert.rejects(
        () =>
          prepareRoundSettlement(admin.user.id, scope(cid, round.id), at(20)),
        /decision-only/,
      );
      await assert.rejects(() =>
        db.fundingRound.update({
          where: { id: round.id },
          data: { rulesVersion: 2 },
        }),
      );
      assert.equal(
        await db.roundSettlement.count({ where: { roundId: round.id } }),
        0,
      );
    },
  );
  await check(
    "new funding rejects unsupported settings, asset overrides and invalid cutoff/expiry bounds",
    async () => {
      for (const override of [
        { vetoEnabled: true },
        { selectionMethod: "GLICKO2" },
        { votingWeight: "CONTRIBUTION" },
        { allocationPolicy: "PROPORTIONAL" },
        { assetId: "NEAR" },
        { network: "mainnet" },
        { decimals: 24 },
        { minimumContribution: "0" },
        { maximumContribution: "0" },
        { collectionClosesAt: at(2).toISOString() },
        { collectionClosesAt: old.toISOString() },
        { expiresAt: at(3).toISOString() },
        { expiresAt: at(92).toISOString() },
      ])
        await assert.rejects(() =>
          createFundingRound(admin.user.id, fundedInput(old, override), old),
        );
    },
  );
  await check(
    "draft funding metadata is private and published rules/assets cannot be rewritten",
    async () => {
      const round = await createFundingRound(admin.user.id, fundedInput(), old);
      await assert.rejects(
        () => getRoundFinanceView(cid, round.id),
        (error) =>
          Boolean(
            error &&
            typeof error === "object" &&
            "status" in error &&
            error.status === 404,
          ),
      );
      await assert.rejects(() =>
        getRoundFinanceView(cid, round.id, member.user.id),
      );
      const view = await getRoundFinanceView(cid, round.id, admin.user.id, old);
      assert.equal(view!.settlement.assetId, "fiat:USD");
      assert.equal(view!.settlement.network, "local-simulation");
      await fundingRoundAction(
        admin.user.id,
        { ...scope(cid, round.id), action: "open" },
        old,
      );
      for (const data of [
        { assetId: "fiat:EUR" },
        { decimals: 24 },
        { minimumContribution: 5n },
        { rulesSnapshot: {} },
        { expiresAt: at(9) },
      ])
        await assert.rejects(() =>
          db.roundSettlement.update({ where: { roundId: round.id }, data }),
        );
    },
  );
  await check(
    "contributions enforce active ownership, first-deposit minimum, cumulative cap and positive top-ups",
    async () => {
      const round = await open({
        minimumContribution: "1.00",
        maximumContribution: "1.50",
      });
      await assert.rejects(() => deposit(round.id, outsider, "1.00"));
      await assert.rejects(() => deposit(round.id, member, "0.99"), /minimum/);
      await deposit(round.id, member, "1.00");
      await deposit(round.id, member, "0.01");
      await assert.rejects(() => deposit(round.id, member, "0"));
      await assert.rejects(() => deposit(round.id, member, "0.50"), /maximum/);
      assert.equal((await reconcile(round.id)).received, 101n);
      const source = await db.roundAccount.findUniqueOrThrow({
        where: {
          roundId_key: { roundId: round.id, key: `EXTERNAL:${member.user.id}` },
        },
      });
      assert.equal(source.ownerId, member.user.id);
      assert.equal(source.balance, -101n);
    },
  );
  await check(
    "concurrent duplicate deposits have one effect and late replay preserves the original receipt",
    async () => {
      const round = await open();
      const key = randomUUID();
      const receipts = await Promise.all(
        Array.from({ length: 4 }, () =>
          deposit(round.id, member, "1.01", old, key),
        ),
      );
      assert.equal(new Set(receipts.map((receipt) => receipt!.id)).size, 1);
      assert.equal((await reconcile(round.id)).received, 101n);
      await assert.rejects(
        () => deposit(round.id, member, "1.02", old, key),
        /different payment/,
      );
      await assert.rejects(
        () => deposit(round.id, donor, "1.01", old, key),
        /different payment/,
      );
      await assert.rejects(
        () => deposit(round.id, member, "1.00", at(0.5)),
        /not accepting/,
      );
      await db.communityMembership.update({
        where: {
          communityId_userId: { communityId: cid, userId: member.user.id },
        },
        data: { status: "LEFT" },
      });
      try {
        const replay = await deposit(round.id, member, "1.01", at(20), key);
        assert.equal(replay!.id, receipts[0]!.id);
      } finally {
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: cid, userId: member.user.id },
          },
          data: { status: "ACTIVE" },
        });
      }
    },
  );
  await check(
    "a complete FPTP funded round caps its winner and refunds exact unused principal",
    async () => {
      const round = await open();
      paidRoundId = round.id;
      await deposit(round.id, admin, "1.01");
      await deposit(round.id, member, "1.00");
      await deposit(round.id, donor, "1.00");
      const chosen = await scheme(round.id, "1.25");
      await assert.rejects(
        () => prepareRoundSettlement(admin.user.id, scope(cid, round.id), old),
        /election must finish/,
      );
      await startScreen(round.id);
      const frozen = await db.roundSettlement.findUniqueOrThrow({
        where: { roundId: round.id },
      });
      assert.equal(frozen.status, "HELD");
      assert.ok(frozen.frozenAt);
      assert.ok(Array.isArray(frozen.contributionSnapshot));
      await assert.rejects(
        () => deposit(round.id, member, "0.01", at(1)),
        /not accepting/,
      );
      await assert.rejects(() =>
        db.roundSettlement.update({
          where: { roundId: round.id },
          data: { contributionSnapshot: [] },
        }),
      );
      await qualify(round.id, [chosen.id]);
      const decision = await choose(
        round.id,
        [admin, member, donor].map((actor) => ({ actor, schemeId: chosen.id })),
      );
      assert.equal(decision.outcome, "WINNER_SELECTED");
      await assert.rejects(
        () =>
          prepareRoundSettlement(
            member.user.id,
            scope(cid, round.id),
            at(3.03),
          ),
        /Staff/,
      );
      await Promise.all(
        Array.from({ length: 3 }, () =>
          prepareRoundSettlement(admin.user.id, scope(cid, round.id), at(3.03)),
        ),
      );
      const view = await getRoundFinanceView(
        cid,
        round.id,
        member.user.id,
        at(3.04),
      );
      assert.equal(view!.settlement.status, "QUEUED");
      assert.equal(view!.totals.held, 0n);
      assert.equal(view!.totals.reserved, 301n);
      const payout = view!.operations.find((op) => op.kind === "PAYOUT")!;
      assert.equal(payout.amount, 125n);
      assert.equal(payout.recipient, chosen.recipient);
      assert.equal(payout.beneficiaryId, outsider.user.id);
      assert.equal(
        view!.operations
          .filter((op) => op.kind === "REFUND")
          .reduce((sum, op) => sum + op.amount, 0n),
        176n,
      );
      const firstWorker = spawnSync(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "tests/round-funds-worker.ts",
          admin.user.id,
          cid,
          round.id,
          at(3.04).toISOString(),
        ],
        { env: process.env, stdio: "inherit", windowsHide: true },
      );
      assert.equal(
        firstWorker.status,
        0,
        "The separate settlement worker must commit its bounded batch and exit.",
      );
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, status: "CONFIRMED" },
        }),
        1,
      );
      assert.equal((await reconcile(round.id)).status, "QUEUED");
      // A later worker uses durable intent; expiry never reinterprets a queued payout.
      await Promise.all(
        [admin, member, donor].map((actor) =>
          processRoundSettlement(actor.user.id, scope(cid, round.id), at(20)),
        ),
      );
      const final = await reconcile(round.id);
      assert.equal(final.status, "SETTLED");
      assert.equal(final.paid, 125n);
      assert.equal(final.refunded, 176n);
      const operations = await db.roundOperation.findMany({
        where: { roundId: round.id },
        include: { executionAttempts: true },
      });
      assert.equal(operations.length, 4);
      for (const operation of operations) {
        assert.equal(operation.attempts, 1);
        assert.equal(operation.executionAttempts.length, 1);
        assert.equal(operation.status, "CONFIRMED");
        assert.ok(operation.transactionId);
        assert.ok(operation.completedAt);
        if (operation.kind === "REFUND") {
          const original = await db.roundAccount.findUniqueOrThrow({
            where: { id: operation.destinationAccountId },
          });
          assert.equal(original.ownerId, operation.beneficiaryId);
          assert.equal(original.key, `EXTERNAL:${operation.beneficiaryId}`);
        }
      }
      const before = await db.roundLedgerTransaction.count({
        where: { roundId: round.id },
      });
      await processRoundSettlement(admin.user.id, scope(cid, round.id), at(30));
      await prepareRoundSettlement(admin.user.id, scope(cid, round.id), at(30));
      assert.equal(
        await db.roundLedgerTransaction.count({ where: { roundId: round.id } }),
        before,
      );
    },
  );
  await check(
    "held round money is physically absent from legacy spendable TREASURY accounts",
    async () => {
      const round = await open();
      const treasuryBefore = await db.treasuryAccount.findUniqueOrThrow({
        where: { communityId_kind: { communityId: cid, kind: "TREASURY" } },
      });
      await deposit(round.id, admin, "50.00");
      const treasuryAfter = await db.treasuryAccount.findUniqueOrThrow({
        where: { id: treasuryBefore.id },
      });
      assert.equal(treasuryAfter.balance, treasuryBefore.balance);
      assert.equal(
        await db.ledgerEntry.count({ where: { accountId: treasuryBefore.id } }),
        0,
      );
      assert.equal((await reconcile(round.id)).received, 5000n);
      assert.equal(
        await db.treasuryAccount.count({
          where: {
            id: {
              in: (
                await db.roundAccount.findMany({ where: { roundId: round.id } })
              ).map((a) => a.id),
            },
          },
        }),
        0,
      );
      await contribute(admin.user.id, {
        communityId: cid,
        amount: "1.00",
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (
          await db.treasuryAccount.findUniqueOrThrow({
            where: { id: treasuryBefore.id },
          })
        ).balance,
        treasuryBefore.balance + 100n,
      );
      assert.equal((await reconcile(round.id)).received, 5000n);
    },
  );
  await check(
    "unpayable winning recipients return the complete original pool",
    async () => {
      const round = await open();
      await deposit(round.id, member, "1.01");
      const candidate = await scheme(
        round.id,
        "1.00",
        "Invalid\u007frecipient",
      );
      await startScreen(round.id);
      await qualify(round.id, [candidate.id]);
      const decision = await choose(
        round.id,
        [admin, member, donor].map((actor) => ({
          actor,
          schemeId: candidate.id,
        })),
      );
      assert.equal(decision.outcome, "WINNER_SELECTED");
      const prepared = await prepareRoundSettlement(
        admin.user.id,
        scope(cid, round.id),
        at(3.03),
      );
      assert.equal(prepared.reason, "UNPAYABLE_RECIPIENT");
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, kind: "PAYOUT" },
        }),
        0,
      );
      await processRoundSettlement(
        member.user.id,
        scope(cid, round.id),
        at(3.04),
      );
      const final = await reconcile(round.id);
      assert.equal(final.refunded, 101n);
      assert.equal(final.paid, 0n);
    },
  );
  await check(
    "expiry refunds a decided but still unprepared winning round",
    async () => {
      const round = await open();
      await deposit(round.id, member, "1.01");
      const candidate = await scheme(round.id, "1.00");
      await startScreen(round.id);
      await qualify(round.id, [candidate.id]);
      await choose(
        round.id,
        [admin, member, donor].map((actor) => ({
          actor,
          schemeId: candidate.id,
        })),
      );
      const prepared = await prepareRoundSettlement(
        member.user.id,
        scope(cid, round.id),
        at(8),
      );
      assert.equal(prepared.reason, "EXPIRED");
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, kind: "PAYOUT" },
        }),
        0,
      );
      await processRoundSettlement(member.user.id, scope(cid, round.id), at(8));
      const final = await reconcile(round.id);
      assert.equal(final.refunded, 101n);
      assert.equal(final.paid, 0n);
    },
  );
  await check(
    "failed targets queue full refunds without giving the election payment authority",
    async () => {
      const round = await open({ fundingTarget: "2.00" });
      await deposit(round.id, member, "1.01");
      await scheme(round.id);
      const decision = await startScreen(round.id);
      assert.equal(decision.status, "DECIDED");
      assert.equal(decision.outcome, "FUNDING_FAILED");
      const settlement = await reconcile(round.id);
      assert.equal(settlement.status, "QUEUED");
      assert.equal(settlement.reason, "FUNDING_FAILED");
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, kind: "PAYOUT" },
        }),
        0,
      );
      await processRoundSettlement(
        member.user.id,
        scope(cid, round.id),
        at(1.01),
      );
      const final = await reconcile(round.id);
      assert.equal(final.refunded, 101n);
      assert.equal(final.status, "REFUNDED");
    },
  );
  await check(
    "empty and rejected-scheme rounds refund every original contribution",
    async () => {
      for (const empty of [true, false]) {
        const round = await open();
        await deposit(round.id, member, "1.00");
        const rejected = empty ? null : await scheme(round.id);
        await startScreen(round.id);
        if (rejected)
          await fundingRoundAction(
            admin.user.id,
            { ...scope(cid, round.id), action: "close-screening" },
            at(2.01),
          );
        const decision = await db.fundingRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        assert.equal(decision.outcome, "NO_QUALIFIED");
        await prepareRoundSettlement(
          admin.user.id,
          scope(cid, round.id),
          at(2.02),
        );
        await processRoundSettlement(
          admin.user.id,
          scope(cid, round.id),
          at(2.03),
        );
        const final = await reconcile(round.id);
        assert.equal(final.refunded, 100n);
        assert.equal(final.paid, 0n);
      }
    },
  );
  await check(
    "selection ties and missing quorum refund the entire pool without arbitrary winners",
    async () => {
      for (const tied of [true, false]) {
        const round = await open();
        await deposit(round.id, member, "1.00");
        const first = await scheme(round.id),
          second = await scheme(round.id);
        await startScreen(round.id);
        await qualify(round.id, [first.id, second.id]);
        const decision = await choose(
          round.id,
          tied
            ? [
                { actor: admin, schemeId: first.id },
                { actor: member, schemeId: second.id },
              ]
            : [{ actor: admin, schemeId: first.id }],
        );
        assert.equal(decision.outcome, tied ? "TIED" : "NO_QUORUM");
        await prepareRoundSettlement(
          admin.user.id,
          scope(cid, round.id),
          at(3.03),
        );
        await processRoundSettlement(
          admin.user.id,
          scope(cid, round.id),
          at(3.04),
        );
        const final = await reconcile(round.id);
        assert.equal(final.refunded, 100n);
        assert.equal(final.paid, 0n);
      }
    },
  );
  await check(
    "zero-received failed targets close safely without zero-value operations",
    async () => {
      const round = await open();
      await startScreen(round.id);
      const final = await reconcile(round.id);
      assert.equal(final.status, "REFUNDED");
      assert.equal(final.received, 0n);
      assert.equal(
        await db.roundOperation.count({ where: { roundId: round.id } }),
        0,
      );
    },
  );
  await check(
    "an original contributor recovers expired unresolved funds after leaving, with no redirection",
    async () => {
      const round = await open();
      await deposit(round.id, member, "1.01");
      await db.communityMembership.update({
        where: {
          communityId_userId: { communityId: cid, userId: member.user.id },
        },
        data: { status: "LEFT" },
      });
      try {
        await assert.rejects(
          () =>
            prepareRoundSettlement(
              member.user.id,
              scope(cid, round.id),
              at(7.99),
            ),
          /Staff/,
        );
        await assert.rejects(
          () =>
            prepareRoundSettlement(
              outsider.user.id,
              scope(cid, round.id),
              at(8),
            ),
          /Staff/,
        );
        await assert.rejects(() =>
          prepareRoundSettlement(
            member.user.id,
            { ...scope(cid, round.id), recipient: "redirect" },
            at(8),
          ),
        );
        const view = await getRoundFinanceView(
          cid,
          round.id,
          member.user.id,
          at(8),
        );
        assert.equal(view!.canRecover, true);
        const prepared = await prepareRoundSettlement(
          member.user.id,
          scope(cid, round.id),
          at(8),
        );
        assert.equal(prepared.reason, "EXPIRED");
        await processRoundSettlement(
          member.user.id,
          scope(cid, round.id),
          at(8),
        );
        const final = await reconcile(round.id);
        assert.equal(final.refunded, 101n);
        assert.equal(final.paid, 0n);
        const own = await getRoundFinanceView(
          cid,
          round.id,
          member.user.id,
          at(8),
        );
        assert.equal(own!.ownRefunded, 101n);
      } finally {
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: cid, userId: member.user.id },
          },
          data: { status: "ACTIVE" },
        });
      }
    },
  );
  await check(
    "a failed local execution durably records failure and retries the same immutable operation once",
    async () => {
      const round = await open();
      await deposit(round.id, member, "1.00");
      await startScreen(round.id);
      await prepareRoundSettlement(admin.user.id, scope(cid, round.id), at(2));
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fundicate_test_fail_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'REFUND' THEN RAISE EXCEPTION 'isolated test adapter failure'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER fundicate_test_fail_refund BEFORE INSERT ON "RoundLedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_test_fail_refund()`,
      );
      try {
        await assert.rejects(() =>
          processRoundSettlement(admin.user.id, scope(cid, round.id), at(2.01)),
        );
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER fundicate_test_fail_refund ON "RoundLedgerTransaction"`,
        );
        await db.$executeRawUnsafe(
          `DROP FUNCTION fundicate_test_fail_refund()`,
        );
      }
      const failed = await db.roundOperation.findFirstOrThrow({
        where: { roundId: round.id },
      });
      assert.equal(failed.status, "FAILED");
      assert.equal(failed.attempts, 1);
      assert.equal(failed.transactionId, null);
      assert.equal((await reconcile(round.id)).refunded, 0n);
      await Promise.all(
        [admin, member].map((actor) =>
          processRoundSettlement(actor.user.id, scope(cid, round.id), at(2.02)),
        ),
      );
      const retried = await db.roundOperation.findUniqueOrThrow({
        where: { id: failed.id },
        include: { executionAttempts: { orderBy: { attempt: "asc" } } },
      });
      assert.equal(retried.status, "CONFIRMED");
      assert.equal(retried.attempts, 2);
      assert.deepEqual(
        retried.executionAttempts.map((attempt) => attempt.status),
        ["FAILED", "CONFIRMED"],
      );
      assert.equal(
        await db.roundLedgerTransaction.count({
          where: { roundId: round.id, kind: "REFUND" },
        }),
        1,
      );
      assert.equal((await reconcile(round.id)).refunded, 100n);
    },
  );
  await check(
    "database integrity blocks source changes, invalid balances and rewrites of receipts, operations and attempts",
    async () => {
      const receipt = await db.roundContribution.findFirstOrThrow({
        where: { roundId: paidRoundId },
      });
      const operation = await db.roundOperation.findFirstOrThrow({
        where: { roundId: paidRoundId },
      });
      const attempt = await db.roundExecutionAttempt.findFirstOrThrow({
        where: { operationId: operation.id },
      });
      const transaction = await db.roundLedgerTransaction.findUniqueOrThrow({
        where: { id: receipt.transactionId },
      });
      const reserve = await db.roundLedgerTransaction.findFirstOrThrow({
        where: { roundId: paidRoundId, kind: "RESERVE" },
      });
      await assert.rejects(
        () =>
          db.roundContribution.create({
            data: {
              roundId: paidRoundId,
              userId: member.user.id,
              sourceAccountId: receipt.sourceAccountId,
              transactionId: reserve.id,
              amount: reserve.amount,
            },
          }),
        /original received deposit/,
      );
      const entry = await db.roundLedgerEntry.findFirstOrThrow({
        where: { transactionId: transaction.id },
      });
      await assert.rejects(() =>
        db.roundContribution.update({
          where: { id: receipt.id },
          data: { amount: 1n },
        }),
      );
      await assert.rejects(() =>
        db.roundContribution.delete({ where: { id: receipt.id } }),
      );
      await assert.rejects(() =>
        db.roundLedgerTransaction.update({
          where: { id: transaction.id },
          data: { amount: 1n },
        }),
      );
      await assert.rejects(() =>
        db.roundLedgerEntry.update({
          where: { id: entry.id },
          data: { amount: 1n },
        }),
      );
      await assert.rejects(() =>
        db.roundOperation.update({
          where: { id: operation.id },
          data: { recipient: "redirected" },
        }),
      );
      await assert.rejects(() =>
        db.roundOperation.update({
          where: { id: operation.id },
          data: { status: "PENDING", transactionId: null },
        }),
      );
      await assert.rejects(() =>
        db.roundExecutionAttempt.update({
          where: { id: attempt.id },
          data: { status: "FAILED" },
        }),
      );
      await assert.rejects(() =>
        db.roundAccount.update({
          where: { id: receipt.sourceAccountId },
          data: { ownerId: outsider.user.id },
        }),
      );
      await assert.rejects(() =>
        db.roundAccount.update({
          where: { id: receipt.sourceAccountId },
          data: { balance: 0n },
        }),
      );
      const foreign = await open();
      const destination = await db.roundAccount.findUniqueOrThrow({
        where: { roundId_key: { roundId: foreign.id, key: "HELD" } },
      });
      await assert.rejects(() =>
        db.roundLedgerTransaction.create({
          data: {
            roundId: paidRoundId,
            operationKey: `forged:${randomUUID()}`,
            kind: "REFUND",
            amount: 1n,
            assetId: "fiat:USD",
            initiatedById: admin.user.id,
            sourceAccountId: operation.sourceAccountId,
            destinationAccountId: destination.id,
            entries: {
              create: [
                { accountId: operation.sourceAccountId, amount: -1n },
                { accountId: destination.id, amount: 1n },
              ],
            },
          },
        }),
      );
      await reconcile(paidRoundId);
    },
  );

  const live = await open({}, new Date());
  await check(
    "funding HTTP requires authentication, same origin, strict payloads, active membership and unique keys",
    async () => {
      const input = {
        ...scope(cid, live.id),
        amount: "1.01",
        idempotencyKey: randomUUID(),
      };
      await post("round-contribute", input, "", 401);
      await post("round-contribute", input, outsider.cookie, 403);
      await post(
        "round-contribute",
        input,
        member.cookie,
        403,
        "https://forged.invalid",
      );
      await post(
        "round-contribute",
        { ...input, recipient: "redirect" },
        member.cookie,
        400,
      );
      await post(
        "round-contribute",
        { ...input, now: old.toISOString() },
        member.cookie,
        400,
      );
      await post("round-contribute", input, member.cookie);
      await post("round-contribute", input, member.cookie);
      await post(
        "round-contribute",
        { ...input, amount: "1.02" },
        member.cookie,
        409,
      );
      assert.equal((await reconcile(live.id)).received, 101n);
      await post("round-settle", scope(cid, live.id), member.cookie, 403);
      await post(
        "round-process",
        { ...scope(cid, live.id), recipient: "redirect" },
        admin.cookie,
        400,
      );
      await post("round-process", scope(cid, live.id), outsider.cookie, 403);
      const own = await getRoundFinanceView(cid, live.id, member.user.id),
        stranger = await getRoundFinanceView(cid, live.id, outsider.user.id);
      assert.equal(own!.ownReceipts.length, 1);
      assert.equal(stranger!.ownReceipts.length, 0);
      assert.equal(own!.ownContributed, 101n);
      assert.equal(stranger!.ownContributed, 0n);
    },
  );

  await runGovernanceProfileChecks(check);
  await check(
    "funded round UI supports real contributions, scoped receipts, settlement details and responsive accessibility",
    async () => {
      process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
      process.env.TEMP = resolve(".local/browser-temp");
      process.env.TMP = process.env.TEMP;
      mkdirSync(process.env.TEMP, { recursive: true });
      const { chromium } = await import("@playwright/test");
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const browser = await chromium.launch({ headless: true });
      const scans: { route: string; width: number; violations: number }[] = [];
      try {
        const context = await browser.newContext();
        const [cookieName, cookieValue] = member.cookie.split("=");
        await context.addCookies([
          { name: cookieName, value: cookieValue, url: origin },
        ]);
        const page = await context.newPage();
        page.on("dialog", (dialog) => dialog.accept());
        const pageErrors: string[] = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const root = `/communities/${community.slug}/rounds`;
        await page.goto(`${origin}${root}/${live.id}`, {
          waitUntil: "networkidle",
        });
        await page
          .getByRole("spinbutton", {
            name: "Contribution amount (USD)",
            exact: true,
          })
          .fill("0.01");
        await page
          .getByRole("button", {
            name: "Record local contribution",
            exact: true,
          })
          .click();
        await page
          .getByText(
            "Local simulated round deposit recorded. No real money moved.",
            { exact: true },
          )
          .waitFor();
        await page
          .getByText("Your contribution history", { exact: true })
          .waitFor();
        assert.equal(
          (await getRoundFinanceView(cid, live.id, member.user.id))!
            .ownContributed,
          102n,
        );
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 1000 : 844,
          });
          for (const route of [
            `${root}/${live.id}`,
            `${root}/${paidRoundId}`,
          ]) {
            const response = await page.goto(origin + route, {
              waitUntil: "networkidle",
            });
            try {
              await page
                .getByText("Explore funding rules and settlement details", {
                  exact: true,
                })
                .click();
            } catch (error) {
              console.error("Funded page navigation failed", {
                route,
                width,
                url: page.url(),
                status: response?.status(),
                pageErrors,
              });
              console.error(
                (await page.locator("body").innerText()).slice(0, 6000),
              );
              await page.screenshot({
                path: "test-results/fundicate-funds-navigation-failure.png",
                fullPage: true,
              });
              throw error;
            }
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            );
            assert.equal(overflow, false, `${route} overflow at ${width}`);
            const result = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            assert.equal(
              result.violations.length,
              0,
              JSON.stringify(result.violations),
            );
            scans.push({ route, width, violations: result.violations.length });
            if (width !== 320) {
              await page.evaluate(() => {
                (document.activeElement as HTMLElement)?.blur();
                window.scrollTo({ top: 0, behavior: "instant" });
              });
              await page.waitForFunction(() => window.scrollY === 0);
              await page.evaluate(
                () =>
                  new Promise<void>((done) =>
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() => done()),
                    ),
                  ),
              );
              mkdirSync("test-results", { recursive: true });
              await page.screenshot({
                path: `test-results/fundicate-funds-${route.endsWith(live.id) ? "collecting" : "settled"}-${width}.png`,
                fullPage: true,
              });
            }
          }
        }
        const adminContext = await browser.newContext();
        const [adminName, adminValue] = admin.cookie.split("=");
        await adminContext.addCookies([
          { name: adminName, value: adminValue, url: origin },
        ]);
        const staffPage = await adminContext.newPage();
        staffPage.on("pageerror", (error) => pageErrors.push(error.message));
        await staffPage.goto(`${origin}${root}/new`, {
          waitUntil: "networkidle",
        });
        await staffPage
          .getByRole("checkbox", {
            name: "Collect a dedicated funding pool for this round",
            exact: true,
          })
          .check();
        await staffPage
          .getByRole("spinbutton", {
            name: "Minimum funding target (USD)",
            exact: true,
          })
          .fill("100");
        const formScan = await new AxeBuilder({ page: staffPage })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.equal(
          formScan.violations.length,
          0,
          JSON.stringify(formScan.violations),
        );
        scans.push({
          route: `${root}/new#funded`,
          width: 1280,
          violations: formScan.violations.length,
        });
        await staffPage.goto(origin + "/communities/new", {
          waitUntil: "networkidle",
        });
        await staffPage
          .getByLabel("Governance profile", { exact: true })
          .selectOption("STRICT");
        await staffPage
          .getByLabel("Community name", { exact: true })
          .fill("Browser strict collective");
        await staffPage
          .getByLabel("Unique community address", { exact: true })
          .fill("browser-strict-collective");
        await staffPage
          .getByLabel("Short description", { exact: true })
          .fill(
            "A browser-created strict community for accountable membership.",
          );
        await staffPage
          .getByLabel("Purpose and funding objectives", { exact: true })
          .fill(
            "Build useful projects with honest member declarations and governed leadership.",
          );
        await staffPage
          .getByLabel("Membership questions (one per line, up to five)", {
            exact: true,
          })
          .fill("Why join this collective?");
        await staffPage
          .getByLabel("Your declared contribution", { exact: true })
          .fill("25.29");
        await staffPage
          .getByLabel("Your founding introduction", { exact: true })
          .fill(
            "I will contribute research, planning and useful community work.",
          );
        await staffPage
          .getByLabel("Your answers to the membership questions", {
            exact: true,
          })
          .fill(
            "I want to support shared projects with accountable decisions.",
          );
        const strictScan = await new AxeBuilder({ page: staffPage })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.equal(
          strictScan.violations.length,
          0,
          JSON.stringify(strictScan.violations),
        );
        scans.push({
          route: "/communities/new#strict",
          width: 1280,
          violations: 0,
        });
        await staffPage
          .getByRole("button", { name: "Create community", exact: true })
          .click();
        await staffPage.waitForURL("**/communities/browser-strict-collective");
        const browserStrict = await db.community.findUniqueOrThrow({
          where: { slug: "browser-strict-collective" },
          include: { memberships: true },
        });
        assert.equal(browserStrict.governanceProfile, "STRICT");
        assert.equal(browserStrict.memberships[0].declaredContribution, 2529n);
        await page.goto(`${origin}/communities/${community.slug}/members`, {
          waitUntil: "networkidle",
        });
        await page
          .getByLabel("Declared contribution (USD)", { exact: true })
          .fill("7.25");
        await page
          .getByRole("button", { name: "Record my pledge", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "Record your contribution declaration",
            exact: true,
          })
          .waitFor({ state: "hidden" });
        const declaredMember = await db.communityMembership.findUniqueOrThrow({
          where: {
            communityId_userId: { communityId: cid, userId: member.user.id },
          },
        });
        assert.equal(declaredMember.declaredContribution, 725n);
        assert.equal(
          (await getRoundFinanceView(cid, live.id, member.user.id))!
            .ownContributed,
          102n,
        );
        const visitor = await browser.newPage();
        await visitor.goto(`${origin}${root}/${live.id}`, {
          waitUntil: "networkidle",
        });
        assert.equal(
          await visitor
            .getByText("Your contribution history", { exact: true })
            .count(),
          0,
        );
        assert.equal(
          await visitor
            .getByRole("button", {
              name: "Record local contribution",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
        mkdirSync(".local", { recursive: true });
        writeFileSync(
          ".local/funds-accessibility.json",
          JSON.stringify(scans, null, 2),
        );
        console.log(
          `PASS ${scans.length} funded-round WCAG A/AA scans; no violations.`,
        );
      } finally {
        await browser.close();
      }
    },
  );
  console.log(
    `PASS ${checks} funded-round and governance integrity, HTTP, browser and recovery checks.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
