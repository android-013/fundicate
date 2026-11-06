import {
  Prisma,
  type FundingRound,
  type RoundSettlement,
} from "@prisma/client";
import { db } from "./db";
import { access, atomic } from "./service";
import { AppError, ensure } from "./errors";
import { uuid } from "./validation";
import {
  type ContributionShare,
  type FundsConfig,
  V2_FUNDS_POLICY,
  roundContributionSchema,
  roundFinanceActionSchema,
  proportionalRefunds,
  winnerAllPlan,
} from "./funds-core";
import { type V3FundsConfig, V3_RULES_POLICY } from "./elections-core";
import { type V4FundsConfig, V4_RULES_POLICY } from "./methods-core";
import {
  assertRoundSettlementGate,
  freezeV3Electorate,
  getV3Settings,
  seedV3Electorate,
} from "./rounds-v3";

type Tx = Prisma.TransactionClient;
type Scope = { communityId: string; roundId: string };
const day = 24 * 60 * 60 * 1000;

async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
async function findRound(tx: Tx, scope: Scope) {
  const round = await tx.fundingRound.findFirst({
    where: { id: scope.roundId, communityId: scope.communityId },
  });
  ensure(round, "Funding round not found.", 404);
  return round;
}
async function findSettlement(tx: Tx, round: FundingRound) {
  const settlement = await tx.roundSettlement.findUnique({
    where: { roundId: round.id },
  });
  ensure(
    [2, 3, 4].includes(round.rulesVersion) &&
      settlement &&
      settlement.rulesVersion === round.rulesVersion,
    "This is a decision-only round; it has no payment authority.",
    400,
  );
  assertRules(settlement);
  return settlement;
}
function assertRules(settlement: RoundSettlement) {
  if ([3, 4].includes(settlement.rulesVersion)) {
    ensure(
      settlement.network === "local-simulation" &&
        settlement.decimals === 2 &&
        settlement.assetId === `fiat:${settlement.currency}`,
      "These settlement rules or asset are not supported.",
      409,
    );
    getV3Settings(settlement);
    return;
  }
  const snapshot = settlement.rulesSnapshot as Record<string, unknown>;
  ensure(
    settlement.rulesVersion === 2 &&
      settlement.network === "local-simulation" &&
      settlement.decimals === 2 &&
      settlement.assetId === `fiat:${settlement.currency}` &&
      Object.entries(V2_FUNDS_POLICY).every(
        ([key, value]) => snapshot?.[key] === value,
      ),
    "These settlement rules or asset are not supported.",
    409,
  );
}
async function audit(
  tx: Tx,
  actorId: string,
  round: FundingRound,
  action: string,
  details: Prisma.InputJsonValue = {},
) {
  await tx.auditEvent.create({
    data: {
      communityId: round.communityId,
      actorId,
      entityId: round.id,
      action,
      details,
    },
  });
}
async function account(tx: Tx, roundId: string, key: string, ownerId?: string) {
  const result = await tx.roundAccount.upsert({
    where: { roundId_key: { roundId, key } },
    create: { roundId, key, ownerId },
    update: {},
  });
  ensure(
    (result.ownerId ?? undefined) === ownerId,
    "The original payment source owner does not match.",
    409,
  );
  return result;
}

// Local bookkeeping only. Never invoke an external adapter from this retryable transaction.
async function postLedger(
  tx: Tx,
  settlement: RoundSettlement,
  input: {
    key: string;
    kind: string;
    amount: bigint;
    sourceId: string;
    destinationId: string;
    actorId: string;
    now: Date;
  },
) {
  if (["RESERVE", "PAYOUT", "REFUND"].includes(input.kind)) {
    const round = await tx.fundingRound.findUniqueOrThrow({
      where: { id: settlement.roundId },
    });
    const gate = await assertRoundSettlementGate(
      tx,
      round,
      settlement,
      input.now,
    );
    ensure(
      input.kind !== "PAYOUT" || !gate.rejected,
      "A rejected round cannot pay a scheme.",
      409,
    );
  }
  ensure(
    input.amount > 0n && input.sourceId !== input.destinationId,
    "Invalid round transfer.",
    409,
  );
  const existing = await tx.roundLedgerTransaction.findUnique({
    where: {
      roundId_operationKey: {
        roundId: settlement.roundId,
        operationKey: input.key,
      },
    },
  });
  if (existing) {
    ensure(
      existing.amount === input.amount &&
        existing.kind === input.kind &&
        existing.sourceAccountId === input.sourceId &&
        existing.destinationAccountId === input.destinationId &&
        existing.assetId === settlement.assetId,
      "This operation key already describes a different round transfer.",
      409,
    );
    return existing;
  }
  const [source, destination] = await Promise.all([
    tx.roundAccount.findUnique({ where: { id: input.sourceId } }),
    tx.roundAccount.findUnique({ where: { id: input.destinationId } }),
  ]);
  ensure(
    source?.roundId === settlement.roundId &&
      destination?.roundId === settlement.roundId,
    "Round transfers cannot cross account scopes.",
    409,
  );
  ensure(
    source.key.startsWith("EXTERNAL:") || source.balance >= input.amount,
    "The round has insufficient held funds.",
    409,
  );
  await tx.roundAccount.update({
    where: { id: source.id },
    data: { balance: { decrement: input.amount } },
  });
  await tx.roundAccount.update({
    where: { id: destination.id },
    data: { balance: { increment: input.amount } },
  });
  return tx.roundLedgerTransaction.create({
    data: {
      roundId: settlement.roundId,
      operationKey: input.key,
      kind: input.kind,
      amount: input.amount,
      assetId: settlement.assetId,
      initiatedById: input.actorId,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      createdAt: input.now,
      entries: {
        create: [
          { accountId: source.id, amount: -input.amount },
          { accountId: destination.id, amount: input.amount },
        ],
      },
    },
  });
}

