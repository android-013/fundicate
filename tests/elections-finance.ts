import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { db } from "../src/lib/db";
import { atomic, createCommunity } from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castSelectionVote,
} from "../src/lib/rounds";
import {
  contributeToRound,
  freezeRoundFunding,
  prepareRoundSettlement,
  processRoundSettlement,
  reconcileRoundSettlement,
  getRoundFinanceView,
} from "../src/lib/funded-rounds";
import { castRoundVetoVote, closeRoundVeto } from "../src/lib/rounds-v3";

const day = 86400000;
type Check = (name: string, fn: () => Promise<void>) => Promise<void>;
type PublishedAllocation = {
  received: string;
  payouts: {
    schemeId: string;
    amount: string;
    recipient: string;
    beneficiaryId: string;
  }[];
  refundTotal: string;
};

/** Integration fixtures are independent of the browser/electorate suite. */
export async function runElectionFinanceChecks(check: Check) {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Election finance requires an isolated test database.",
  );
  const suffix = randomUUID().slice(0, 8);
  const actors = await Promise.all(
    Array.from({ length: 7 }, (_, i) =>
      db.user.create({
        data: {
          username: `fin${suffix}${i}`,
          email: `fin${suffix}${i}@elections.invalid`,
          displayName: `Finance fixture ${i}`,
          passwordHash: "isolated-service-fixture-no-browser-login",
        },
      }),
    ),
  );
  const [admin, member, , , , , outsider] = actors;
  const voters = actors.slice(0, 6);
  const community = await createCommunity(admin.id, {
    name: "Exact election finance",
    slug: `exact-election-finance-${suffix}`,
    description:
      "Independent fixtures for conserved, immutable election settlements.",
    purpose:
      "Choose shared projects and return every unused cent to its original payer.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  const cid = community.id;
  await db.communityMembership.createMany({
    data: voters
      .slice(1)
      .map((actor) => ({ communityId: cid, userId: actor.id })),
  });
  const old = new Date(Date.now() - 20 * day);
  const at = (offset: number) => new Date(old.getTime() + offset * day);
  const scope = (roundId: string) => ({ communityId: cid, roundId });
  async function open(extra: Record<string, unknown> = {}) {
    const round = await createFundingRound(
      admin.id,
      {
        communityId: cid,
        title: "Exact shared funding allocation",
        description:
          "A practical shared funding decision with immutable published recipients and rules.",
        proposalPolicy: "EVERYONE",
        quorumBps: 5000,
        funded: true,
        fundedVersion: "V3",
        fundingTarget: "1.00",
        minimumContribution: "0.01",
        maximumContribution: "1000.00",
        submissionsCloseAt: at(1).toISOString(),
        collectionClosesAt: at(0.5).toISOString(),
        expiresAt: at(10).toISOString(),
        screeningWeight: "EQUAL",
        selectionWeight: "EQUAL",
        vetoWeight: "EQUAL",
        vetoEnabled: false,
        allocationPolicy: "WINNER_ALL",
        rankedSharesBps: [],
        ...extra,
      },
      old,
    );
    await fundingRoundAction(
      admin.id,
      { ...scope(round.id), action: "open" },
      old,
    );
    return round;
  }
  async function deposit(roundId: string, userId: string, amount: string) {
    return contributeToRound(
      userId,
      { ...scope(roundId), amount, idempotencyKey: randomUUID() },
      old,
    );
  }
  async function scheme(
    roundId: string,
    amount = "100.00",
    recipient = "Published project recipient",
  ) {
    return submitFundingScheme(
      outsider.id,
      {
        ...scope(roundId),
        title: "A practical shared project",
        description:
          "A detailed useful project with a fixed requested amount and payment recipient.",
        amount,
        recipient,
        category: "DONATION",
        supportingUrl: "",
      },
      old,
    );
  }
  async function elect(
    roundId: string,
    schemeIds: string[],
    choices: string[],
    publishedAt = at(3.02),
  ) {
    await fundingRoundAction(
      admin.id,
      { ...scope(roundId), action: "screen" },
      at(1),
    );
    for (const schemeId of schemeIds)
      for (const actor of voters)
        await castScreeningVote(
          actor.id,
          { ...scope(roundId), schemeId, choice: "YES" },
          at(1.01),
        );
    await fundingRoundAction(
      admin.id,
      { ...scope(roundId), action: "close-screening" },
      at(2.01),
    );
    for (const [index, schemeId] of choices.entries())
      await castSelectionVote(
        voters[index].id,
        { ...scope(roundId), schemeId },
        at(2.02),
      );
    await fundingRoundAction(
      admin.id,
      { ...scope(roundId), action: "close-selection" },
      publishedAt,
    );
    return db.roundDecision.findUniqueOrThrow({ where: { roundId } });
  }
  function plan(value: unknown): PublishedAllocation {
    return value as PublishedAllocation;
  }
  async function operations(roundId: string) {
    return db.roundOperation.findMany({
      where: { roundId },
      orderBy: { operationKey: "asc" },
      include: { destination: true },
    });
  }
  async function conservation(roundId: string, final = false) {
    const settlement = await db.roundSettlement.findUniqueOrThrow({
      where: { roundId },
    });
    const accounts = await db.roundAccount.findMany({
      where: { roundId },
      include: { entries: true },
    });
    const byKey = new Map(accounts.map((account) => [account.key, account]));
    for (const account of accounts)
      assert.equal(
        account.balance,
        account.entries.reduce((sum, entry) => sum + entry.amount, 0n),
        `Account ${account.key} reconciles`,
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
    for (const tx of transactions) {
      assert.equal(tx.entries.length, 2);
      assert.equal(
        tx.entries.reduce((sum, entry) => sum + entry.amount, 0n),
        0n,
      );
      assert.equal(tx.assetId, settlement.assetId);
      assert.equal(
        tx.entries.find((entry) => entry.accountId === tx.sourceAccountId)
          ?.amount,
        -tx.amount,
      );
      assert.equal(
        tx.entries.find((entry) => entry.accountId === tx.destinationAccountId)
          ?.amount,
        tx.amount,
      );
    }
    for (const op of await operations(roundId)) {
      if (op.kind === "REFUND") {
        assert.equal(op.destination.ownerId, op.beneficiaryId);
        assert.equal(op.destination.key, `EXTERNAL:${op.beneficiaryId}`);
        assert.equal(op.operationKey, `refund:${op.destination.id}`);
      }
      if (op.status === "CONFIRMED") {
        const receipts = transactions.filter(
          (tx) => tx.operationKey === `execute:${op.id}`,
        );
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0].id, op.transactionId);
        assert.equal(receipts[0].amount, op.amount);
        assert.equal(receipts[0].destinationAccountId, op.destinationAccountId);
      }
      if (final) assert.equal(op.status, "CONFIRMED");
    }
    if (final) {
      assert.equal(byKey.get("HELD")!.balance, 0n);
      assert.equal(byKey.get("RESERVED")!.balance, 0n);
      assert.equal(settlement.received, settlement.paid + settlement.refunded);
    }
    return settlement;
  }
  async function settle(roundId: string, now = at(3.03)) {
    await prepareRoundSettlement(admin.id, scope(roundId), now);
    await processRoundSettlement(admin.id, scope(roundId), now);
    return conservation(roundId, true);
  }

  await check(
    "V3 proportional caps preserve cents and original-source refunds across worker restart and expiry",
    async () => {
      const round = await open({ allocationPolicy: "PROPORTIONAL" });
      await deposit(round.id, admin.id, "6.01");
      await deposit(round.id, member.id, "6.00");
      const a = await scheme(round.id, "3.00"),
        b = await scheme(round.id),
        c = await scheme(round.id);
      const decision = await elect(
        round.id,
        [a.id, b.id, c.id],
        [a.id, a.id, a.id, b.id, b.id, c.id],
      );
      assert.deepEqual(
        new Map(
          plan(decision.allocation).payouts.map((p) => [p.schemeId, p.amount]),
        ),
        new Map([
          [a.id, "300"],
          [b.id, "400"],
          [c.id, "200"],
        ]),
      );
      assert.equal(plan(decision.allocation).refundTotal, "301");
      await prepareRoundSettlement(admin.id, scope(round.id), at(3.03));
      const queued = await operations(round.id);
      assert.deepEqual(
        new Map(
          queued
            .filter((op) => op.kind === "REFUND")
            .map((op) => [op.beneficiaryId, op.amount]),
        ),
        new Map([
          [admin.id, 151n],
          [member.id, 150n],
        ]),
      );
      const snapshot = (await conservation(round.id)).allocationSnapshot;
      const worker = spawnSync(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "tests/round-funds-worker.ts",
          admin.id,
          cid,
          round.id,
          at(3.04).toISOString(),
        ],
        { env: process.env, stdio: "inherit", windowsHide: true },
      );
      assert.equal(
        worker.status,
        0,
        "Separate worker commits one batch before exiting",
      );
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, status: "CONFIRMED" },
        }),
        1,
      );
      await Promise.all(
        [admin, member].map((actor) =>
          processRoundSettlement(actor.id, scope(round.id), at(11)),
        ),
      );
      const final = await conservation(round.id, true);
      assert.equal(final.paid, 900n);
      assert.equal(final.refunded, 301n);
      assert.deepEqual(final.allocationSnapshot, snapshot);
      assert.deepEqual(
        (
          await db.roundDecision.findUniqueOrThrow({
            where: { roundId: round.id },
          })
        ).allocation,
        decision.allocation,
      );
      assert.deepEqual(
        (await operations(round.id)).map((op) => op.id),
        queued.map((op) => op.id),
      );
      assert.equal(
        await db.roundLedgerTransaction.count({
          where: { roundId: round.id, operationKey: "reserve:v3" },
        }),
        1,
      );
    },
  );

  for (const allocationPolicy of [
    "WINNER_ALL",
    "PROPORTIONAL",
    "RANKED_CUTS",
  ] as const)
    for (const selectionWeight of ["EQUAL", "CONTRIBUTION"] as const)
      await check(
        `V3 ${allocationPolicy} with ${selectionWeight} selection settles the exact published plan and replays safely`,
        async () => {
          const round = await open({
            allocationPolicy,
            selectionWeight,
            screeningWeight: "EQUAL",
            vetoEnabled: false,
            rankedSharesBps:
              allocationPolicy === "RANKED_CUTS" ? [6000, 3000, 1000] : [],
          });
          const deposits = [50n, 20n, 10n, 10n, 5n, 5n];
          for (const [index, amount] of [
            "0.50",
            "0.20",
            "0.10",
            "0.10",
            "0.05",
            "0.05",
          ].entries())
            await deposit(round.id, voters[index].id, amount);
          const a = await scheme(round.id, "0.70"),
            b = await scheme(round.id, "1.00"),
            c = await scheme(round.id, "1.00");
          const decision = await elect(
            round.id,
            [a.id, b.id, c.id],
            [a.id, a.id, a.id, b.id, b.id, c.id],
          );
          // Fixed independent examples: equal support is 3:2:1, paid support is 80:15:5.
          const expectedAmounts =
            allocationPolicy === "WINNER_ALL"
              ? [70n, 0n, 0n]
              : allocationPolicy === "RANKED_CUTS"
                ? [60n, 30n, 10n]
                : selectionWeight === "EQUAL"
                  ? [50n, 33n, 17n]
                  : [70n, 15n, 5n];
          const expectedPayouts = new Map(
            [a, b, c].flatMap((candidate, index) =>
              expectedAmounts[index] > 0n
                ? [[candidate.id, expectedAmounts[index].toString()] as const]
                : [],
            ),
          );
          const expectedPaid = expectedAmounts.reduce(
            (sum, amount) => sum + amount,
            0n,
          );
          const expectedRefund = 100n - expectedPaid;
          assert.equal(plan(decision.allocation).received, "100");
          assert.deepEqual(
            new Map(
              plan(decision.allocation).payouts.map((payout) => [
                payout.schemeId,
                payout.amount,
              ]),
            ),
            expectedPayouts,
          );
          assert.equal(
            plan(decision.allocation).refundTotal,
            expectedRefund.toString(),
          );
          const prepared = await prepareRoundSettlement(
            admin.id,
            scope(round.id),
            at(3.03),
          );
          const queued = await operations(round.id);
          assert.deepEqual(
            new Map(
              queued
                .filter((op) => op.kind === "PAYOUT")
                .map((op) => [op.schemeId, op.amount.toString()]),
            ),
            expectedPayouts,
          );
          const sources = await db.roundAccount.findMany({
            where: {
              roundId: round.id,
              ownerId: { in: voters.map((voter) => voter.id) },
            },
          });
          const byOwner = new Map(
            sources.map((source) => [source.ownerId!, source]),
          );
          // Only the final two equal five-cent sources tie for a residual cent in these cases.
          const refundByVoter =
            expectedRefund === 30n
              ? [15n, 6n, 3n, 3n, 1n, 1n]
              : expectedRefund === 10n
                ? [5n, 2n, 1n, 1n, 0n, 0n]
                : [0n, 0n, 0n, 0n, 0n, 0n];
          if (expectedRefund > 0n) {
            const residualWinner =
              byOwner.get(voters[4].id)!.id < byOwner.get(voters[5].id)!.id
                ? 4
                : 5;
            refundByVoter[residualWinner] += 1n;
          }
          const expectedRefundOps = new Map(
            voters.flatMap((voter, index) =>
              refundByVoter[index] > 0n
                ? [[voter.id, refundByVoter[index]] as const]
                : [],
            ),
          );
          assert.deepEqual(
            new Map(
              queued
                .filter((op) => op.kind === "REFUND")
                .map((op) => [op.beneficiaryId, op.amount]),
            ),
            expectedRefundOps,
          );
          await processRoundSettlement(admin.id, scope(round.id), at(3.04));
          const final = await conservation(round.id, true);
          assert.equal(final.received, 100n);
          assert.equal(final.paid, expectedPaid);
          assert.equal(final.refunded, expectedRefund);
          const finalSources = await db.roundAccount.findMany({
            where: {
              roundId: round.id,
              ownerId: { in: voters.map((voter) => voter.id) },
            },
          });
          for (const [index, voter] of voters.entries())
            assert.equal(
              finalSources.find((source) => source.ownerId === voter.id)!
                .balance,
              -deposits[index] + refundByVoter[index],
            );
          const receipts = await db.roundLedgerTransaction.count({
            where: { roundId: round.id },
          });
          await prepareRoundSettlement(admin.id, scope(round.id), at(11));
          await processRoundSettlement(member.id, scope(round.id), at(11));
          const replayed = await conservation(round.id, true);
          assert.equal(
            await db.roundLedgerTransaction.count({
              where: { roundId: round.id },
            }),
            receipts,
          );
          assert.deepEqual(
            replayed.allocationSnapshot,
            prepared.allocationSnapshot,
          );
          assert.deepEqual(
            (await operations(round.id)).map((op) => [
              op.id,
              op.kind,
              op.amount,
              op.sourceAccountId,
              op.destinationAccountId,
            ]),
            queued.map((op) => [
              op.id,
              op.kind,
              op.amount,
              op.sourceAccountId,
              op.destinationAccountId,
            ]),
          );
          assert.deepEqual(
            (
              await db.roundDecision.findUniqueOrThrow({
                where: { roundId: round.id },
              })
            ).allocation,
            decision.allocation,
          );
        },
      );

  await check(
    "V3 ranked cuts refund capped, tied, and empty positions without shifting entitlements",
    async () => {
      for (const tied of [true, false]) {
        const round = await open({
          allocationPolicy: "RANKED_CUTS",
          rankedSharesBps: [5000, 3000, 2000],
        });
        await deposit(round.id, admin.id, "10.01");
        const a = await scheme(round.id, tied ? "4.00" : "100.00");
        const others = tied
          ? await Promise.all(Array.from({ length: 3 }, () => scheme(round.id)))
          : [];
        const decision = await elect(
          round.id,
          [a.id, ...others.map((s) => s.id)],
          tied
            ? [a.id, a.id, a.id, ...others.map((s) => s.id)]
            : Array(6).fill(a.id),
        );
        assert.deepEqual(
          plan(decision.allocation).payouts.map((p) => [p.schemeId, p.amount]),
          [[a.id, tied ? "400" : "501"]],
        );
        assert.equal(
          plan(decision.allocation).refundTotal,
          tied ? "601" : "500",
        );
        const final = await settle(round.id);
        assert.equal(final.paid, tied ? 400n : 501n);
        assert.equal(final.refunded, tied ? 601n : 500n);
      }
    },
  );

  await check(
    "V3 proportional unpayable share and winner-all top ties refund without arbitrary awards",
    async () => {
      const proportional = await open({ allocationPolicy: "PROPORTIONAL" });
      await deposit(proportional.id, admin.id, "1.01");
      const payable = await scheme(proportional.id),
        invalid = await scheme(
          proportional.id,
          "100.00",
          "Invalid\u007frecipient",
        );
      const decision = await elect(
        proportional.id,
        [payable.id, invalid.id],
        [
          payable.id,
          payable.id,
          payable.id,
          invalid.id,
          invalid.id,
          invalid.id,
        ],
      );
      const entitlement = payable.id < invalid.id ? 51n : 50n;
      assert.deepEqual(
        plan(decision.allocation).payouts.map((p) => [p.schemeId, p.amount]),
        [[payable.id, entitlement.toString()]],
      );
      const final = await settle(proportional.id);
      assert.equal(final.paid, entitlement);
      assert.equal(final.refunded, 101n - entitlement);
      const tie = await open();
      await deposit(tie.id, member.id, "1.00");
      const a = await scheme(tie.id),
        b = await scheme(tie.id);
      const tied = await elect(
        tie.id,
        [a.id, b.id],
        [a.id, a.id, a.id, b.id, b.id, b.id],
      );
      assert.deepEqual(plan(tied.allocation).payouts, []);
      assert.equal(plan(tied.allocation).refundTotal, "100");
      assert.equal((await settle(tie.id)).refunded, 100n);
    },
  );

  await check(
    "V3 exact 90-percent rejection waits 24 hours across prepare, process, SQL bypass, and expiry",
    async () => {
      const round = await open({
        vetoEnabled: true,
        vetoWeight: "CONTRIBUTION",
        expiresAt: at(4.01).toISOString(),
      });
      await deposit(round.id, member.id, "0.90");
      await deposit(round.id, admin.id, "0.10");
      const candidate = await scheme(round.id);
      const decision = await elect(
        round.id,
        [candidate.id],
        Array(6).fill(candidate.id),
      );
      const deadline = decision.vetoClosesAt!;
      const early = new Date(deadline.getTime() - 1);
      await castRoundVetoVote(
        member.id,
        { ...scope(round.id), choice: "REJECT" },
        at(3.03),
      );
      await castRoundVetoVote(
        admin.id,
        { ...scope(round.id), choice: "KEEP" },
        at(3.03),
      );
      for (const now of [at(3.04), early]) {
        await assert.rejects(
          () => prepareRoundSettlement(admin.id, scope(round.id), now),
          /24|veto|window/i,
        );
        await assert.rejects(
          () => processRoundSettlement(admin.id, scope(round.id), now),
          /24|veto|window/i,
        );
        await assert.rejects(
          () => closeRoundVeto(admin.id, scope(round.id), now),
          /24|veto|window/i,
        );
      }
      const accounts = await db.roundAccount.findMany({
        where: { roundId: round.id },
      });
      await assert.rejects(
        () =>
          db.roundOperation.create({
            data: {
              roundId: round.id,
              operationKey: `payout:${candidate.id}`,
              kind: "PAYOUT",
              amount: 100n,
              beneficiaryId: outsider.id,
              sourceAccountId: accounts.find((a) => a.key === "RESERVED")!.id,
              destinationAccountId: accounts.find((a) => a.key === "PAID")!.id,
              schemeId: candidate.id,
              recipient: candidate.recipient,
              createdAt: early,
            },
          }),
        /veto|window/i,
      );
      assert.equal(
        await db.roundOperation.count({ where: { roundId: round.id } }),
        0,
      );
      assert.equal((await conservation(round.id)).paid, 0n);
      await db.communityMembership.update({
        where: { communityId_userId: { communityId: cid, userId: member.id } },
        data: { status: "LEFT" },
      });
      try {
        await prepareRoundSettlement(admin.id, scope(round.id), deadline);
        await processRoundSettlement(member.id, scope(round.id), deadline);
        const final = await conservation(round.id, true);
        assert.equal(final.paid, 0n);
        assert.equal(final.refunded, 100n);
        assert.equal(
          (
            await db.roundDecision.findUniqueOrThrow({
              where: { roundId: round.id },
            })
          ).rejected,
          true,
        );
        assert.equal(
          (await operations(round.id)).find(
            (op) => op.beneficiaryId === member.id,
          )!.amount,
          90n,
        );
        assert.deepEqual(
          (
            await db.roundDecision.findUniqueOrThrow({
              where: { roundId: round.id },
            })
          ).allocation,
          decision.allocation,
        );
      } finally {
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: cid, userId: member.id },
          },
          data: { status: "ACTIVE" },
        });
      }
    },
  );

  await check(
    "V3 89-percent rejection includes abstaining and nonvoting power in the denominator",
    async () => {
      for (const abstain of [true, false]) {
        const round = await open({
          vetoEnabled: true,
          vetoWeight: "CONTRIBUTION",
        });
        await deposit(round.id, member.id, "0.89");
        await deposit(round.id, admin.id, "0.11");
        const candidate = await scheme(round.id);
        const decision = await elect(
          round.id,
          [candidate.id],
          Array(6).fill(candidate.id),
        );
        await castRoundVetoVote(
          member.id,
          { ...scope(round.id), choice: "REJECT" },
          at(3.03),
        );
        if (abstain)
          await castRoundVetoVote(
            admin.id,
            { ...scope(round.id), choice: "ABSTAIN" },
            at(3.03),
          );
        await assert.rejects(
          () =>
            prepareRoundSettlement(
              admin.id,
              scope(round.id),
              new Date(decision.vetoClosesAt!.getTime() - 1),
            ),
          /24|veto|window/i,
        );
        const final = await settle(round.id, decision.vetoClosesAt!);
        assert.equal(final.paid, 100n);
        assert.equal(final.refunded, 0n);
        assert.equal(
          (
            await db.roundDecision.findUniqueOrThrow({
              where: { roundId: round.id },
            })
          ).rejected,
          false,
        );
      }
    },
  );

  await check(
    "UNKNOWN blocks the entire plan until local non-posting proof records a durable same-intent retry",
    async () => {
      const round = await open();
      await deposit(round.id, admin.id, "1.00");
      const candidate = await scheme(round.id, "0.50");
      await elect(round.id, [candidate.id], Array(6).fill(candidate.id));
      await prepareRoundSettlement(admin.id, scope(round.id), at(3.03));
      const queued = await operations(round.id);
      const unknown = queued.find((op) => op.kind === "REFUND")!;
      await atomic(async (tx) => {
        await tx.roundExecutionAttempt.create({
          data: {
            operationId: unknown.id,
            attempt: 1,
            status: "UNKNOWN",
            error: "Isolated uncertain execution outcome",
            createdAt: at(3.04),
          },
        });
        await tx.roundOperation.update({
          where: { id: unknown.id },
          data: {
            status: "UNKNOWN",
            attempts: 1,
            lastError: "Isolated uncertain execution outcome",
          },
        });
      });
      await assert.rejects(
        () => processRoundSettlement(admin.id, scope(round.id), at(3.05)),
        /unknown|reconcil/i,
      );
      await assert.rejects(
        () => prepareRoundSettlement(admin.id, scope(round.id), at(3.05)),
        /unknown|reconcil/i,
      );
      const blockedPayout = queued.find((op) => op.kind === "PAYOUT")!;
      await assert.rejects(
        () =>
          db.roundLedgerTransaction.create({
            data: {
              roundId: round.id,
              operationKey: `execute:${blockedPayout.id}`,
              kind: blockedPayout.kind,
              amount: blockedPayout.amount,
              assetId: "fiat:USD",
              initiatedById: admin.id,
              sourceAccountId: blockedPayout.sourceAccountId,
              destinationAccountId: blockedPayout.destinationAccountId,
              createdAt: at(3.05),
              entries: {
                create: [
                  {
                    accountId: blockedPayout.sourceAccountId,
                    amount: -blockedPayout.amount,
                  },
                  {
                    accountId: blockedPayout.destinationAccountId,
                    amount: blockedPayout.amount,
                  },
                ],
              },
            },
          }),
        /unknown|reconcil/i,
      );
      assert.equal(
        await db.roundLedgerTransaction.count({
          where: { roundId: round.id, kind: { in: ["PAYOUT", "REFUND"] } },
        }),
        0,
      );
      const view = await getRoundFinanceView(cid, round.id, admin.id, at(3.05));
      assert.equal(view!.canProcess, false);
      assert.equal(view!.canReconcile, true);
      assert.match(view!.settlementBlockedReason!, /unknown/i);
      await assert.rejects(
        () => reconcileRoundSettlement(outsider.id, scope(round.id), at(3.06)),
        /Staff|contributor/i,
      );
      const result = await reconcileRoundSettlement(
        admin.id,
        scope(round.id),
        at(3.06),
      );
      assert.equal(result.reconciled, 1);
      assert.equal(result.network, "local-simulation");
      const recovered = await db.roundOperation.findUniqueOrThrow({
        where: { id: unknown.id },
        include: { executionAttempts: { orderBy: { attempt: "asc" } } },
      });
      assert.equal(recovered.status, "FAILED");
      assert.equal(recovered.transactionId, null);
      assert.equal(recovered.attempts, 2);
      assert.deepEqual(
        recovered.executionAttempts.map((a) => a.status),
        ["UNKNOWN", "FAILED"],
      );
      assert.equal(
        await db.roundLedgerTransaction.count({
          where: { roundId: round.id, kind: { in: ["PAYOUT", "REFUND"] } },
        }),
        0,
      );
      assert.equal(
        await db.auditEvent.count({
          where: {
            action: "ROUND_OPERATION_RECONCILED",
            actorId: admin.id,
            communityId: cid,
          },
        }),
        1,
      );
      await assert.rejects(
        () => processRoundSettlement(member.id, scope(round.id), at(3.07)),
        /Staff|contributor/i,
      );
      await Promise.all(
        [admin, admin].map((actor) =>
          processRoundSettlement(actor.id, scope(round.id), at(3.07)),
        ),
      );
      const final = await conservation(round.id, true);
      assert.equal(final.paid, 50n);
      assert.equal(final.refunded, 50n);
      const retried = await db.roundOperation.findUniqueOrThrow({
        where: { id: unknown.id },
        include: { executionAttempts: { orderBy: { attempt: "asc" } } },
      });
      assert.deepEqual(
        retried.executionAttempts.map((a) => a.status),
        ["UNKNOWN", "FAILED", "CONFIRMED"],
      );
      assert.equal(retried.attempts, 3);
      assert.deepEqual(
        (await operations(round.id)).map((op) => [
          op.id,
          op.amount,
          op.destinationAccountId,
        ]),
        queued.map((op) => [op.id, op.amount, op.destinationAccountId]),
      );
    },
  );

  await check(
    "V3 atomic posting failures append durable attempts before retrying the same operation",
    async () => {
      const round = await open();
      await deposit(round.id, member.id, "1.00");
      const candidate = await scheme(round.id);
      await elect(round.id, [candidate.id], Array(6).fill(candidate.id));
      await prepareRoundSettlement(admin.id, scope(round.id), at(3.03));
      const [original] = await operations(round.id);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fundicate_test_v3_fail_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."roundId"='${round.id}'::uuid AND NEW.kind='PAYOUT' THEN RAISE EXCEPTION 'isolated V3 adapter failure'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER fundicate_test_v3_fail_posting BEFORE INSERT ON "RoundLedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_test_v3_fail_posting()`,
      );
      try {
        await assert.rejects(
          () => processRoundSettlement(admin.id, scope(round.id), at(3.04)),
          /isolated V3 adapter failure/,
        );
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER fundicate_test_v3_fail_posting ON "RoundLedgerTransaction"`,
        );
        await db.$executeRawUnsafe(
          `DROP FUNCTION fundicate_test_v3_fail_posting()`,
        );
      }
      const failed = await db.roundOperation.findUniqueOrThrow({
        where: { id: original.id },
        include: { executionAttempts: true },
      });
      assert.equal(failed.status, "FAILED");
      assert.equal(failed.attempts, 1);
      assert.equal(failed.transactionId, null);
      assert.equal(failed.executionAttempts[0].status, "FAILED");
      assert.equal((await conservation(round.id)).paid, 0n);
      await Promise.all(
        [admin, member].map((actor) =>
          processRoundSettlement(actor.id, scope(round.id), at(3.05)),
        ),
      );
      assert.equal((await conservation(round.id, true)).paid, 100n);
      const confirmed = await db.roundOperation.findUniqueOrThrow({
        where: { id: original.id },
        include: { executionAttempts: { orderBy: { attempt: "asc" } } },
      });
      assert.equal(confirmed.attempts, 2);
      assert.deepEqual(
        confirmed.executionAttempts.map((a) => a.status),
        ["FAILED", "CONFIRMED"],
      );
    },
  );

  await check(
    "V3 failed target freezes without queueing until the immutable decision is published",
    async () => {
      const round = await open({ fundingTarget: "2.00" });
      await deposit(round.id, member.id, "1.00");
      const result = await atomic(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${cid}::uuid FOR UPDATE`;
        return freezeRoundFunding(
          tx,
          await tx.fundingRound.findUniqueOrThrow({ where: { id: round.id } }),
          at(1),
        );
      });
      assert.equal(result.ready, false);
      assert.equal(result.reason, "FUNDING_FAILED");
      assert.equal((await conservation(round.id)).status, "HELD");
      assert.equal(
        await db.roundOperation.count({ where: { roundId: round.id } }),
        0,
      );
      assert.equal(
        await db.roundDecision.count({ where: { roundId: round.id } }),
        0,
      );
      await fundingRoundAction(
        admin.id,
        { ...scope(round.id), action: "screen" },
        at(1),
      );
      assert.deepEqual(
        plan(
          (
            await db.roundDecision.findUniqueOrThrow({
              where: { roundId: round.id },
            })
          ).allocation,
        ).payouts,
        [],
      );
      assert.equal((await settle(round.id, at(1.01))).refunded, 100n);
    },
  );

  await check(
    "V3 unresolved expiry can queue, process and replay original-source full refunds with either target outcome",
    async () => {
      for (const target of ["1.00", "2.00"]) {
        const round = await open({ fundingTarget: target });
        await deposit(round.id, member.id, "1.01");
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: cid, userId: member.id },
          },
          data: { status: "LEFT" },
        });
        try {
          const prepared = await prepareRoundSettlement(
            member.id,
            scope(round.id),
            at(10),
          );
          assert.equal(prepared.reason, "EXPIRED");
          const queued = await operations(round.id);
          assert.equal(queued.length, 1);
          assert.equal(queued[0].kind, "REFUND");
          await processRoundSettlement(member.id, scope(round.id), at(10.01));
          const final = await conservation(round.id, true);
          assert.equal(final.paid, 0n);
          assert.equal(final.refunded, 101n);
          assert.equal(final.status, "REFUNDED");
          await prepareRoundSettlement(member.id, scope(round.id), at(11));
          await processRoundSettlement(member.id, scope(round.id), at(11));
          assert.deepEqual(
            (await operations(round.id)).map((op) => op.id),
            queued.map((op) => op.id),
          );
          assert.equal(
            await db.roundDecision.count({ where: { roundId: round.id } }),
            0,
          );
          await conservation(round.id, true);
        } finally {
          await db.communityMembership.update({
            where: {
              communityId_userId: { communityId: cid, userId: member.id },
            },
            data: { status: "ACTIVE" },
          });
        }
      }
    },
  );
}
