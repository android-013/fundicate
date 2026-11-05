import {
  Prisma,
  type FundingRound,
  type RoundSettlement,
} from "@prisma/client";
import { db } from "./db";
import { access, atomic } from "./service";
import { AppError, ensure } from "./errors";
import {
  type ContributionShare,
  type FundsConfig,
  V2_FUNDS_POLICY,
  roundContributionSchema,
  roundFinanceActionSchema,
  winnerAllPlan,
} from "./funds-core";

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
    round.rulesVersion === 2 && settlement,
    "This is a decision-only round; it has no payment authority.",
    400,
  );
  assertRules(settlement);
  return settlement;
}
function assertRules(settlement: RoundSettlement) {
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
  config: FundsConfig,
  now: Date,
) {
  ensure(
    round.rulesVersion === 2 && round.status === "DRAFT",
    "Only a new V2 draft can receive funding rules.",
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
      config.vetoEnabled === false &&
      config.selectionMethod === "FPTP" &&
      config.votingWeight === "EQUAL" &&
      config.allocationPolicy === "WINNER_ALL",
    "Unsupported funding configuration.",
  );
  const community = await tx.community.findUniqueOrThrow({
    where: { id: round.communityId },
  });
  return tx.roundSettlement.create({
    data: {
      roundId: round.id,
      rulesVersion: 2,
      assetId: `fiat:${community.currency}`,
      currency: community.currency,
      fundingTarget: config.fundingTarget,
      minimumContribution: config.minimumContribution,
      maximumContribution: config.maximumContribution,
      collectionClosesAt: cutoff,
      expiresAt: expires,
      rulesSnapshot: {
        ...V2_FUNDS_POLICY,
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
  if (settlement.frozenAt) return settlement;
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
  return tx.roundSettlement.update({
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
}

async function queuePlan(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  actorId: string,
  now: Date,
  forceRefundReason?: string,
) {
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
  const reason =
    now >= settlement.expiresAt
      ? "EXPIRED"
      : settlement.received < settlement.fundingTarget
        ? "FUNDING_FAILED"
        : null;
  if (reason) {
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
      settlement.received < settlement.fundingTarget
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
    if (!operation || operation.status === "CONFIRMED") return;
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
          ((rights.isStaff && (round.status === "DECIDED" || expired)) ||
            (rights.isContributor && expired)),
        canProcess:
          settlement.status === "QUEUED" &&
          (rights.isStaff || rights.isContributor),
        canRecover: !final && expired && rights.isContributor,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