export async function initializeRoundFunding(
  tx: Tx,
  round: FundingRound,
  config: FundsConfig | V3FundsConfig | V4FundsConfig,
  now: Date,
) {
  ensure(
    [2, 3, 4].includes(round.rulesVersion) && round.status === "DRAFT",
    "Only a new supported funded draft can receive funding rules.",
  );
  const cutoff = new Date(config.collectionClosesAt),
    expires = new Date(config.expiresAt);
  ensure(
    cutoff > now && cutoff <= round.submissionsCloseAt,
    "Collection must end in the future, no later than submissions.",
  );
  ensure(
    expires.getTime() >= round.submissionsCloseAt.getTime() + 3 * day &&
      expires.getTime() <= round.submissionsCloseAt.getTime() + 90 * day,
    "Recovery expiry must be between three and 90 days after submissions close.",
  );
  ensure(
    config.fundingTarget > 0n &&
      config.minimumContribution > 0n &&
      config.maximumContribution >= config.minimumContribution &&
      (round.rulesVersion === 4 || config.selectionMethod === "FPTP"),
    "Unsupported funding configuration.",
  );
  if (round.rulesVersion === 2)
    ensure(
      "votingWeight" in config &&
        config.vetoEnabled === false &&
        config.votingWeight === "EQUAL" &&
        config.allocationPolicy === "WINNER_ALL",
      "Unsupported V2 funding configuration.",
    );
  else
    ensure(
      "screeningWeight" in config &&
        "selectionWeight" in config &&
        "vetoWeight" in config &&
        "rankedSharesBps" in config,
      "V3 requires its published stage-specific configuration.",
    );
  const community = await tx.community.findUniqueOrThrow({
    where: { id: round.communityId },
  });
  return tx.roundSettlement.create({
    data: {
      roundId: round.id,
      rulesVersion: round.rulesVersion,
      assetId: `fiat:${community.currency}`,
      currency: community.currency,
      fundingTarget: config.fundingTarget,
      minimumContribution: config.minimumContribution,
      maximumContribution: config.maximumContribution,
      collectionClosesAt: cutoff,
      expiresAt: expires,
      rulesSnapshot: {
        ...(round.rulesVersion === 2
          ? V2_FUNDS_POLICY
          : {
              ...(round.rulesVersion === 4 ? V4_RULES_POLICY : V3_RULES_POLICY),
              selectionMethod: config.selectionMethod,
              ...(round.rulesVersion === 4
                ? { selectionSeats: (config as V4FundsConfig).selectionSeats }
                : {}),
              screeningWeight: (config as V3FundsConfig).screeningWeight,
              selectionWeight: (config as V3FundsConfig).selectionWeight,
              vetoWeight: (config as V3FundsConfig).vetoWeight,
              vetoEnabled: config.vetoEnabled,
              allocationPolicy: config.allocationPolicy,
              rankedSharesBps: (config as V3FundsConfig).rankedSharesBps,
            }),
        fundingTarget: config.fundingTarget.toString(),
        minimumContribution: config.minimumContribution.toString(),
        maximumContribution: config.maximumContribution.toString(),
        collectionClosesAt: cutoff.toISOString(),
        expiresAt: expires.toISOString(),
        assetId: `fiat:${community.currency}`,
        currency: community.currency,
        decimals: 2,
        network: "local-simulation",
      },
      createdAt: now,
      accounts: {
        create: [{ key: "HELD" }, { key: "RESERVED" }, { key: "PAID" }],
      },
    },
  });
}

export async function openRoundFunding(tx: Tx, round: FundingRound, now: Date) {
  if (round.rulesVersion === 1) return;
  const settlement = await findSettlement(tx, round);
  ensure(
    settlement.status === "DRAFT" && now < settlement.collectionClosesAt,
    "The collection deadline has passed.",
  );
  await tx.roundSettlement.update({
    where: { roundId: round.id },
    data: { status: "COLLECTING" },
  });
  if ([3, 4].includes(round.rulesVersion))
    await seedV3Electorate(tx, round, now);
}

