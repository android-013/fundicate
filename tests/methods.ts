import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { createSession, sessionCookie } from "../src/lib/auth";
import { createCommunity } from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castMethodSelectionVote,
  castSelectionVote,
  getFundingRoundView,
} from "../src/lib/rounds";
import {
  contributeToRound,
  prepareRoundSettlement,
  processRoundSettlement,
} from "../src/lib/funded-rounds";
import {
  getV3RoundView,
  castRoundVetoVote,
  closeRoundVeto,
} from "../src/lib/rounds-v3";
import {
  METHODS,
  methodPairs,
  tallyMethod,
  type Method,
  type MethodBallot,
} from "../src/lib/methods-core";

type Check = (name: string, fn: () => Promise<void>) => Promise<void>;
type Policy = "WINNER_ALL" | "PROPORTIONAL" | "RANKED_CUTS";
type Weight = "EQUAL" | "CONTRIBUTION";
type Allocation = {
  received: string;
  payouts: {
    schemeId: string;
    amount: string;
    beneficiaryId: string;
    recipient: string;
  }[];
  refundTotal: string;
};
type Result = {
  counts: Record<string, string>;
  ranking: { schemeId: string; support: string; rank: number }[];
  elected: string[];
  eligible: string;
  participation: string;
  quorumRequired: string;
  transcript: unknown;
};
const day = 86400000;
const json = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );

/** Every matrix cell runs through actual funding, screening, ballot storage and settlement. */
export async function runMethodChecks(check: Check) {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "V4 method integration requires an isolated database.",
  );
  const suffix = randomUUID().slice(0, 8);
  const actors = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      db.user.create({
        data: {
          username: `methods${suffix}${index}`,
          email: `methods${suffix}${index}@elections.invalid`,
          displayName: `Method fixture ${index}`,
          passwordHash: "isolated-service-fixture-no-password-login",
        },
      }),
    ),
  );
  const [admin, member, third, author] = actors;
  const voters = [admin, member, third];
  const community = await createCommunity(admin.id, {
    name: "Complete election method matrix",
    slug: `method-matrix-${suffix}`,
    description:
      "Independent complete funded V4 method and allocation lifecycle fixtures.",
    purpose:
      "Choose shared projects and conserve every contributed minor unit.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  const communityId = community.id;
  await db.communityMembership.createMany({
    data: voters.slice(1).map((voter) => ({ communityId, userId: voter.id })),
  });
  const scope = (roundId: string) => ({ communityId, roundId });
  const old = new Date(Date.now() - 20 * day);
  async function fixture(
    selectionMethod: Method,
    selectionWeight: Weight = "EQUAL",
    allocationPolicy: Policy = "WINNER_ALL",
    extra: Record<string, unknown> = {},
    base = old,
  ) {
    const at = (offset: number) => new Date(base.getTime() + offset * day);
    const round = await createFundingRound(
      admin.id,
      {
        communityId,
        title: `Published ${selectionMethod} matrix round`,
        description:
          "A shared funded decision with immutable rules, recipients and deterministic allocation.",
        proposalPolicy: "EVERYONE",
        quorumBps: 5000,
        funded: true,
        fundedVersion: "V4",
        fundingTarget: "1.00",
        minimumContribution: "0.01",
        maximumContribution: "100.00",
        submissionsCloseAt: at(1).toISOString(),
        collectionClosesAt: at(0.5).toISOString(),
        expiresAt: at(10).toISOString(),
        screeningWeight: "EQUAL",
        selectionWeight,
        vetoWeight: "EQUAL",
        vetoEnabled: false,
        selectionMethod,
        selectionSeats: selectionMethod === "STV" ? 2 : 1,
        allocationPolicy,
        rankedSharesBps:
          allocationPolicy === "RANKED_CUTS" ? [6000, 3000, 1000] : [],
        ...extra,
      },
      base,
    );
    await fundingRoundAction(
      admin.id,
      { ...scope(round.id), action: "open" },
      base,
    );
    for (const [index, amount] of ["0.50", "0.30", "0.20"].entries())
      await contributeToRound(
        voters[index].id,
        { ...scope(round.id), amount, idempotencyKey: randomUUID() },
        base,
      );
    const schemes = [];
    for (let index = 0; index < 3; index++)
      schemes.push(
        await submitFundingScheme(
          author.id,
          {
            ...scope(round.id),
            title: `Useful shared project ${index}`,
            description:
              "A complete project with a fixed request and published recipient for this round.",
            amount: "1.00",
            recipient: `Published recipient ${index}`,
            category: "DONATION",
            supportingUrl: "",
          },
          base,
        ),
      );
    // Labels A/B/C follow IDs so declared ID tiebreaks cannot randomize this reference oracle.
    schemes.sort((a, b) => (a.id < b.id ? -1 : 1));
    const ids = schemes.map((scheme) => scheme.id);
    await fundingRoundAction(
      admin.id,
      { ...scope(round.id), action: "screen" },
      at(1),
    );
    for (const schemeId of ids)
      for (const voter of voters)
        await castScreeningVote(
          voter.id,
          { ...scope(round.id), schemeId, choice: "YES" },
          at(1.01),
        );
    await fundingRoundAction(
      admin.id,
      { ...scope(round.id), action: "close-screening" },
      at(2.01),
    );
    const preferences = [
      [ids[0], ids[1], ids[2]],
      [ids[0], ids[1], ids[2]],
      [ids[1], ids[0], ids[2]],
    ];
    const ballot = (index: number): MethodBallot => {
      const ranking = preferences[index];
      if (selectionMethod === "FPTP") return { schemeId: ranking[0] };
      if (selectionMethod === "IRV" || selectionMethod === "STV")
        return { ranking: [...ranking] };
      return {
        pairs: methodPairs(ids).map((pair) => ({
          ...pair,
          choice: ranking.indexOf(pair.a) < ranking.indexOf(pair.b) ? "A" : "B",
        })),
      };
    };
    return {
      round,
      at,
      schemes,
      ids,
      ballot,
      selectionMethod,
      selectionWeight,
    };
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
    for (const transaction of transactions) {
      assert.equal(transaction.entries.length, 2);
      assert.equal(
        transaction.entries.reduce((sum, entry) => sum + entry.amount, 0n),
        0n,
      );
      assert.equal(transaction.assetId, settlement.assetId);
    }
    const operations = await db.roundOperation.findMany({
      where: { roundId },
      include: { destination: true },
      orderBy: { operationKey: "asc" },
    });
    for (const operation of operations) {
      if (operation.kind === "REFUND") {
        assert.equal(operation.destination.ownerId, operation.beneficiaryId);
        assert.equal(
          operation.destination.key,
          `EXTERNAL:${operation.beneficiaryId}`,
        );
        assert.equal(
          operation.operationKey,
          `refund:${operation.destination.id}`,
        );
      }
      if (final) {
        assert.equal(operation.status, "CONFIRMED");
        const receipts = transactions.filter(
          (transaction) =>
            transaction.operationKey === `execute:${operation.id}`,
        );
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0].id, operation.transactionId);
        assert.equal(receipts[0].amount, operation.amount);
        assert.equal(
          receipts[0].destinationAccountId,
          operation.destinationAccountId,
        );
      }
    }
    if (final) {
      assert.equal(byKey.get("HELD")!.balance, 0n);
      assert.equal(byKey.get("RESERVED")!.balance, 0n);
      assert.equal(settlement.received, settlement.paid + settlement.refunded);
    }
    return { settlement, operations, accounts, transactions };
  }
  async function assertSealed(f: Awaited<ReturnType<typeof fixture>>) {
    const [own, other, publicView, ownV3, otherV3] = await Promise.all([
      getFundingRoundView(communityId, f.round.id, admin.id),
      getFundingRoundView(communityId, f.round.id, author.id),
      getFundingRoundView(communityId, f.round.id),
      getV3RoundView(communityId, f.round.id, admin.id, f.at(2.03)),
      getV3RoundView(communityId, f.round.id, author.id, f.at(2.03)),
    ]);
    assert.deepEqual(own.ownMethodBallot, f.ballot(0));
    for (const view of [own, other, publicView]) {
      assert.equal(view.methodBallots, null);
      assert.equal(view.selectionBallots, null);
      assert.equal(view.selectionResults, null);
    }
    assert.equal(other.ownMethodBallot, null);
    assert.equal(publicView.ownMethodBallot, null);
    for (const view of [ownV3, otherV3]) {
      assert.ok(view);
      assert.equal(view.selectionResult, null);
      assert.equal(view.decision, null);
      assert.doesNotMatch(
        JSON.stringify(json(view)),
        /"transcript"|"ratingPeriod"|"netScores"/,
      );
    }
    const events = await db.auditEvent.findMany({
      where: { communityId, entityId: f.round.id },
    });
    assert.ok(
      events.every(
        (event) =>
          !/"pairs"|"ranking"|"ballot"/.test(JSON.stringify(event.details)),
      ),
      "No per-voter selection payload enters the audit stream while sealed.",
    );
  }
  async function elect(f: Awaited<ReturnType<typeof fixture>>) {
    for (const [index, voter] of voters.entries())
      await castMethodSelectionVote(
        voter.id,
        { ...scope(f.round.id), ballot: f.ballot(index) },
        f.at(2.02),
      );
    await assertSealed(f);
    await fundingRoundAction(
      admin.id,
      { ...scope(f.round.id), action: "close-selection" },
      f.at(3.02),
    );
    return db.roundDecision.findUniqueOrThrow({
      where: { roundId: f.round.id },
    });
  }

  for (const method of METHODS)
    for (const weight of ["EQUAL", "CONTRIBUTION"] as const)
      for (const policy of [
        "WINNER_ALL",
        "PROPORTIONAL",
        "RANKED_CUTS",
      ] as const)
        await check(
          `V4 ${method}-${weight}-${policy}: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay`,
          async () => {
            const f = await fixture(method, weight, policy);
            const decision = await elect(f);
            const allocation = decision.allocation as unknown as Allocation;
            const result = decision.result as unknown as Result;
            const amounts =
              policy === "WINNER_ALL"
                ? [100n, 0n, 0n]
                : policy === "RANKED_CUTS"
                  ? method === "FPTP"
                    ? [60n, 30n, 0n]
                    : [60n, 30n, 10n]
                  : method === "FPTP"
                    ? weight === "EQUAL"
                      ? [67n, 33n, 0n]
                      : [80n, 20n, 0n]
                    : [50n, 33n, 17n];
            const expectedPayouts = new Map(
              f.ids.flatMap((id, index) =>
                amounts[index] > 0n
                  ? [[id, amounts[index].toString()] as const]
                  : [],
              ),
            );
            const paid = amounts.reduce((sum, value) => sum + value, 0n),
              refunded = 100n - paid;
            assert.equal(allocation.received, "100");
            assert.equal(allocation.refundTotal, refunded.toString());
            assert.deepEqual(
              new Map(
                allocation.payouts.map((payout) => [
                  payout.schemeId,
                  payout.amount,
                ]),
              ),
              expectedPayouts,
            );
            for (const payout of allocation.payouts) {
              assert.equal(payout.beneficiaryId, author.id);
              assert.equal(
                payout.recipient,
                f.schemes.find((scheme) => scheme.id === payout.schemeId)!
                  .recipient,
              );
            }
            assert.equal(result.eligible, weight === "EQUAL" ? "3" : "100");
            assert.equal(result.participation, result.eligible);
            assert.deepEqual(
              result.ranking.map((entry) => entry.schemeId),
              f.ids,
            );
            assert.deepEqual(
              result.ranking.map((entry) => entry.support),
              method === "FPTP"
                ? weight === "EQUAL"
                  ? ["2", "1", "0"]
                  : ["80", "20", "0"]
                : ["3", "2", "1"],
            );
            if (method === "STV")
              assert.deepEqual(result.elected, [f.ids[0], f.ids[1]]);
            const replay = tallyMethod(
              {
                selectionMethod: method,
                selectionSeats: method === "STV" ? 2 : 1,
              },
              [...f.ids].reverse(),
              [...voters].reverse().map((voter) => {
                const index = voters.indexOf(voter);
                return {
                  userId: voter.id,
                  power: weight === "EQUAL" ? 1n : [50n, 30n, 20n][index],
                  ballot: f.ballot(index),
                };
              }),
              weight === "EQUAL" ? 3n : 100n,
              5000,
            );
            assert.deepEqual(result.transcript, json(replay.transcript));
            assert.deepEqual(result.counts, json(replay.counts));
            const after = await getFundingRoundView(
              communityId,
              f.round.id,
              author.id,
            );
            assert.equal(after.methodBallots!.length, 3);
            const publishedResult = (await getV3RoundView(
              communityId,
              f.round.id,
              author.id,
              f.at(3.03),
            ))!.selectionResult;
            assert.ok(publishedResult && "transcript" in publishedResult);
            assert.deepEqual(publishedResult.transcript, replay.transcript);
            await prepareRoundSettlement(
              admin.id,
              scope(f.round.id),
              f.at(3.03),
            );
            const queued = await conservation(f.round.id);
            assert.deepEqual(
              new Map(
                queued.operations
                  .filter((operation) => operation.kind === "PAYOUT")
                  .map((operation) => [
                    operation.schemeId,
                    operation.amount.toString(),
                  ]),
              ),
              expectedPayouts,
            );
            const expectedRefunds = [
              (refunded * 50n) / 100n,
              (refunded * 30n) / 100n,
              (refunded * 20n) / 100n,
            ];
            assert.deepEqual(
              new Map(
                queued.operations
                  .filter((operation) => operation.kind === "REFUND")
                  .map((operation) => [
                    operation.beneficiaryId,
                    operation.amount,
                  ]),
              ),
              new Map(
                voters.flatMap((voter, index) =>
                  expectedRefunds[index] > 0n
                    ? [[voter.id, expectedRefunds[index]] as const]
                    : [],
                ),
              ),
            );
            await Promise.all(
              [admin, member].map((actor) =>
                processRoundSettlement(actor.id, scope(f.round.id), f.at(3.04)),
              ),
            );
            const final = await conservation(f.round.id, true);
            assert.equal(final.settlement.paid, paid);
            assert.equal(final.settlement.refunded, refunded);
            for (const [index, voter] of voters.entries())
              assert.equal(
                final.accounts.find((account) => account.ownerId === voter.id)!
                  .balance,
                -[50n, 30n, 20n][index] + expectedRefunds[index],
              );
            const operationIdentity = (operations: typeof final.operations) =>
              operations.map((operation) => [
                operation.id,
                operation.operationKey,
                operation.amount.toString(),
                operation.sourceAccountId,
                operation.destinationAccountId,
              ]);
            assert.deepEqual(
              operationIdentity(final.operations),
              operationIdentity(queued.operations),
            );
            await Promise.all(
              [admin, member].map((actor) =>
                processRoundSettlement(actor.id, scope(f.round.id), f.at(11)),
              ),
            );
            await prepareRoundSettlement(admin.id, scope(f.round.id), f.at(11));
            const repeated = await conservation(f.round.id, true);
            assert.equal(
              repeated.transactions.length,
              final.transactions.length,
            );
            assert.deepEqual(
              repeated.settlement.allocationSnapshot,
              final.settlement.allocationSnapshot,
            );
            assert.deepEqual(
              operationIdentity(repeated.operations),
              operationIdentity(queued.operations),
            );
            assert.deepEqual(
              (
                await db.roundDecision.findUniqueOrThrow({
                  where: { roundId: f.round.id },
                })
              ).allocation,
              decision.allocation,
            );
            assert.equal(
              await db.roundLedgerTransaction.count({
                where: { roundId: f.round.id, operationKey: "reserve:v4" },
              }),
              1,
            );
          },
        );

  await check(
    "V4 ranked/pairwise HTTP and SQL reject duplicate, missing, reversed, foreign, wrong-method and ineligible ballots",
    async () => {
      const sessions = await Promise.all(
        [admin, member, third, author].map((actor) => createSession(actor.id)),
      );
      const cookies = sessions.map(
        (session) => `${sessionCookie}=${session.token}`,
      );
      async function post(
        roundId: string,
        ballot: unknown,
        cookie: string,
        status: number,
        operation = "round-method-vote",
      ) {
        const origin = process.env.APP_ORIGIN!;
        const response = await fetch(`${origin}/api/${operation}`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: JSON.stringify({
            ...scope(roundId),
            ...(operation === "round-selection-vote"
              ? { schemeId: (ballot as { schemeId: string }).schemeId }
              : { ballot }),
          }),
        });
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
      }
      for (const method of ["IRV", "GLICKO_2", "FORCED_PAIRWISE"] as const) {
        const f = await fixture(
          method,
          "EQUAL",
          "WINNER_ALL",
          {},
          new Date(Date.now() - 2.5 * day),
        );
        const valid = f.ballot(0);
        const invalid: unknown[] =
          method === "IRV"
            ? [
                { ranking: [f.ids[0], f.ids[0]] },
                { ranking: [] },
                { ranking: [randomUUID()] },
                { ranking: f.ids, extra: true },
              ]
            : (() => {
                const pairs = (
                  valid as { pairs: { a: string; b: string; choice: string }[] }
                ).pairs;
                return [
                  { pairs: pairs.slice(1) },
                  { pairs: [pairs[0], pairs[0], pairs[2]] },
                  {
                    pairs: [
                      { a: pairs[0].b, b: pairs[0].a, choice: "A" },
                      ...pairs.slice(1),
                    ],
                  },
                  {
                    pairs: [
                      { ...pairs[0], a: randomUUID() },
                      ...pairs.slice(1),
                    ],
                  },
                  ...(method === "FORCED_PAIRWISE"
                    ? [
                        {
                          pairs: pairs.map((pair) => ({
                            ...pair,
                            choice: "DRAW",
                          })),
                        },
                      ]
                    : []),
                ];
              })();
        for (const ballot of invalid) {
          await post(f.round.id, ballot, cookies[0], 400);
          await assert.rejects(() =>
            db.roundMethodBallot.create({
              data: {
                roundId: f.round.id,
                userId: admin.id,
                method,
                ballot: json(ballot),
                createdAt: f.at(2.02),
              },
            }),
          );
        }
        await post(f.round.id, valid, cookies[3], 403);
        await post(
          f.round.id,
          { schemeId: f.ids[0] },
          cookies[0],
          400,
          "round-selection-vote",
        );
        await assert.rejects(
          () =>
            castSelectionVote(
              admin.id,
              { ...scope(f.round.id), schemeId: f.ids[0] },
              f.at(2.02),
            ),
          /V4|method|complete/i,
        );
        await assert.rejects(() =>
          db.roundMethodBallot.create({
            data: {
              roundId: f.round.id,
              userId: author.id,
              method,
              ballot: json(valid),
              createdAt: f.at(2.02),
            },
          }),
        );
        await assert.rejects(() =>
          db.roundMethodBallot.create({
            data: {
              roundId: f.round.id,
              userId: admin.id,
              method: method === "IRV" ? "STV" : "ELO",
              ballot: json(valid),
              createdAt: f.at(2.02),
            },
          }),
        );
        assert.equal(
          await db.roundMethodBallot.count({ where: { roundId: f.round.id } }),
          0,
        );
        await post(f.round.id, valid, cookies[0], 200);
        await post(f.round.id, valid, cookies[0], 409);
        const stored = await db.roundMethodBallot.findUniqueOrThrow({
          where: { roundId_userId: { roundId: f.round.id, userId: admin.id } },
        });
        await assert.rejects(
          () =>
            db.roundMethodBallot.update({
              where: { id: stored.id },
              data: { ballot: json(f.ballot(2)) },
            }),
          /immutable/i,
        );
        await assert.rejects(
          () => db.roundMethodBallot.delete({ where: { id: stored.id } }),
          /immutable/i,
        );
        await assert.rejects(
          () =>
            db.roundSelectionVote.create({
              data: {
                roundId: f.round.id,
                userId: member.id,
                schemeId: f.ids[0],
                createdAt: f.at(2.02),
              },
            }),
          /V4|method|complete/i,
        );
      }
    },
  );

  await check(
    "V4 Glicko-2 enabled veto blocks every early transfer and refunds exact original sources after unanimous rejection",
    async () => {
      const f = await fixture("GLICKO_2", "CONTRIBUTION", "PROPORTIONAL", {
        vetoEnabled: true,
        vetoWeight: "CONTRIBUTION",
        expiresAt: new Date(old.getTime() + 4.01 * day).toISOString(),
      });
      const decision = await elect(f);
      const deadline = decision.vetoClosesAt!,
        early = new Date(deadline.getTime() - 1);
      for (const voter of voters)
        await castRoundVetoVote(
          voter.id,
          { ...scope(f.round.id), choice: "REJECT" },
          f.at(3.03),
        );
      for (const now of [f.at(3.04), early]) {
        await assert.rejects(
          () => prepareRoundSettlement(admin.id, scope(f.round.id), now),
          /veto|window|24/i,
        );
        await assert.rejects(
          () => processRoundSettlement(admin.id, scope(f.round.id), now),
          /veto|window|24/i,
        );
        await assert.rejects(
          () => closeRoundVeto(admin.id, scope(f.round.id), now),
          /veto|window|24/i,
        );
      }
      const before = await conservation(f.round.id);
      await assert.rejects(
        () =>
          db.roundOperation.create({
            data: {
              roundId: f.round.id,
              operationKey: `payout:${f.ids[0]}`,
              kind: "PAYOUT",
              amount: 50n,
              beneficiaryId: author.id,
              sourceAccountId: before.accounts.find(
                (account) => account.key === "RESERVED",
              )!.id,
              destinationAccountId: before.accounts.find(
                (account) => account.key === "PAID",
              )!.id,
              schemeId: f.ids[0],
              recipient: f.schemes[0].recipient,
              createdAt: early,
            },
          }),
        /veto|window/i,
      );
      assert.equal(
        (await getV3RoundView(communityId, f.round.id, author.id, early))!.veto
          .ballots,
        null,
      );
      await prepareRoundSettlement(admin.id, scope(f.round.id), deadline);
      await Promise.all(
        [admin, member].map((actor) =>
          processRoundSettlement(actor.id, scope(f.round.id), deadline),
        ),
      );
      const final = await conservation(f.round.id, true);
      assert.equal(final.settlement.paid, 0n);
      assert.equal(final.settlement.refunded, 100n);
      assert.equal(
        final.operations.filter((operation) => operation.kind === "PAYOUT")
          .length,
        0,
      );
      assert.deepEqual(
        new Map(
          final.operations
            .filter((operation) => operation.kind === "REFUND")
            .map((operation) => [operation.beneficiaryId, operation.amount]),
        ),
        new Map(
          voters.map((voter, index) => [voter.id, [50n, 30n, 20n][index]]),
        ),
      );
      const finalized = await db.roundDecision.findUniqueOrThrow({
        where: { roundId: f.round.id },
      });
      assert.equal(finalized.rejected, true);
      assert.deepEqual(finalized.allocation, decision.allocation);
      assert.deepEqual(finalized.result, decision.result);
      await assert.rejects(
        () =>
          db.roundDecision.update({
            where: { roundId: f.round.id },
            data: { result: {} },
          }),
        /immutable/i,
      );
    },
  );

  await check(
    "V4 paid voter rights stay frozen after departure and late membership grants no selection power",
    async () => {
      const f = await fixture("IRV", "CONTRIBUTION", "WINNER_ALL");
      const before = await db.roundVotingPower.findMany({
        where: { roundId: f.round.id },
        orderBy: { userId: "asc" },
      });
      await db.communityMembership.update({
        where: { communityId_userId: { communityId, userId: member.id } },
        data: { status: "LEFT" },
      });
      await db.communityMembership.create({
        data: { communityId, userId: author.id },
      });
      try {
        await castMethodSelectionVote(
          member.id,
          { ...scope(f.round.id), ballot: f.ballot(1) },
          f.at(2.02),
        );
        await assert.rejects(
          () =>
            castMethodSelectionVote(
              author.id,
              { ...scope(f.round.id), ballot: f.ballot(0) },
              f.at(2.02),
            ),
          /frozen|power|snapshot/i,
        );
        assert.deepEqual(
          await db.roundVotingPower.findMany({
            where: { roundId: f.round.id },
            orderBy: { userId: "asc" },
          }),
          before,
        );
        assert.equal(
          (await getV3RoundView(
            communityId,
            f.round.id,
            member.id,
            f.at(2.03),
          ))!.ownPower.selection,
          30n,
        );
        assert.equal(
          (await getV3RoundView(
            communityId,
            f.round.id,
            author.id,
            f.at(2.03),
          ))!.ownPower.selection,
          0n,
        );
        for (const index of [0, 2])
          await castMethodSelectionVote(
            voters[index].id,
            { ...scope(f.round.id), ballot: f.ballot(index) },
            f.at(2.02),
          );
        await fundingRoundAction(
          admin.id,
          { ...scope(f.round.id), action: "close-selection" },
          f.at(3.02),
        );
        await prepareRoundSettlement(admin.id, scope(f.round.id), f.at(3.03));
        await processRoundSettlement(admin.id, scope(f.round.id), f.at(3.04));
        assert.equal(
          (await conservation(f.round.id, true)).settlement.paid,
          100n,
        );
      } finally {
        await db.communityMembership.update({
          where: { communityId_userId: { communityId, userId: member.id } },
          data: { status: "ACTIVE" },
        });
        await db.communityMembership.update({
          where: { communityId_userId: { communityId, userId: author.id } },
          data: { status: "LEFT" },
        });
      }
    },
  );

  await check(
    "V4 actual 50-candidate HTTP ballot records all 1,225 comparisons once and stays sealed until selection closes",
    async () => {
      const base = new Date(Date.now() - 2.02 * day);
      const at = (offset: number) => new Date(base.getTime() + offset * day);
      const round = await createFundingRound(
        admin.id,
        {
          communityId,
          title: "Complete fifty-candidate Glicko-2 workload",
          description:
            "A complete published fifty-candidate assignment verifies actual HTTP payload size, coverage and ballot secrecy.",
          proposalPolicy: "EVERYONE",
          quorumBps: 5000,
          funded: true,
          fundedVersion: "V4",
          fundingTarget: "1.00",
          minimumContribution: "0.01",
          maximumContribution: "100.00",
          submissionsCloseAt: at(1).toISOString(),
          collectionClosesAt: at(0.5).toISOString(),
          expiresAt: at(10).toISOString(),
          screeningWeight: "EQUAL",
          selectionWeight: "EQUAL",
          vetoWeight: "EQUAL",
          vetoEnabled: false,
          selectionMethod: "GLICKO_2",
          selectionSeats: 1,
          allocationPolicy: "WINNER_ALL",
          rankedSharesBps: [],
        },
        base,
      );
      await fundingRoundAction(
        admin.id,
        { ...scope(round.id), action: "open" },
        base,
      );
      for (const [index, amount] of ["0.50", "0.30", "0.20"].entries())
        await contributeToRound(
          voters[index].id,
          { ...scope(round.id), amount, idempotencyKey: randomUUID() },
          base,
        );
      // Ten actual, distinct author accounts respect the five-schemes-per-author limit.
      const authors = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          db.user.create({
            data: {
              username: `large${suffix}${index}`,
              email: `large${suffix}${index}@elections.invalid`,
              displayName: `Fifty candidate author ${index}`,
              passwordHash: "isolated-service-fixture-no-password-login",
            },
          }),
        ),
      );
      const schemeIds: string[] = [];
      for (const [authorIndex, proposer] of authors.entries())
        for (let index = 0; index < 5; index++) {
          const scheme = await submitFundingScheme(
            proposer.id,
            {
              ...scope(round.id),
              title: `Published workload project ${authorIndex * 5 + index}`,
              description:
                "A concrete project with a complete description and a published recipient for this workload round.",
              amount: "1.00",
              recipient: `Workload recipient ${authorIndex * 5 + index}`,
              category: "DONATION",
              supportingUrl: "",
            },
            base,
          );
          schemeIds.push(scheme.id);
        }
      assert.equal(schemeIds.length, 50);
      await fundingRoundAction(
        admin.id,
        { ...scope(round.id), action: "screen" },
        at(1),
      );
      for (const schemeId of schemeIds)
        for (const voter of voters)
          await castScreeningVote(
            voter.id,
            { ...scope(round.id), schemeId, choice: "YES" },
            at(1.01),
          );
      await fundingRoundAction(
        admin.id,
        { ...scope(round.id), action: "close-screening" },
        at(2.01),
      );
      assert.equal(
        await db.fundingScheme.count({
          where: { roundId: round.id, status: "QUALIFIED" },
        }),
        50,
      );
      const pairs = methodPairs(schemeIds).map((pair) => ({
        ...pair,
        choice: "A" as const,
      }));
      assert.equal(pairs.length, 1225);
      assert.equal(
        new Set(pairs.map((pair) => `${pair.a}/${pair.b}`)).size,
        1225,
      );
      assert.ok(pairs.every((pair) => pair.a < pair.b));
      const ballot = { pairs };
      const body = JSON.stringify({ ...scope(round.id), ballot });
      const payloadBytes = Buffer.byteLength(body, "utf8");
      assert.ok(
        payloadBytes > 40000 && payloadBytes < 250000,
        `Complete 1,225-pair payload is ${payloadBytes} bytes`,
      );
      const session = await createSession(admin.id);
      const origin = process.env.APP_ORIGIN!;
      async function submit(expectedStatus: number) {
        const response = await fetch(`${origin}/api/round-method-vote`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            Cookie: `${sessionCookie}=${session.token}`,
          },
          body,
        });
        const result = await response.json();
        assert.equal(response.status, expectedStatus, JSON.stringify(result));
      }
      await submit(200);
      await submit(409);
      assert.equal(
        await db.roundMethodBallot.count({ where: { roundId: round.id } }),
        1,
      );
      const own = await getFundingRoundView(communityId, round.id, admin.id);
      assert.deepEqual(own.ownMethodBallot, ballot);
      assert.equal(
        (own.ownMethodBallot as unknown as { pairs: unknown[] }).pairs.length,
        1225,
      );
      for (const view of [
        own,
        await getFundingRoundView(communityId, round.id, member.id),
        await getFundingRoundView(communityId, round.id),
      ])
        assert.equal(view.methodBallots, null);
      assert.equal(
        (await getFundingRoundView(communityId, round.id, member.id))
          .ownMethodBallot,
        null,
      );
      assert.equal(
        (await getFundingRoundView(communityId, round.id)).ownMethodBallot,
        null,
      );
      assert.equal(
        (await getV3RoundView(communityId, round.id, member.id))!
          .selectionResult,
        null,
      );
      await fundingRoundAction(
        admin.id,
        { ...scope(round.id), action: "close-selection" },
        at(3.02),
      );
      const published = await getFundingRoundView(communityId, round.id);
      assert.equal(published.methodBallots!.length, 1);
      assert.deepEqual(published.methodBallots![0].ballot, ballot);
      const result = (await getV3RoundView(communityId, round.id))!
        .selectionResult;
      assert.ok(result && "transcript" in result);
      assert.equal(
        result.participation,
        1n,
        "1,225 comparisons count as one voter for quorum.",
      );
      assert.equal(result.eligible, 3n);
      assert.equal(result.outcome, "NO_QUORUM");
      await prepareRoundSettlement(admin.id, scope(round.id), at(3.03));
      await processRoundSettlement(admin.id, scope(round.id), at(3.04));
      const final = await conservation(round.id, true);
      assert.equal(final.settlement.paid, 0n);
      assert.equal(final.settlement.refunded, 100n);
    },
  );
}
