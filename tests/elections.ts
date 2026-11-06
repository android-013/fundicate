import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { createCommunity, manageMember } from "../src/lib/service";
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
} from "../src/lib/funded-rounds";
import {
  castRoundVetoVote,
  closeRoundVeto,
  getV3RoundView,
} from "../src/lib/rounds-v3";
import { runElectionFinanceChecks } from "./elections-finance";
import { runMethodChecks } from "./methods";
import { runMethodBrowserChecks } from "./methods-browser";

const origin = process.env.APP_ORIGIN!;
const day = 86400000;
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
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
async function account(name: string) {
  const response = await fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: `${name}@elections.invalid`,
      username: name,
      displayName: name,
      password: "ElectionTestPassword!2026",
    }),
  });
  assert.equal(response.status, 200, await response.text());
  return {
    user: await db.user.findUniqueOrThrow({
      where: { email: `${name}@elections.invalid` },
    }),
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
type Actor = Awaited<ReturnType<typeof account>>;
async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Elections require an isolated test database.",
  );
  const [admin, rich, small, outsider] = await Promise.all(
    ["electadmin", "electrich", "electsmall", "electoutside"].map(account),
  );
  let communityNumber = 0;
  async function community() {
    const c = await createCommunity(admin.user.id, {
      name: "Weighted collective",
      slug: `weighted-collective-${++communityNumber}`,
      description:
        "A community for exact, published voting and allocation rules.",
      purpose:
        "Fund useful projects through fair and transparent collective decisions.",
      currency: "USD",
      minimumContribution: "0",
      questions: "",
    });
    await db.communityMembership.createMany({
      data: [rich, small].map((actor) => ({
        communityId: c.id,
        userId: actor.user.id,
      })),
    });
    return c;
  }
  const c = await community();
  const old = new Date(Date.now() - 4 * day);
  const at = (offset: number) => new Date(old.getTime() + offset * day);
  function input(
    communityId = c.id,
    now = old,
    extra: Record<string, unknown> = {},
  ) {
    return {
      communityId,
      title: "A weighted shared funding decision",
      description:
        "Choose useful community projects with exact, immutable voting and payment rules.",
      proposalPolicy: "EVERYONE",
      quorumBps: 5000,
      funded: true,
      fundedVersion: "V3",
      fundingTarget: "1.00",
      minimumContribution: "0.01",
      maximumContribution: "100.00",
      submissionsCloseAt: new Date(now.getTime() + day).toISOString(),
      collectionClosesAt: new Date(now.getTime() + day / 2).toISOString(),
      expiresAt: new Date(now.getTime() + 8 * day).toISOString(),
      screeningWeight: "CONTRIBUTION",
      selectionWeight: "CONTRIBUTION",
      vetoWeight: "CONTRIBUTION",
      allocationPolicy: "PROPORTIONAL",
      rankedSharesBps: [],
      vetoEnabled: true,
      ...extra,
    };
  }
  async function open(
    extra: Record<string, unknown> = {},
    communityId = c.id,
    now = old,
  ) {
    const round = await createFundingRound(
      admin.user.id,
      input(communityId, now, extra),
      now,
    );
    await fundingRoundAction(
      admin.user.id,
      { communityId, roundId: round.id, action: "open" },
      now,
    );
    return round;
  }
  const scope = (roundId: string, communityId = c.id) => ({
    communityId,
    roundId,
  });
  async function deposit(
    roundId: string,
    actor: Actor,
    amount: string,
    communityId = c.id,
    now = old,
  ) {
    return contributeToRound(
      actor.user.id,
      { ...scope(roundId, communityId), amount, idempotencyKey: randomUUID() },
      now,
    );
  }
  async function prepaid(roundId: string) {
    await deposit(roundId, rich, "0.90");
    await deposit(roundId, admin, "0.05");
    await deposit(roundId, small, "0.05");
  }
  async function scheme(roundId: string, title: string) {
    return submitFundingScheme(
      outsider.user.id,
      {
        ...scope(roundId),
        title,
        description:
          "A detailed useful plan with a published recipient and request cap.",
        category: "DONATION",
        amount: "1.00",
        recipient: `${title} recipient`,
      },
      old,
    );
  }
  async function qualify(
    roundId: string,
    schemeIds: string[],
    minority = false,
  ) {
    await fundingRoundAction(
      admin.user.id,
      { ...scope(roundId), action: "screen" },
      at(1),
    );
    for (const [index, schemeId] of schemeIds.entries())
      for (const actor of [admin, rich, small])
        await castScreeningVote(
          actor.user.id,
          {
            ...scope(roundId),
            schemeId,
            choice: minority && index === 0 && actor !== rich ? "NO" : "YES",
          },
          at(1.01),
        );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(roundId), action: "close-screening" },
      at(2.01),
    );
  }
  async function choose(
    roundId: string,
    first: string,
    second: string,
    publishedAt = at(3.02),
  ) {
    await castSelectionVote(
      rich.user.id,
      { ...scope(roundId), schemeId: first },
      at(2.02),
    );
    for (const actor of [admin, small])
      await castSelectionVote(
        actor.user.id,
        { ...scope(roundId), schemeId: second },
        at(2.02),
      );
    return fundingRoundAction(
      admin.user.id,
      { ...scope(roundId), action: "close-selection" },
      publishedAt,
    );
  }
  async function completed(
    extra: Record<string, unknown> = {},
    publishedAt = at(3.02),
  ) {
    const round = await open(extra);
    await prepaid(round.id);
    const first = await scheme(round.id, "First supported scheme"),
      second = await scheme(round.id, "Second supported scheme");
    await qualify(round.id, [first.id, second.id]);
    await choose(round.id, first.id, second.id, publishedAt);
    return {
      round,
      first,
      second,
      decision: await db.roundDecision.findUniqueOrThrow({
        where: { roundId: round.id },
      }),
    };
  }

  await check(
    "V3 independently configures stage power, weighted approval and sealed stage results",
    async () => {
      const round = await open({
        selectionWeight: "EQUAL",
        vetoEnabled: false,
      });
      await prepaid(round.id);
      const first = await scheme(round.id, "Weighted screening proposal"),
        second = await scheme(round.id, "Equal selection proposal");
      await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id), action: "screen" },
        at(1),
      );
      for (const actor of [admin, rich, small])
        for (const candidate of [first, second])
          await castScreeningVote(
            actor.user.id,
            {
              ...scope(round.id),
              schemeId: candidate.id,
              choice:
                candidate.id === first.id && actor !== rich
                  ? "NO"
                  : candidate.id === second.id && actor === small
                    ? "ABSTAIN"
                    : "YES",
            },
            at(1.01),
          );
      const pending = await getV3RoundView(
        c.id,
        round.id,
        admin.user.id,
        at(1.02),
      );
      assert.equal(pending!.screeningResults, null);
      assert.equal(pending!.selectionResult, null);
      assert.deepEqual(pending!.ownPower, {
        screening: 5n,
        selection: 1n,
        veto: 5n,
      });
      assert.deepEqual(pending!.totalPower, {
        screening: 100n,
        selection: 3n,
        veto: 100n,
      });
      await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id), action: "close-screening" },
        at(2.01),
      );
      const screened = await getV3RoundView(
        c.id,
        round.id,
        rich.user.id,
        at(2.01),
      );
      const weighted = screened!.screeningResults!.find(
        (result) => result.schemeId === first.id,
      )!;
      assert.equal(weighted.yes, 90n);
      assert.equal(weighted.no, 10n);
      assert.equal(weighted.approved, true);
      const abstention = screened!.screeningResults!.find(
        (result) => result.schemeId === second.id,
      )!;
      assert.equal(abstention.abstain, 5n);
      assert.equal(abstention.participation, 100n);
      assert.equal(abstention.approved, true);
      assert.equal(screened!.selectionResult, null);
      await castSelectionVote(
        rich.user.id,
        { ...scope(round.id), schemeId: first.id },
        at(2.02),
      );
      const sealedSelection = await getV3RoundView(
        c.id,
        round.id,
        small.user.id,
        at(2.02),
      );
      assert.equal(sealedSelection!.selectionResult, null);
      assert.equal(sealedSelection!.decision, null);
      for (const actor of [admin, small])
        await castSelectionVote(
          actor.user.id,
          { ...scope(round.id), schemeId: second.id },
          at(2.02),
        );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id), action: "close-selection" },
        at(3.02),
      );
      const result = await getV3RoundView(
        c.id,
        round.id,
        admin.user.id,
        at(3.02),
      );
      assert.equal(result!.selectionResult!.winnerSchemeId, second.id);
      assert.equal(result!.selectionResult!.counts[second.id], 2n);
      assert.equal(result!.settings.screeningWeight, "CONTRIBUTION");
      assert.equal(result!.settings.selectionWeight, "EQUAL");
    },
  );

  await check(
    "post-cutoff departures and role changes preserve frozen power and ballot rights",
    async () => {
      const round = await open();
      await prepaid(round.id);
      const first = await scheme(round.id, "Departed member choice"),
        second = await scheme(round.id, "Other member choice");
      await qualify(round.id, [first.id, second.id]);
      await manageMember(rich.user.id, {
        communityId: c.id,
        userId: rich.user.id,
        action: "leave",
      });
      await manageMember(admin.user.id, {
        communityId: c.id,
        userId: small.user.id,
        action: "moderator",
      });
      try {
        await choose(round.id, first.id, second.id);
        const result = await getV3RoundView(
          c.id,
          round.id,
          rich.user.id,
          at(3.02),
        );
        assert.equal(result!.ownPower.selection, 90n);
        assert.equal(result!.selectionResult!.counts[first.id], 90n);
        assert.equal(result!.totalPower.selection, 100n);
        await castRoundVetoVote(
          rich.user.id,
          { ...scope(round.id), choice: "REJECT" },
          at(3.03),
        );
        assert.equal(
          (await getV3RoundView(c.id, round.id, rich.user.id, at(3.03)))!.veto
            .ownChoice,
          "REJECT",
        );
      } finally {
        await db.communityMembership.update({
          where: {
            communityId_userId: { communityId: c.id, userId: rich.user.id },
          },
          data: { status: "ACTIVE" },
        });
        await manageMember(admin.user.id, {
          communityId: c.id,
          userId: small.user.id,
          action: "member",
        });
      }
    },
  );

  await check(
    "pre-cutoff membership tracking rejects zero paid-power elections and preserves refunds",
    async () => {
      const isolated = await community();
      const now = new Date();
      const round = await open(
        {
          vetoEnabled: false,
          collectionClosesAt: new Date(now.getTime() + 3600000).toISOString(),
        },
        isolated.id,
        now,
      );
      await deposit(round.id, rich, "1.00", isolated.id, now);
      await manageMember(rich.user.id, {
        communityId: isolated.id,
        userId: rich.user.id,
        action: "leave",
      });
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Asia/Dhaka'");
        await tx.communityMembership.create({
          data: { communityId: isolated.id, userId: outsider.user.id },
        });
      });
      assert.equal(
        (
          await db.roundVotingPower.findUniqueOrThrow({
            where: {
              roundId_userId: { roundId: round.id, userId: rich.user.id },
            },
          })
        ).eligible,
        false,
      );
      assert.equal(
        (
          await db.roundVotingPower.findUniqueOrThrow({
            where: {
              roundId_userId: { roundId: round.id, userId: outsider.user.id },
            },
          })
        ).eligible,
        true,
      );
      const afterCutoff = new Date(now.getTime() + day);
      const result = await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id, isolated.id), action: "screen" },
        afterCutoff,
      );
      assert.equal(result.status, "DECIDED");
      assert.equal(result.outcome, "FUNDING_FAILED");
      const late = await db.user.create({
        data: {
          email: `late-${randomUUID()}@elections.invalid`,
          username: `late${randomUUID().replaceAll("-", "").slice(0, 10)}`,
          displayName: "Late arrival",
          passwordHash: "isolated-not-for-login",
        },
      });
      await db.communityMembership.create({
        data: { communityId: isolated.id, userId: late.id },
      });
      assert.equal(
        await db.roundVotingPower.findUnique({
          where: { roundId_userId: { roundId: round.id, userId: late.id } },
        }),
        null,
      );
      const power = await db.roundVotingPower.findUniqueOrThrow({
        where: {
          roundId_userId: { roundId: round.id, userId: outsider.user.id },
        },
      });
      await assert.rejects(() =>
        db.roundVotingPower.update({
          where: {
            roundId_userId: { roundId: round.id, userId: outsider.user.id },
          },
          data: { eligible: false },
        }),
      );
      await assert.rejects(() =>
        db.roundVotingPower.update({
          where: {
            roundId_userId: { roundId: round.id, userId: outsider.user.id },
          },
          data: { paidPower: 100n },
        }),
      );
      assert.ok(power.frozenAt);
      assert.equal(power.paidPower, 0n);
      await prepareRoundSettlement(
        admin.user.id,
        scope(round.id, isolated.id),
        afterCutoff,
      );
      await processRoundSettlement(
        rich.user.id,
        scope(round.id, isolated.id),
        afterCutoff,
      );
      const final = await db.roundSettlement.findUniqueOrThrow({
        where: { roundId: round.id },
      });
      assert.equal(final.refunded, 100n);
      assert.equal(final.paid, 0n);
    },
  );

  await check(
    "a zero-paid moderator can screen equally but cannot gain contribution selection power",
    async () => {
      const isolated = await community();
      await manageMember(admin.user.id, {
        communityId: isolated.id,
        userId: rich.user.id,
        action: "moderator",
      });
      const round = await open(
        {
          screeningWeight: "EQUAL",
          selectionWeight: "CONTRIBUTION",
          allocationPolicy: "WINNER_ALL",
          vetoEnabled: false,
        },
        isolated.id,
      );
      await deposit(round.id, admin, "1.00", isolated.id);
      const candidate = await submitFundingScheme(
        admin.user.id,
        {
          ...scope(round.id, isolated.id),
          title: "Positive power governs selection",
          description:
            "The immutable stage rules count received payments rather than moderator status.",
          category: "DONATION",
          amount: "1.00",
          recipient: "Exact power recipient",
        },
        old,
      );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id, isolated.id), action: "screen" },
        at(1),
      );
      for (const actor of [admin, rich, small])
        await castScreeningVote(
          actor.user.id,
          {
            ...scope(round.id, isolated.id),
            schemeId: candidate.id,
            choice: "YES",
          },
          at(1.01),
        );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id, isolated.id), action: "close-screening" },
        at(2.01),
      );
      await assert.rejects(
        () =>
          castSelectionVote(
            rich.user.id,
            { ...scope(round.id, isolated.id), schemeId: candidate.id },
            at(2.02),
          ),
        /no frozen voting power/,
      );
      await castSelectionVote(
        admin.user.id,
        { ...scope(round.id, isolated.id), schemeId: candidate.id },
        at(2.02),
      );
      const result = await fundingRoundAction(
        admin.user.id,
        { ...scope(round.id, isolated.id), action: "close-selection" },
        at(2.03),
      );
      assert.equal(result.outcome, "WINNER_SELECTED");
      const view = await getV3RoundView(
        isolated.id,
        round.id,
        rich.user.id,
        at(2.03),
      );
      assert.equal(view!.ownPower.screening, 1n);
      assert.equal(view!.ownPower.selection, 0n);
      assert.equal(view!.selectionResult!.participation, 100n);
      assert.equal(view!.selectionResult!.eligible, 100n);
    },
  );

  await check(
    "veto uses all frozen power, stays sealed and rejects exactly 90 percent only after 24 hours",
    async () => {
      const { round, first, decision } = await completed();
      const scopeInput = scope(round.id);
      const ballotAt = new Date(decision.publishedAt.getTime() + 1000);
      await castRoundVetoVote(
        rich.user.id,
        { ...scopeInput, choice: "REJECT" },
        ballotAt,
      );
      for (const actor of [admin, small])
        await castRoundVetoVote(
          actor.user.id,
          { ...scopeInput, choice: "KEEP" },
          ballotAt,
        );
      const own = await getV3RoundView(c.id, round.id, rich.user.id, ballotAt),
        guest = await getV3RoundView(c.id, round.id, undefined, ballotAt);
      assert.equal(own!.veto.ownChoice, "REJECT");
      assert.equal(guest!.veto.ownChoice, null);
      assert.equal(guest!.veto.rejectedPower, null);
      assert.equal(guest!.veto.ballots, null);
      assert.equal(guest!.veto.state, "OPEN");
      assert.equal(decision.totalVetoPower, 100n);
      const before = new Date(decision.vetoClosesAt!.getTime() - 1);
      await assert.rejects(
        () => closeRoundVeto(admin.user.id, scopeInput, before),
        /24-hour|window/,
      );
      await assert.rejects(
        () => prepareRoundSettlement(admin.user.id, scopeInput, before),
        /24-hour|window/,
      );
      await assert.rejects(() =>
        processRoundSettlement(admin.user.id, scopeInput, before),
      );
      assert.equal(
        await db.roundOperation.count({ where: { roundId: round.id } }),
        0,
      );
      const [held, reserved] = await Promise.all([
        db.roundAccount.findUniqueOrThrow({
          where: { roundId_key: { roundId: round.id, key: "HELD" } },
        }),
        db.roundAccount.findUniqueOrThrow({
          where: { roundId_key: { roundId: round.id, key: "RESERVED" } },
        }),
      ]);
      await assert.rejects(
        () =>
          db.roundLedgerTransaction.create({
            data: {
              roundId: round.id,
              operationKey: "reserve:v3",
              kind: "RESERVE",
              amount: 100n,
              assetId: "fiat:USD",
              initiatedById: admin.user.id,
              sourceAccountId: held.id,
              destinationAccountId: reserved.id,
              createdAt: before,
              entries: {
                create: [
                  { accountId: held.id, amount: -100n },
                  { accountId: reserved.id, amount: 100n },
                ],
              },
            },
          }),
        /veto|gate|window/i,
      );
      for (const data of [
        { allocation: {} },
        { totalVetoPower: 1n },
        { vetoClosesAt: before },
        { vetoFinalizedAt: before, rejected: true },
      ])
        await assert.rejects(() =>
          db.roundDecision.update({ where: { roundId: round.id }, data }),
        );
      const vote = await db.roundVetoVote.findUniqueOrThrow({
        where: { roundId_userId: { roundId: round.id, userId: rich.user.id } },
      });
      await assert.rejects(() =>
        db.roundVetoVote.update({
          where: { id: vote.id },
          data: { choice: "KEEP" },
        }),
      );
      await assert.rejects(() =>
        db.roundVetoVote.delete({ where: { id: vote.id } }),
      );
      await assert.rejects(
        () =>
          castRoundVetoVote(
            rich.user.id,
            { ...scopeInput, choice: "KEEP" },
            ballotAt,
          ),
        /already recorded/,
      );
      const closed = await closeRoundVeto(
        small.user.id,
        scopeInput,
        decision.vetoClosesAt!,
      );
      assert.equal(closed.rejected, true);
      const revealed = await getV3RoundView(
        c.id,
        round.id,
        undefined,
        decision.vetoClosesAt!,
      );
      assert.equal(revealed!.veto.rejectedPower, 90n);
      assert.equal(revealed!.veto.ballots!.length, 3);
      await prepareRoundSettlement(
        admin.user.id,
        scopeInput,
        decision.vetoClosesAt!,
      );
      await processRoundSettlement(
        admin.user.id,
        scopeInput,
        decision.vetoClosesAt!,
      );
      const settlement = await db.roundSettlement.findUniqueOrThrow({
        where: { roundId: round.id },
      });
      assert.equal(settlement.refunded, 100n);
      assert.equal(settlement.paid, 0n);
      assert.equal(
        await db.roundOperation.count({
          where: { roundId: round.id, kind: "PAYOUT", schemeId: first.id },
        }),
        0,
      );
    },
  );

  await check(
    "equal veto counts nonvoters in its denominator and cannot close early when everyone votes",
    async () => {
      const { round, decision } = await completed({ vetoWeight: "EQUAL" });
      await castRoundVetoVote(
        rich.user.id,
        { ...scope(round.id), choice: "REJECT" },
        new Date(decision.publishedAt.getTime() + 1),
      );
      await castRoundVetoVote(
        admin.user.id,
        { ...scope(round.id), choice: "REJECT" },
        new Date(decision.publishedAt.getTime() + 1),
      );
      const final = await closeRoundVeto(
        admin.user.id,
        scope(round.id),
        decision.vetoClosesAt!,
      );
      assert.equal(final.totalVetoPower, 3n);
      assert.equal(final.rejected, false);
      await assert.rejects(
        () =>
          castRoundVetoVote(
            small.user.id,
            { ...scope(round.id), choice: "REJECT" },
            decision.vetoClosesAt!,
          ),
        /not open/,
      );
      await prepareRoundSettlement(
        admin.user.id,
        scope(round.id),
        decision.vetoClosesAt!,
      );
      await processRoundSettlement(
        admin.user.id,
        scope(round.id),
        decision.vetoClosesAt!,
      );
      const settled = await db.roundSettlement.findUniqueOrThrow({
        where: { roundId: round.id },
      });
      assert.equal(settled.paid, 100n);
      assert.equal(settled.refunded, 0n);
    },
  );

  await runElectionFinanceChecks(check);
  await runMethodChecks(check);
  await runMethodBrowserChecks(check);

  const live = await completed({}, new Date());
  await check(
    "veto HTTP enforces authentication, origin, strict input, eligibility and one immutable ballot",
    async () => {
      const body = { ...scope(live.round.id), choice: "KEEP" };
      await post("round-veto", body, "", 401);
      await post("round-veto", body, outsider.cookie, 403);
      await post(
        "round-veto",
        body,
        admin.cookie,
        403,
        "https://forged.invalid",
      );
      await post(
        "round-veto",
        { ...body, now: at(1).toISOString() },
        admin.cookie,
        400,
      );
      await post(
        "round-veto",
        { ...body, choice: "INVALID" },
        admin.cookie,
        400,
      );
      await post("round-veto", body, admin.cookie);
      await post("round-veto", body, admin.cookie, 409);
      await post(
        "round-veto-close",
        scope(live.round.id),
        outsider.cookie,
        403,
      );
      await post("round-veto-close", scope(live.round.id), admin.cookie, 409);
      const draft = await createFundingRound(
        admin.user.id,
        input(c.id, new Date()),
      );
      await assert.rejects(() =>
        getV3RoundView(c.id, draft.id, outsider.user.id),
      );
      const cross = await community();
      await assert.rejects(
        () =>
          castRoundVetoVote(rich.user.id, {
            communityId: cross.id,
            roundId: live.round.id,
            choice: "REJECT",
          }),
        /not found/,
      );
    },
  );

  await check(
    "V3 browser casts sealed veto and exposes exact rules and allocation responsively without runtime errors",
    async () => {
      process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
      process.env.TEMP = resolve(".local/browser-temp");
      process.env.TMP = process.env.TEMP;
      mkdirSync(process.env.TEMP, { recursive: true });
      mkdirSync("test-results", { recursive: true });
      const { chromium } = await import("@playwright/test");
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const browser = await chromium.launch({ headless: true });
      const errors: string[] = [];
      const scans: { route: string; width: number; violations: number }[] = [];
      try {
        const context = await browser.newContext();
        const split = rich.cookie.indexOf("=");
        await context.addCookies([
          {
            name: rich.cookie.slice(0, split),
            value: rich.cookie.slice(split + 1),
            url: origin,
          },
        ]);
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("dialog", (dialog) => dialog.accept());
        const route = `/communities/${c.slug}/rounds/${live.round.id}`;
        await page.goto(origin + route, { waitUntil: "networkidle" });
        await page
          .getByLabel("Your rejection ballot", { exact: true })
          .selectOption("REJECT");
        const request = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/round-veto") &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Seal rejection ballot", exact: true })
          .click();
        assert.equal((await request).status(), 200);
        assert.equal(
          (
            await db.roundVetoVote.findUniqueOrThrow({
              where: {
                roundId_userId: {
                  roundId: live.round.id,
                  userId: rich.user.id,
                },
              },
            })
          ).choice,
          "REJECT",
        );
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 1000 : 844,
          });
          await page.goto(origin + route, { waitUntil: "networkidle" });
          await page
            .getByText("Explore voting and allocation rules", { exact: true })
            .click();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            ),
            false,
            `V3 overflow at ${width}`,
          );
          const scan = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          assert.equal(
            scan.violations.length,
            0,
            JSON.stringify(scan.violations),
          );
          scans.push({ route, width, violations: 0 });
          if (width !== 320) {
            await page.evaluate(() => {
              (document.activeElement as HTMLElement)?.blur();
              window.scrollTo({ top: 0, behavior: "instant" });
            });
            await page.waitForFunction(() => scrollY === 0);
            await page.evaluate(
              () =>
                new Promise<void>((done) =>
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => done()),
                  ),
                ),
            );
            await page.screenshot({
              path: `test-results/fundicate-v3-veto-${width}.png`,
              fullPage: true,
            });
          }
        }
        const adminContext = await browser.newContext();
        const adminSplit = admin.cookie.indexOf("=");
        await adminContext.addCookies([
          {
            name: admin.cookie.slice(0, adminSplit),
            value: admin.cookie.slice(adminSplit + 1),
            url: origin,
          },
        ]);
        const formPage = await adminContext.newPage();
        formPage.on("pageerror", (error) => errors.push(error.message));
        await formPage.goto(`${origin}/communities/${c.slug}/rounds/new`, {
          waitUntil: "networkidle",
        });
        await formPage
          .getByRole("checkbox", {
            name: "Collect a dedicated funding pool for this round",
            exact: true,
          })
          .check();
        await formPage
          .getByLabel("Funded rules version", { exact: true })
          .selectOption("V3");
        await formPage
          .getByLabel("Allocation policy", { exact: true })
          .selectOption("RANKED_CUTS");
        await formPage
          .getByLabel("Ranked shares (%)", { exact: true })
          .fill("60,30,10");
        await formPage
          .getByRole("checkbox", {
            name: "Enable a 24-hour rejection veto",
            exact: true,
          })
          .check();
        const formScan = await new AxeBuilder({ page: formPage })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.equal(
          formScan.violations.length,
          0,
          JSON.stringify(formScan.violations),
        );
        scans.push({
          route: "/rounds/new#v3-ranked-veto",
          width: 1280,
          violations: 0,
        });
        await formPage
          .getByLabel("Round title", { exact: true })
          .fill("Browser-created ranked veto round");
        await formPage
          .getByLabel("Purpose and submission requirements", { exact: true })
          .fill(
            "A browser-created V3 funding round with exact ranked shares and an immutable rejection period.",
          );
        await formPage
          .getByRole("button", { name: "Create draft round", exact: true })
          .click();
        await formPage.waitForURL(/\/rounds\/[0-9a-f-]{36}$/);
        const createdRoundId = new URL(formPage.url()).pathname
          .split("/")
          .at(-1)!;
        const createdRound = await db.fundingRound.findUniqueOrThrow({
          where: { id: createdRoundId },
          include: { settlement: true },
        });
        assert.equal(createdRound.rulesVersion, 3);
        const createdRules = createdRound.settlement!.rulesSnapshot as Record<
          string,
          unknown
        >;
        assert.equal(createdRules.allocationPolicy, "RANKED_CUTS");
        assert.equal(createdRules.vetoEnabled, true);
        assert.deepEqual(createdRules.rankedSharesBps, [6000, 3000, 1000]);
        const anonymous = await browser.newPage();
        await anonymous.goto(origin + route, { waitUntil: "networkidle" });
        assert.equal(
          await anonymous
            .getByRole("button", { name: "Seal rejection ballot", exact: true })
            .count(),
          0,
        );
        assert.equal(
          (await getV3RoundView(c.id, live.round.id))!.veto.ballots,
          null,
        );
        assert.equal(errors.length, 0, errors.join("\n"));
        mkdirSync(".local", { recursive: true });
        writeFileSync(
          ".local/elections-accessibility.json",
          JSON.stringify(scans, null, 2),
        );
        console.log(
          `PASS ${scans.length} V3 voting/veto WCAG A/AA scans; no violations.`,
        );
      } finally {
        await browser.close();
      }
    },
  );
  console.log(
    `PASS ${checks} V3/V4 election/allocation/veto integrity, HTTP, browser and recovery checks.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