function decodeShares(settlement: RoundSettlement): ContributionShare[] {
  const snapshot = settlement.contributionSnapshot;
  ensure(
    Array.isArray(snapshot),
    "The received contribution basis has not been frozen.",
    409,
  );
  return snapshot.map((value) => {
    ensure(
      value && typeof value === "object" && !Array.isArray(value),
      "Invalid contribution snapshot.",
      409,
    );
    const record = value as Record<string, Prisma.JsonValue>;
    ensure(
      typeof record.sourceAccountId === "string" &&
        typeof record.userId === "string" &&
        typeof record.amount === "string" &&
        /^\d+$/.test(record.amount),
      "Invalid original payment source.",
      409,
    );
    return {
      sourceAccountId: record.sourceAccountId,
      userId: record.userId,
      amount: BigInt(record.amount),
    };
  });
}
async function freezeBasis(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  now: Date,
) {
  if (settlement.frozenAt) {
    if ([3, 4].includes(round.rulesVersion))
      await freezeV3Electorate(tx, round, settlement, now);
    return settlement;
  }
  ensure(
    settlement.status === "COLLECTING" && now >= settlement.collectionClosesAt,
    "Wait until the published collection cutoff to freeze received funds.",
  );
  const contributions = await tx.roundContribution.findMany({
    where: { roundId: round.id },
    orderBy: [{ sourceAccountId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const sources = new Map<string, ContributionShare>();
  for (const contribution of contributions) {
    const prior = sources.get(contribution.sourceAccountId);
    ensure(
      !prior || prior.userId === contribution.userId,
      "A payment source has conflicting owners.",
      409,
    );
    sources.set(contribution.sourceAccountId, {
      sourceAccountId: contribution.sourceAccountId,
      userId: contribution.userId,
      amount: (prior?.amount ?? 0n) + contribution.amount,
    });
  }
  ensure(
    [...sources.values()].reduce((sum, share) => sum + share.amount, 0n) ===
      settlement.received,
    "Received funds do not reconcile with original sources.",
    409,
  );
  const frozen = await tx.roundSettlement.update({
    where: { roundId: round.id },
    data: {
      status: "HELD",
      frozenAt: now,
      contributionSnapshot: [...sources.values()].map((share) => ({
        ...share,
        amount: share.amount.toString(),
      })),
    },
  });
  if ([3, 4].includes(round.rulesVersion))
    await freezeV3Electorate(tx, round, frozen, now);
  return frozen;
}

async function queuePlan(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  actorId: string,
  now: Date,
  forceRefundReason?: string,
) {
  if ([3, 4].includes(round.rulesVersion))
    return queueV3Plan(tx, round, settlement, actorId, now, forceRefundReason);
  if (["QUEUED", "SETTLED", "REFUNDED"].includes(settlement.status))
    return settlement;
  ensure(
    settlement.status === "HELD" && settlement.frozenAt,
    "Funds must be frozen before a settlement is prepared.",
    409,
  );
  assertRules(settlement);
  let reason = forceRefundReason ?? round.outcome ?? "NO_WINNER";
  let winner =
    !forceRefundReason &&
    round.outcome === "WINNER_SELECTED" &&
    round.winnerSchemeId
      ? await tx.fundingScheme.findFirst({
          where: {
            id: round.winnerSchemeId,
            roundId: round.id,
            status: "QUALIFIED",
          },
        })
      : null;
  if (
    winner &&
    !(
      winner.amount > 0n &&
      winner.recipient.trim().length >= 2 &&
      winner.recipient.length <= 150 &&
      !/[\u0000-\u001f\u007f]/.test(winner.recipient)
    )
  ) {
    reason = "UNPAYABLE_RECIPIENT";
    winner = null;
  }
  if (
    !forceRefundReason &&
    round.outcome === "WINNER_SELECTED" &&
    !winner &&
    reason !== "UNPAYABLE_RECIPIENT"
  )
    reason = "UNPAYABLE_WINNER";
  const shares = decodeShares(settlement);
  const plan = winnerAllPlan(
    settlement.received,
    shares,
    winner?.amount ?? null,
  );
  const [held, reserved, paid] = await Promise.all([
    account(tx, round.id, "HELD"),
    account(tx, round.id, "RESERVED"),
    account(tx, round.id, "PAID"),
  ]);
  ensure(
    held.balance === settlement.received &&
      reserved.balance === 0n &&
      paid.balance === 0n,
    "The unsettled contribution pool does not reconcile.",
    409,
  );
  if (plan.payout > 0n && winner)
    await tx.roundOperation.create({
      data: {
        roundId: round.id,
        operationKey: `payout:${winner.id}`,
        kind: "PAYOUT",
        amount: plan.payout,
        beneficiaryId: winner.authorId,
        sourceAccountId: reserved.id,
        destinationAccountId: paid.id,
        recipient: winner.recipient,
        schemeId: winner.id,
        createdAt: now,
      },
    });
  for (const share of plan.refunds) {
    if (!share.refund) continue;
    const original = await tx.roundAccount.findUnique({
      where: { id: share.sourceAccountId },
    });
    ensure(
      original?.roundId === round.id &&
        original.key === `EXTERNAL:${share.userId}` &&
        original.ownerId === share.userId,
      "Refunds must return to the immutable original payment source.",
      409,
    );
    await tx.roundOperation.create({
      data: {
        roundId: round.id,
        operationKey: `refund:${share.sourceAccountId}`,
        kind: "REFUND",
        amount: share.refund,
        beneficiaryId: share.userId,
        sourceAccountId: reserved.id,
        destinationAccountId: share.sourceAccountId,
        recipient: `original-source:${share.sourceAccountId}`,
        createdAt: now,
      },
    });
  }
  if (settlement.received > 0n)
    await postLedger(tx, settlement, {
      key: "reserve:v2",
      kind: "RESERVE",
      amount: settlement.received,
      sourceId: held.id,
      destinationId: reserved.id,
      actorId,
      now,
    });
  const result = await tx.roundSettlement.update({
    where: { roundId: round.id },
    data: {
      status: settlement.received > 0n ? "QUEUED" : "REFUNDED",
      preparedAt: now,
      settledAt: settlement.received === 0n ? now : null,
      reason,
      allocationSnapshot: {
        rulesVersion: 2,
        assetId: settlement.assetId,
        reason,
        winnerSchemeId: winner?.id ?? null,
        requestedAmount: winner?.amount.toString() ?? null,
        payout: plan.payout.toString(),
        refunded: plan.refunded.toString(),
        received: settlement.received.toString(),
        refunds: plan.refunds
          .filter((share) => share.refund > 0n)
          .map((share) => ({
            sourceAccountId: share.sourceAccountId,
            userId: share.userId,
            amount: share.refund.toString(),
          })),
      },
    },
  });
  await audit(tx, actorId, round, "ROUND_SETTLEMENT_PREPARED", {
    reason,
    payout: plan.payout.toString(),
    refunded: plan.refunded.toString(),
    assetId: settlement.assetId,
  });
  return result;
}

type PlanPayout = {
  schemeId: string;
  amount: bigint;
  recipient: string;
  beneficiaryId: string;
};
function jsonRecord(value: Prisma.JsonValue, message: string) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    message,
    409,
  );
  return value as Record<string, Prisma.JsonValue>;
}
function exactAmount(value: Prisma.JsonValue | undefined, message: string) {
  ensure(typeof value === "string" && /^\d+$/.test(value), message, 409);
  return BigInt(value);
}
async function publishedPayouts(
  tx: Tx,
  settlement: RoundSettlement,
  allocation: Prisma.JsonValue,
): Promise<PlanPayout[]> {
  const plan = jsonRecord(allocation, "The published allocation is invalid.");
  ensure(
    plan.rulesVersion === settlement.rulesVersion &&
      plan.assetId === settlement.assetId &&
      exactAmount(plan.received, "Invalid published received amount.") ===
        settlement.received &&
      Array.isArray(plan.payouts) &&
      plan.payouts.length <= 50,
    "The published allocation does not match this round and asset.",
    409,
  );
  const ids = new Set<string>();
  const payouts = plan.payouts.map((value) => {
    const entry = jsonRecord(value, "Invalid published payout intent.");
    ensure(
      typeof entry.schemeId === "string" &&
        uuid.safeParse(entry.schemeId).success &&
        typeof entry.beneficiaryId === "string" &&
        uuid.safeParse(entry.beneficiaryId).success &&
        typeof entry.recipient === "string" &&
        entry.recipient.trim().length >= 2 &&
        entry.recipient.length <= 150 &&
        !/[\u0000-\u001f\u007f]/.test(entry.recipient),
      "Invalid published payout identity.",
      409,
    );
    const amount = exactAmount(
      entry.amount,
      "Invalid published payout amount.",
    );
    ensure(
      amount > 0n && !ids.has(entry.schemeId),
      "Payouts must be positive unique scheme intents.",
      409,
    );
    ids.add(entry.schemeId);
    return {
      schemeId: entry.schemeId,
      amount,
      recipient: entry.recipient,
      beneficiaryId: entry.beneficiaryId,
    };
  });
  const schemes = await tx.fundingScheme.findMany({
    where: {
      id: { in: [...ids] },
      roundId: settlement.roundId,
      status: "QUALIFIED",
    },
  });
  for (const payout of payouts) {
    const scheme = schemes.find(
      (candidate) => candidate.id === payout.schemeId,
    );
    ensure(
      scheme &&
        payout.amount <= scheme.amount &&
        payout.recipient === scheme.recipient &&
        payout.beneficiaryId === scheme.authorId,
      "The published payout does not match its immutable scheme.",
      409,
    );
  }
  const refund = exactAmount(
    plan.refundTotal,
    "Invalid published refund total.",
  );
  ensure(
    payouts.reduce((sum, payout) => sum + payout.amount, 0n) + refund ===
      settlement.received,
    "The published allocation does not conserve the received pool.",
    409,
  );
  return payouts;
}

async function queueV3Plan(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  actorId: string,
  now: Date,
  forceRefundReason?: string,
) {
  const gate = await assertRoundSettlementGate(tx, round, settlement, now);
  if (["QUEUED", "SETTLED", "REFUNDED"].includes(settlement.status))
    return settlement;
  ensure(
    settlement.status === "HELD" && settlement.frozenAt,
    "Funds must be frozen before a settlement is prepared.",
    409,
  );
  assertRules(settlement);
  const reason =
    forceRefundReason ??
    (gate.rejected ? "VETO_REJECTED" : (round.outcome ?? "NO_WINNER"));
  if (!forceRefundReason && !gate.rejected)
    ensure(
      gate.decision,
      "Publish the immutable allocation before creating payout instructions.",
      409,
    );
  const payouts =
    forceRefundReason || gate.rejected
      ? []
      : await publishedPayouts(tx, settlement, gate.decision!.allocation);
  const payoutTotal = payouts.reduce((sum, payout) => sum + payout.amount, 0n);
  const refundTotal = settlement.received - payoutTotal;
  const shares = decodeShares(settlement);
  ensure(
    shares.reduce((sum, share) => sum + share.amount, 0n) ===
      settlement.received,
    "Original source receipts do not reconcile.",
    409,
  );
  const refunds = proportionalRefunds(refundTotal, shares);
  const [held, reserved, paid] = await Promise.all([
    account(tx, round.id, "HELD"),
    account(tx, round.id, "RESERVED"),
    account(tx, round.id, "PAID"),
  ]);
  ensure(
    held.balance === settlement.received &&
      reserved.balance === 0n &&
      paid.balance === 0n,
    "The unsettled contribution pool does not reconcile.",
    409,
  );
  for (const payout of payouts)
    await tx.roundOperation.create({
      data: {
        roundId: round.id,
        operationKey: `payout:${payout.schemeId}`,
        kind: "PAYOUT",
        amount: payout.amount,
        beneficiaryId: payout.beneficiaryId,
        sourceAccountId: reserved.id,
        destinationAccountId: paid.id,
        recipient: payout.recipient,
        schemeId: payout.schemeId,
        createdAt: now,
      },
    });
  for (const refund of refunds) {
    if (!refund.refund) continue;
    const original = await tx.roundAccount.findUnique({
      where: { id: refund.sourceAccountId },
    });
    ensure(
      original?.roundId === round.id &&
        original.ownerId === refund.userId &&
        original.key === `EXTERNAL:${refund.userId}`,
      "Refunds must return to the immutable original payment source.",
      409,
    );
    await tx.roundOperation.create({
      data: {
        roundId: round.id,
        operationKey: `refund:${refund.sourceAccountId}`,
        kind: "REFUND",
        amount: refund.refund,
        beneficiaryId: refund.userId,
        sourceAccountId: reserved.id,
        destinationAccountId: refund.sourceAccountId,
        recipient: `original-source:${refund.sourceAccountId}`,
        createdAt: now,
      },
    });
  }
  if (settlement.received > 0n)
    await postLedger(tx, settlement, {
      key: `reserve:v${round.rulesVersion}`,
      kind: "RESERVE",
      amount: settlement.received,
      sourceId: held.id,
      destinationId: reserved.id,
      actorId,
      now,
    });
  const result = await tx.roundSettlement.update({
    where: { roundId: round.id },
    data: {
      status: settlement.received > 0n ? "QUEUED" : "REFUNDED",
      preparedAt: now,
      settledAt: settlement.received === 0n ? now : null,
      reason,
      allocationSnapshot: {
        rulesVersion: round.rulesVersion,
        assetId: settlement.assetId,
        reason,
        decisionRoundId: gate.decision?.roundId ?? null,
        decisionPublishedAt: gate.decision?.publishedAt.toISOString() ?? null,
        decisionAllocation: gate.decision?.allocation ?? null,
        received: settlement.received.toString(),
        payout: payoutTotal.toString(),
        refunded: refundTotal.toString(),
        payouts: payouts.map((payout) => ({
          ...payout,
          amount: payout.amount.toString(),
        })),
        refunds: refunds
          .filter((refund) => refund.refund > 0n)
          .map((refund) => ({
            sourceAccountId: refund.sourceAccountId,
            userId: refund.userId,
            amount: refund.refund.toString(),
          })),
      },
    },
  });
  await audit(tx, actorId, round, "ROUND_SETTLEMENT_PREPARED", {
    rulesVersion: round.rulesVersion,
    reason,
    payout: payoutTotal.toString(),
    refunded: refundTotal.toString(),
    assetId: settlement.assetId,
  });
  return result;
}

export async function freezeRoundFunding(
  tx: Tx,
  round: FundingRound,
  now: Date,
): Promise<{ ready: boolean; reason?: string }> {
  if (round.rulesVersion === 1) return { ready: true };
  let settlement = await findSettlement(tx, round);
  if (["QUEUED", "SETTLED", "REFUNDED"].includes(settlement.status))
    return { ready: false, reason: settlement.reason ?? "FUNDING_FAILED" };
  settlement = await freezeBasis(tx, round, settlement, now);
  const power = [3, 4].includes(round.rulesVersion)
    ? await freezeV3Electorate(tx, round, settlement, now)
    : { ready: true };
  const reason =
    now >= settlement.expiresAt
      ? "EXPIRED"
      : settlement.received < settlement.fundingTarget
        ? "FUNDING_FAILED"
        : !power.ready
          ? (power.reason ?? "ZERO_POWER")
          : null;
  if (reason) {
    if (round.rulesVersion === 2)
      await queuePlan(tx, round, settlement, round.creatorId, now, reason);
    return { ready: false, reason };
  }
  return { ready: true };
}

export async function contributeToRound(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = roundContributionSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data);
    const settlement = await findSettlement(tx, round);
    const operationKey = `deposit:${data.idempotencyKey}`;
    // A valid replay retains its receipt after cutoff or membership changes.
    const existing = await tx.roundLedgerTransaction.findUnique({
      where: { roundId_operationKey: { roundId: round.id, operationKey } },
      include: { contribution: true, source: true },
    });
    if (existing) {
      ensure(
        existing.kind === "CONTRIBUTION" &&
          existing.contribution?.userId === userId &&
          existing.amount === data.amount &&
          existing.source.ownerId === userId &&
          existing.source.key === `EXTERNAL:${userId}`,
        "This contribution key already belongs to a different payment.",
        409,
      );
      return existing.contribution;
    }
    await access(tx, data.communityId, userId);
    ensure(
      round.status === "SUBMISSIONS" &&
        settlement.status === "COLLECTING" &&
        now < settlement.collectionClosesAt,
      "This round is not accepting contributions.",
    );
    const prior = await tx.roundContribution.aggregate({
      where: { roundId: round.id, userId },
      _sum: { amount: true },
    });
    const already = prior._sum.amount ?? 0n;
    ensure(
      already > 0n || data.amount >= settlement.minimumContribution,
      "Your first contribution is below the published minimum.",
    );
    ensure(
      already + data.amount <= settlement.maximumContribution,
      "Your total exceeds the published contributor maximum.",
    );
    const [source, held] = await Promise.all([
      account(tx, round.id, `EXTERNAL:${userId}`, userId),
      account(tx, round.id, "HELD"),
    ]);
    const transaction = await postLedger(tx, settlement, {
      key: operationKey,
      kind: "CONTRIBUTION",
      amount: data.amount,
      sourceId: source.id,
      destinationId: held.id,
      actorId: userId,
      now,
    });
    const contribution = await tx.roundContribution.create({
      data: {
        roundId: round.id,
        userId,
        sourceAccountId: source.id,
        transactionId: transaction.id,
        amount: data.amount,
        createdAt: now,
      },
    });
    await tx.roundSettlement.update({
      where: { roundId: round.id },
      data: { received: { increment: data.amount } },
    });
    await audit(tx, userId, round, "ROUND_CONTRIBUTION_RECEIVED", {
      contributionId: contribution.id,
      transactionId: transaction.id,
      amount: data.amount.toString(),
      assetId: settlement.assetId,
    });
    return contribution;
  });
}

async function authority(tx: Tx, round: FundingRound, userId: string) {
  const [community, membership, contribution] = await Promise.all([
    tx.community.findUniqueOrThrow({ where: { id: round.communityId } }),
    tx.communityMembership.findUnique({
      where: { communityId_userId: { communityId: round.communityId, userId } },
    }),
    tx.roundContribution.findFirst({
      where: { roundId: round.id, userId },
      select: { id: true },
    }),
  ]);
  return {
    isStaff:
      membership?.status === "ACTIVE" &&
      (community.adminId === userId || membership.role === "MODERATOR"),
    isContributor: Boolean(contribution),
    isActive: membership?.status === "ACTIVE",
  };
}

export async function prepareRoundSettlement(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const scope = roundFinanceActionSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    let settlement = await findSettlement(tx, round);
    const rights = await authority(tx, round, userId);
    const expired = now >= settlement.expiresAt;
    ensure(
      rights.isStaff ||
        (rights.isContributor && (expired || settlement.preparedAt)),
      "Staff or an original contributor recovering expired funds is required.",
      403,
    );
    await assertRoundSettlementGate(tx, round, settlement, now);
    if (["QUEUED", "SETTLED", "REFUNDED"].includes(settlement.status))
      return settlement;
    ensure(
      round.status === "DECIDED" || expired,
      "The election must finish before settlement is prepared.",
    );
    settlement = await freezeBasis(tx, round, settlement, now);
    return queuePlan(
      tx,
      round,
      settlement,
      userId,
      now,
      [3, 4].includes(round.rulesVersion) && expired
        ? "EXPIRED"
        : settlement.received < settlement.fundingTarget
          ? "FUNDING_FAILED"
          : expired
            ? "EXPIRED"
            : undefined,
    );
  });
}

async function executeOperation(
  userId: string,
  scope: Scope,
  operationId: string,
  now: Date,
) {
  return atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    const settlement = await findSettlement(tx, round);
    const rights = await authority(tx, round, userId);
    ensure(
      rights.isStaff || rights.isContributor,
      "Staff or an original contributor is required to resume this plan.",
      403,
    );
    const operation = await tx.roundOperation.findFirst({
      where: { id: operationId, roundId: round.id },
    });
    ensure(operation, "Settlement operation not found.", 404);
    const gate = await assertRoundSettlementGate(tx, round, settlement, now);
    ensure(
      operation.kind !== "PAYOUT" || !gate.rejected,
      "A rejected round cannot pay a scheme.",
      409,
    );
    if (operation.status === "CONFIRMED") return operation;
    ensure(
      settlement.status === "QUEUED" &&
        settlement.preparedAt &&
        settlement.allocationSnapshot,
      "There is no locked settlement plan to process.",
      409,
    );
    ensure(
      operation.kind === "PAYOUT" || operation.kind === "REFUND",
      "Unknown settlement operation.",
      409,
    );
    const transaction = await postLedger(tx, settlement, {
      key: `execute:${operation.id}`,
      kind: operation.kind,
      amount: operation.amount,
      sourceId: operation.sourceAccountId,
      destinationId: operation.destinationAccountId,
      actorId: userId,
      now,
    });
    const attempt = operation.attempts + 1;
    await tx.roundExecutionAttempt.create({
      data: {
        operationId: operation.id,
        attempt,
        status: "CONFIRMED",
        createdAt: now,
      },
    });
    const result = await tx.roundOperation.update({
      where: { id: operation.id },
      data: {
        status: "CONFIRMED",
        attempts: attempt,
        lastError: null,
        transactionId: transaction.id,
        completedAt: now,
      },
    });
    await tx.roundSettlement.update({
      where: { roundId: round.id },
      data:
        operation.kind === "PAYOUT"
          ? { paid: { increment: operation.amount } }
          : { refunded: { increment: operation.amount } },
    });
    await audit(tx, userId, round, "ROUND_OPERATION_CONFIRMED", {
      operationId: operation.id,
      transactionId: transaction.id,
      kind: operation.kind,
      amount: operation.amount.toString(),
      network: settlement.network,
    });
    return result;
  });
}
async function recordFailure(
  userId: string,
  scope: Scope,
  operationId: string,
  now: Date,
  error: unknown,
) {
  const message =
    error instanceof AppError
      ? error.message
      : "Local settlement transaction failed; retry the same operation.";
  await atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    const rights = await authority(tx, round, userId);
    ensure(
      rights.isStaff || rights.isContributor,
      "Settlement access denied.",
      403,
    );
    const operation = await tx.roundOperation.findFirst({
      where: { id: operationId, roundId: round.id },
    });
    // A failure while checking an unknown intent must never turn it into a retryable failure.
    if (
      !operation ||
      operation.status === "CONFIRMED" ||
      operation.status === "UNKNOWN"
    )
      return;
    const attempt = operation.attempts + 1;
    await tx.roundExecutionAttempt.create({
      data: {
        operationId,
        attempt,
        status: "FAILED",
        error: message,
        createdAt: now,
      },
    });
    await tx.roundOperation.update({
      where: { id: operationId },
      data: { status: "FAILED", attempts: attempt, lastError: message },
    });
  });
}

// The bounded server-only batch option makes a stopped worker naturally resumable.
// HTTP passes only the first two arguments; callers cannot change recipients or amounts.
export async function processRoundSettlement(
  userId: string,
  input: unknown,
  now = new Date(),
  batchLimit = 100,
) {
  const scope = roundFinanceActionSchema.parse(input);
  ensure(
    Number.isInteger(batchLimit) && batchLimit >= 1 && batchLimit <= 10000,
    "Invalid processing batch size.",
  );
  const ids = await atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    const settlement = await findSettlement(tx, round);
    const rights = await authority(tx, round, userId);
    ensure(
      rights.isStaff || rights.isContributor,
      "Staff or an original contributor is required to process this plan.",
      403,
    );
    await assertRoundSettlementGate(tx, round, settlement, now);
    if (["SETTLED", "REFUNDED"].includes(settlement.status)) return [];
    ensure(
      settlement.status === "QUEUED",
      "Prepare the immutable settlement plan first.",
    );
    return (
      await tx.roundOperation.findMany({
        where: { roundId: round.id, status: { not: "CONFIRMED" } },
        orderBy: [{ operationKey: "asc" }, { id: "asc" }],
        take: batchLimit,
        select: { id: true },
      })
    ).map((operation) => operation.id);
  });
  for (const id of ids) {
    try {
      await executeOperation(userId, scope, id, now);
    } catch (error) {
      await recordFailure(userId, scope, id, now, error);
      throw error;
    }
  }
  return atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    const settlement = await findSettlement(tx, round);
    await assertRoundSettlementGate(tx, round, settlement, now);
    const unfinished = await tx.roundOperation.count({
      where: { roundId: round.id, status: { not: "CONFIRMED" } },
    });
    if (settlement.status !== "QUEUED" || unfinished) return settlement;
    const [held, reserved] = await Promise.all([
      account(tx, round.id, "HELD"),
      account(tx, round.id, "RESERVED"),
    ]);
    ensure(
      held.balance === 0n &&
        reserved.balance === 0n &&
        settlement.received === settlement.paid + settlement.refunded,
      "The completed settlement does not conserve funds.",
      409,
    );
    return tx.roundSettlement.update({
      where: { roundId: round.id },
      data: {
        status: settlement.paid > 0n ? "SETTLED" : "REFUNDED",
        settledAt: now,
      },
    });
  });
}

/** Reconcile local atomic ledger evidence only; this never asserts external finality. */
export async function reconcileRoundSettlement(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const scope = roundFinanceActionSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, scope.communityId);
    const round = await findRound(tx, scope);
    const settlement = await findSettlement(tx, round);
    const rights = await authority(tx, round, userId);
    ensure(
      rights.isStaff || rights.isContributor,
      "Staff or an original contributor is required to reconcile this plan.",
      403,
    );
    ensure(
      settlement.status === "QUEUED",
      "There is no queued plan to reconcile.",
      409,
    );
    await assertRoundSettlementGate(tx, round, settlement, now, {
      allowUnknown: true,
    });
    ensure(
      settlement.network === "local-simulation",
      "External outcomes require their own observed reconciliation adapter.",
      409,
    );
    const unknown = await tx.roundOperation.findMany({
      where: { roundId: round.id, status: "UNKNOWN" },
      orderBy: { operationKey: "asc" },
    });
    for (const operation of unknown) {
      const receipt = await tx.roundLedgerTransaction.findUnique({
        where: {
          roundId_operationKey: {
            roundId: round.id,
            operationKey: `execute:${operation.id}`,
          },
        },
        include: { entries: true },
      });
      if (receipt) {
        ensure(
          receipt.kind === operation.kind &&
            receipt.amount === operation.amount &&
            receipt.assetId === settlement.assetId &&
            receipt.sourceAccountId === operation.sourceAccountId &&
            receipt.destinationAccountId === operation.destinationAccountId &&
            receipt.entries.length === 2 &&
            receipt.entries.some(
              (entry) =>
                entry.accountId === operation.sourceAccountId &&
                entry.amount === -operation.amount,
            ) &&
            receipt.entries.some(
              (entry) =>
                entry.accountId === operation.destinationAccountId &&
                entry.amount === operation.amount,
            ),
          "The observed local receipt differs from the immutable execution intent; reconciliation remains blocked.",
          409,
        );
      } else
        ensure(
          operation.transactionId === null && operation.completedAt === null,
          "A claimed receipt is missing; reconciliation remains blocked.",
          409,
        );
      const attempt = operation.attempts + 1;
      const message = receipt
        ? null
        : "Local atomic ledger verified no posting; retry the same immutable operation.";
      await tx.roundExecutionAttempt.create({
        data: {
          operationId: operation.id,
          attempt,
          status: receipt ? "CONFIRMED" : "FAILED",
          error: message,
          createdAt: now,
        },
      });
      await tx.roundOperation.update({
        where: { id: operation.id },
        data: receipt
          ? {
              status: "CONFIRMED",
              attempts: attempt,
              lastError: null,
              transactionId: receipt.id,
              completedAt: receipt.createdAt,
            }
          : { status: "FAILED", attempts: attempt, lastError: message },
      });
      await audit(tx, userId, round, "ROUND_OPERATION_RECONCILED", {
        operationId: operation.id,
        network: "local-simulation",
        outcome: receipt ? "POSTED" : "NOT_POSTED",
        transactionId: receipt?.id ?? null,
      });
    }
    return { reconciled: unknown.length, network: "local-simulation" };
  });
}

export async function getRoundFinanceView(
  communityId: string,
  roundId: string,
  userId?: string,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) => {
      const round = await findRound(tx, { communityId, roundId });
      const rights = userId
        ? await authority(tx, round, userId)
        : { isStaff: false, isContributor: false, isActive: false };
      ensure(
        round.status !== "DRAFT" || rights.isStaff,
        "Funding round not found.",
        404,
      );
      if (round.rulesVersion === 1) return null;
      const settlement = await findSettlement(tx, round);
      const [accounts, ownReceipts, operations] = await Promise.all([
        tx.roundAccount.findMany({
          where: { roundId, key: { in: ["HELD", "RESERVED", "PAID"] } },
        }),
        userId
          ? tx.roundContribution.findMany({
              where: { roundId, userId },
              include: { transaction: { select: { operationKey: true } } },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            })
          : [],
        tx.roundOperation.findMany({
          where: { roundId },
          orderBy: [{ operationKey: "asc" }, { id: "asc" }],
          select: {
            id: true,
            kind: true,
            amount: true,
            recipient: true,
            status: true,
            attempts: true,
            lastError: true,
            transactionId: true,
            completedAt: true,
            beneficiaryId: true,
            schemeId: true,
          },
        }),
      ]);
      const ownContributed = ownReceipts.reduce(
        (sum, receipt) => sum + receipt.amount,
        0n,
      );
      const ownRefunded = operations
        .filter(
          (op) =>
            op.kind === "REFUND" &&
            op.status === "CONFIRMED" &&
            op.beneficiaryId === userId,
        )
        .reduce((sum, op) => sum + op.amount, 0n);
      const expired = now >= settlement.expiresAt;
      const final = ["QUEUED", "SETTLED", "REFUNDED"].includes(
        settlement.status,
      );
      const decision = [3, 4].includes(round.rulesVersion)
        ? await tx.roundDecision.findUnique({ where: { roundId } })
        : null;
      const unknown = operations.some(
        (operation) => operation.status === "UNKNOWN",
      );
      const waitingForVeto = Boolean(
        decision?.vetoClosesAt && now < decision.vetoClosesAt,
      );
      const settlementBlockedReason = unknown
        ? "An execution outcome is unknown. Reconcile its local receipt before retrying or releasing funds."
        : waitingForVeto
          ? "The full 24-hour rejection window must close before settlement or expiry recovery."
          : [3, 4].includes(round.rulesVersion) && !decision && !expired
            ? "Publish the election decision and allocation before settlement."
            : null;
      const gateReady = settlementBlockedReason === null;
      return {
        settlement,
        totals: {
          received: settlement.received,
          held: accounts.find((a) => a.key === "HELD")?.balance ?? 0n,
          reserved: accounts.find((a) => a.key === "RESERVED")?.balance ?? 0n,
          paid: settlement.paid,
          refunded: settlement.refunded,
        },
        ownContributed,
        ownRefunded,
        ownReceipts: ownReceipts.map(
          ({ id, amount, createdAt, transactionId, transaction }) => ({
            id,
            amount,
            createdAt,
            transactionId,
            operationKey: transaction.operationKey,
          }),
        ),
        operations,
        isStaff: rights.isStaff,
        canContribute:
          rights.isActive &&
          round.status === "SUBMISSIONS" &&
          settlement.status === "COLLECTING" &&
          now < settlement.collectionClosesAt &&
          ownContributed < settlement.maximumContribution,
        canPrepare:
          !final &&
          gateReady &&
          ((rights.isStaff && (round.status === "DECIDED" || expired)) ||
            (rights.isContributor && expired)),
        canProcess:
          settlement.status === "QUEUED" &&
          (rights.isStaff || rights.isContributor) &&
          gateReady,
        canRecover: !final && expired && rights.isContributor && gateReady,
        canReconcile:
          settlement.status === "QUEUED" &&
          unknown &&
          !waitingForVeto &&
          settlement.network === "local-simulation" &&
          (rights.isStaff || rights.isContributor),
        settlementBlockedReason,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
