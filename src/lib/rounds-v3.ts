import {
  Prisma,
  type FundingRound,
  type RoundSettlement,
  type RoundVotingPower,
} from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { atomic } from "./service";
import { ensure } from "./errors";
import { uuid } from "./validation";
import {
  V3_RULES_POLICY,
  allocateV3,
  weightedScreeningOutcome,
  weightedSelectionOutcome,
} from "./elections-core";

type Tx = Prisma.TransactionClient;
type Stage = "screening" | "selection" | "veto";
const day = 86400000;
const identity = { id: true, displayName: true, username: true } as const;
const scopeSchema = z.object({ communityId: uuid, roundId: uuid }).strict();
const vetoSchema = scopeSchema
  .extend({ choice: z.enum(["REJECT", "KEEP", "ABSTAIN"]) })
  .strict();
const settingsSchema = z
  .object({
    screeningWeight: z.enum(["EQUAL", "CONTRIBUTION"]),
    selectionWeight: z.enum(["EQUAL", "CONTRIBUTION"]),
    vetoWeight: z.enum(["EQUAL", "CONTRIBUTION"]),
    allocationPolicy: z.enum(["WINNER_ALL", "PROPORTIONAL", "RANKED_CUTS"]),
    rankedSharesBps: z.array(z.number().int().min(1).max(10000)).max(50),
    vetoEnabled: z.boolean(),
    selectionMethod: z.literal("FPTP"),
  })
  .superRefine((value, context) => {
    if (
      value.allocationPolicy === "RANKED_CUTS"
        ? !value.rankedSharesBps.length ||
          value.rankedSharesBps.reduce((sum, share) => sum + share, 0) !== 10000
        : value.rankedSharesBps.length !== 0
    )
      context.addIssue({
        code: "custom",
        path: ["rankedSharesBps"],
        message: "Invalid published ranked shares.",
      });
  });
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      typeof entry === "bigint" ? entry.toString() : entry,
    ),
  );
}
async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
async function findRound(
  tx: Tx,
  scope: { communityId: string; roundId: string },
) {
  const round = await tx.fundingRound.findFirst({
    where: { id: scope.roundId, communityId: scope.communityId },
  });
  ensure(round, "Funding round not found.", 404);
  return round;
}
async function settlementFor(tx: Tx, round: FundingRound) {
  const settlement = await tx.roundSettlement.findUnique({
    where: { roundId: round.id },
  });
  ensure(
    round.rulesVersion === 3 && settlement?.rulesVersion === 3,
    "This action requires a funded V3 round.",
    400,
  );
  getV3Settings(settlement);
  return settlement;
}
export function getV3Settings(settlement: RoundSettlement) {
  ensure(
    settlement.rulesVersion === 3 &&
      settlement.network === "local-simulation" &&
      settlement.decimals === 2 &&
      settlement.assetId === `fiat:${settlement.currency}`,
    "Unsupported V3 asset or rules.",
    409,
  );
  const snapshot = settlement.rulesSnapshot as Record<string, unknown>;
  ensure(
    Object.entries(V3_RULES_POLICY).every(
      ([key, value]) => snapshot?.[key] === value,
    ),
    "Unsupported V3 policy snapshot.",
    409,
  );
  return settingsSchema.parse(snapshot);
}
export function v3Weight(
  settlement: RoundSettlement,
  power:
    | Pick<RoundVotingPower, "eligible" | "paidPower" | "frozenAt">
    | null
    | undefined,
  stage: Stage,
) {
  if (!power?.eligible || !power.frozenAt) return 0n;
  const mode = getV3Settings(settlement)[`${stage}Weight`];
  return mode === "EQUAL" ? 1n : power.paidPower;
}
export async function seedV3Electorate(tx: Tx, round: FundingRound, now: Date) {
  if (round.rulesVersion !== 3) return;
  const members = await tx.communityMembership.findMany({
    where: { communityId: round.communityId, status: "ACTIVE" },
    select: { userId: true },
    take: 10001,
  });
  ensure(
    members.length <= 10000,
    "V3 rounds support at most 10,000 eligible members.",
  );
  await tx.roundVotingPower.createMany({
    data: members.map((member) => ({
      roundId: round.id,
      userId: member.userId,
      eligible: true,
      createdAt: now,
    })),
    skipDuplicates: true,
  });
}
export async function freezeV3Electorate(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  now: Date,
): Promise<{ ready: boolean; reason?: string }> {
  if (round.rulesVersion !== 3) return { ready: true };
  const settings = getV3Settings(settlement);
  ensure(
    now >= settlement.collectionClosesAt,
    "The received voting basis cannot freeze before cutoff.",
  );
  const received = await tx.roundContribution.groupBy({
    by: ["userId"],
    where: {
      roundId: round.id,
      createdAt: { lt: settlement.collectionClosesAt },
    },
    _sum: { amount: true },
  });
  const byUser = new Map(
    received.map((entry) => [entry.userId, entry._sum.amount ?? 0n]),
  );
  const powers = await tx.roundVotingPower.findMany({
    where: { roundId: round.id },
    orderBy: { userId: "asc" },
  });
  for (const power of powers) {
    if (power.frozenAt) continue;
    await tx.roundVotingPower.update({
      where: { roundId_userId: { roundId: round.id, userId: power.userId } },
      data: {
        paidPower: power.eligible ? (byUser.get(power.userId) ?? 0n) : 0n,
        frozenAt: now,
      },
    });
  }
  const frozen = await tx.roundVotingPower.findMany({
    where: { roundId: round.id, eligible: true },
  });
  if (!frozen.length || frozen.length > 10000)
    return { ready: false, reason: "ZERO_POWER" };
  for (const stage of ["screening", "selection", "veto"] as const) {
    if (stage === "veto" && !settings.vetoEnabled) continue;
    if (
      frozen.reduce(
        (sum, power) => sum + v3Weight(settlement, power, stage),
        0n,
      ) === 0n
    )
      return { ready: false, reason: "ZERO_POWER" };
  }
  return { ready: true };
}
async function powerBasis(tx: Tx, round: FundingRound, stage: Stage) {
  const settlement = await settlementFor(tx, round);
  const powers = await tx.roundVotingPower.findMany({
    where: { roundId: round.id },
  });
  const weights = new Map(
    powers.map((power) => [power.userId, v3Weight(settlement, power, stage)]),
  );
  return {
    settlement,
    weights,
    total: [...weights.values()].reduce((sum, power) => sum + power, 0n),
  };
}
export async function tallyV3Screening(
  tx: Tx,
  round: FundingRound,
  schemeId: string,
) {
  const basis = await powerBasis(tx, round, "screening");
  const votes = await tx.schemeScreeningVote.findMany({
    where: { roundId: round.id, schemeId },
    select: { choice: true, userId: true },
  });
  return weightedScreeningOutcome(
    votes.map((vote) => ({
      choice: vote.choice,
      power: basis.weights.get(vote.userId) ?? 0n,
    })),
    basis.total,
    round.quorumBps,
  );
}
export async function tallyV3Selection(tx: Tx, round: FundingRound) {
  const basis = await powerBasis(tx, round, "selection");
  const [schemes, votes] = await Promise.all([
    tx.fundingScheme.findMany({
      where: { roundId: round.id, status: "QUALIFIED" },
      select: { id: true },
    }),
    tx.roundSelectionVote.findMany({
      where: { roundId: round.id },
      select: { schemeId: true, userId: true },
    }),
  ]);
  return weightedSelectionOutcome(
    schemes.map((scheme) => scheme.id),
    votes.map((vote) => ({
      schemeId: vote.schemeId,
      power: basis.weights.get(vote.userId) ?? 0n,
    })),
    basis.total,
    round.quorumBps,
  );
}
export async function publishRoundDecision(
  tx: Tx,
  round: FundingRound,
  actorId: string,
  now: Date,
) {
  ensure(
    round.rulesVersion === 3 && round.status === "DECIDED",
    "A V3 decision must be final before publication.",
    409,
  );
  const existing = await tx.roundDecision.findUnique({
    where: { roundId: round.id },
  });
  if (existing) return existing;
  const settlement = await settlementFor(tx, round);
  const settings = getV3Settings(settlement);
  ensure(
    settlement.frozenAt,
    "Freeze received funds before decision publication.",
    409,
  );
  const selection = round.selectionOpensAt
    ? await tallyV3Selection(tx, round)
    : null;
  const schemes = await tx.fundingScheme.findMany({
    where: { roundId: round.id, status: "QUALIFIED" },
  });
  const hasAward =
    ["WINNER_SELECTED", "ALLOCATION_SELECTED"].includes(round.outcome ?? "") &&
    selection &&
    selection.participation >= selection.quorumRequired &&
    selection.eligible > 0n;
  const allocation = hasAward
    ? allocateV3(
        settlement.received,
        schemes.map((scheme) => ({
          schemeId: scheme.id,
          request: scheme.amount,
          recipient: scheme.recipient,
          beneficiaryId: scheme.authorId,
          support: selection.counts[scheme.id] ?? 0n,
        })),
        settings.allocationPolicy,
        settings.rankedSharesBps,
      )
    : { payouts: [], refundTotal: settlement.received };
  const veto = await powerBasis(tx, round, "veto");
  const decision = await tx.roundDecision.create({
    data: {
      roundId: round.id,
      publishedAt: now,
      totalVetoPower: veto.total,
      vetoClosesAt: settings.vetoEnabled ? new Date(now.getTime() + day) : null,
      vetoFinalizedAt: settings.vetoEnabled ? null : now,
      result: json({ ...(selection ?? {}), outcome: round.outcome }),
      allocation: json({
        rulesVersion: 3,
        assetId: settlement.assetId,
        received: settlement.received,
        payouts: allocation.payouts,
        refundTotal: allocation.refundTotal,
        policy: settings.allocationPolicy,
        reason: round.outcome,
      }),
    },
  });
  await tx.auditEvent.create({
    data: {
      communityId: round.communityId,
      actorId,
      entityId: round.id,
      action: "ROUND_DECISION_PUBLISHED",
      details: {
        rulesVersion: 3,
        vetoEnabled: settings.vetoEnabled,
        publishedAt: now.toISOString(),
        vetoClosesAt: decision.vetoClosesAt?.toISOString() ?? null,
        outcome: round.outcome,
      },
    },
  });
  return decision;
}
async function vetoTally(tx: Tx, round: FundingRound) {
  const basis = await powerBasis(tx, round, "veto");
  const votes = await tx.roundVetoVote.findMany({
    where: { roundId: round.id },
    include: { user: { select: identity } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  let rejectedPower = 0n;
  for (const vote of votes)
    if (vote.choice === "REJECT")
      rejectedPower += basis.weights.get(vote.userId) ?? 0n;
  return { ...basis, votes, rejectedPower };
}
export async function finalizeRoundVeto(
  tx: Tx,
  round: FundingRound,
  now: Date,
) {
  const decision = await tx.roundDecision.findUnique({
    where: { roundId: round.id },
  });
  ensure(decision, "The immutable allocation has not been published.", 409);
  if (decision.vetoFinalizedAt) return decision;
  ensure(
    decision.vetoClosesAt && now >= decision.vetoClosesAt,
    "The full 24-hour veto window must finish.",
    409,
  );
  const tally = await vetoTally(tx, round);
  ensure(
    tally.total === decision.totalVetoPower,
    "The frozen veto denominator changed.",
    409,
  );
  const rejected =
    tally.total > 0n && tally.rejectedPower * 10n >= tally.total * 9n;
  return tx.roundDecision.update({
    where: { roundId: round.id },
    data: { vetoFinalizedAt: now, rejected },
  });
}
export async function assertRoundSettlementGate(
  tx: Tx,
  round: FundingRound,
  settlement: RoundSettlement,
  now: Date,
  options: { allowUnknown?: boolean } = {},
) {
  ensure(
    settlement.network === "local-simulation",
    "External outcomes require a supported reconciliation adapter.",
    409,
  );
  if (!options.allowUnknown)
    ensure(
      !(await tx.roundOperation.count({
        where: { roundId: round.id, status: "UNKNOWN" },
      })),
      "Unknown execution outcomes must be reconciled before submission or release.",
      409,
    );
  if (round.rulesVersion !== 3) return { decision: null, rejected: false };
  getV3Settings(settlement);
  const decision = await tx.roundDecision.findUnique({
    where: { roundId: round.id },
  });
  if (!decision) {
    const snapshot = settlement.allocationSnapshot;
    const plan =
      snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? (snapshot as Record<string, Prisma.JsonValue>)
        : null;
    const existingExpiryRefund = Boolean(
      settlement.preparedAt &&
      ["QUEUED", "REFUNDED"].includes(settlement.status) &&
      ["EXPIRED", "FUNDING_FAILED"].includes(settlement.reason ?? "") &&
      plan?.rulesVersion === 3 &&
      plan.reason === settlement.reason &&
      plan.assetId === settlement.assetId &&
      plan.received === settlement.received.toString() &&
      plan.payout === "0" &&
      plan.refunded === settlement.received.toString() &&
      Array.isArray(plan.payouts) &&
      plan.payouts.length === 0 &&
      plan.decisionRoundId === null &&
      !(await tx.roundOperation.count({
        where: { roundId: round.id, kind: "PAYOUT" },
      })),
    );
    ensure(
      now >= settlement.expiresAt &&
        (!settlement.preparedAt || existingExpiryRefund),
      "Publish the immutable decision before preparing settlement.",
      409,
    );
    return { decision: null, rejected: false };
  }
  ensure(round.status === "DECIDED", "The election is not final.", 409);
  ensure(
    now >= decision.publishedAt,
    "The published decision is not effective yet.",
    409,
  );
  const finalized = await finalizeRoundVeto(tx, round, now);
  return { decision: finalized, rejected: finalized.rejected };
}
async function authority(tx: Tx, round: FundingRound, userId?: string) {
  if (!userId) return false;
  const [membership, community, power, receipt] = await Promise.all([
    tx.communityMembership.findUnique({
      where: { communityId_userId: { communityId: round.communityId, userId } },
    }),
    tx.community.findUniqueOrThrow({
      where: { id: round.communityId },
      select: { adminId: true },
    }),
    tx.roundVotingPower.findUnique({
      where: { roundId_userId: { roundId: round.id, userId } },
    }),
    tx.roundContribution.findFirst({
      where: { roundId: round.id, userId },
      select: { id: true },
    }),
  ]);
  return Boolean(
    receipt ||
    (power?.eligible && power.frozenAt) ||
    (membership?.status === "ACTIVE" &&
      (membership.role === "MODERATOR" || community.adminId === userId)),
  );
}
export async function castRoundVetoVote(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = vetoSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data);
    const settlement = await settlementFor(tx, round);
    const decision = await tx.roundDecision.findUnique({
      where: { roundId: round.id },
    });
    ensure(
      getV3Settings(settlement).vetoEnabled &&
        decision?.vetoClosesAt &&
        !decision.vetoFinalizedAt &&
        now >= decision.publishedAt &&
        now < decision.vetoClosesAt,
      "The rejection veto is not open.",
      409,
    );
    const power = await tx.roundVotingPower.findUnique({
      where: { roundId_userId: { roundId: round.id, userId } },
    });
    ensure(
      v3Weight(settlement, power, "veto") > 0n,
      "You have no frozen eligible veto power.",
      403,
    );
    ensure(
      !(await tx.roundVetoVote.findUnique({
        where: { roundId_userId: { roundId: round.id, userId } },
      })),
      "Your veto ballot is already recorded.",
      409,
    );
    return tx.roundVetoVote.create({
      data: { roundId: round.id, userId, choice: data.choice, createdAt: now },
    });
  });
}
export async function closeRoundVeto(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = scopeSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data);
    await settlementFor(tx, round);
    ensure(
      await authority(tx, round, userId),
      "A frozen participant, contributor or active staff member is required.",
      403,
    );
    const decision = await finalizeRoundVeto(tx, round, now);
    return decision;
  });
}
export async function getV3RoundView(
  communityId: string,
  roundId: string,
  userId?: string,
  now = new Date(),
) {
  return db.$transaction(
    async (tx) => {
      const round = await findRound(tx, { communityId, roundId });
      if (round.rulesVersion !== 3) return null;
      const settlement = await settlementFor(tx, round);
      const membership = userId
        ? await tx.communityMembership.findUnique({
            where: { communityId_userId: { communityId, userId } },
          })
        : null;
      const community = await tx.community.findUniqueOrThrow({
        where: { id: communityId },
        select: { adminId: true },
      });
      const staff =
        membership?.status === "ACTIVE" &&
        (membership.role === "MODERATOR" || community.adminId === userId);
      ensure(
        staff || !["DRAFT", "CANCELLED"].includes(round.status),
        "Funding round not found.",
        404,
      );
      const settings = getV3Settings(settlement);
      const powers = await tx.roundVotingPower.findMany({ where: { roundId } });
      const own = powers.find((power) => power.userId === userId);
      const ownPower = {
        screening: v3Weight(settlement, own, "screening"),
        selection: v3Weight(settlement, own, "selection"),
        veto: v3Weight(settlement, own, "veto"),
      };
      const totalPower = { screening: 0n, selection: 0n, veto: 0n };
      for (const stage of ["screening", "selection", "veto"] as const)
        totalPower[stage] = powers.reduce(
          (sum, power) => sum + v3Weight(settlement, power, stage),
          0n,
        );
      const schemes = await tx.fundingScheme.findMany({
        where: { roundId },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      const screeningResults = ["SELECTION", "DECIDED"].includes(round.status)
        ? await Promise.all(
            schemes.map(async (scheme) => ({
              schemeId: scheme.id,
              ...(await tallyV3Screening(tx, round, scheme.id)),
            })),
          )
        : null;
      const selectionResult =
        round.status === "DECIDED" && round.selectionOpensAt
          ? await tallyV3Selection(tx, round)
          : null;
      const decision = await tx.roundDecision.findUnique({
        where: { roundId },
      });
      const tally = await vetoTally(tx, round);
      const open = Boolean(
        decision?.vetoClosesAt &&
        now >= decision.publishedAt &&
        now < decision.vetoClosesAt &&
        !decision.vetoFinalizedAt,
      );
      const closed = Boolean(
        decision && (!decision.vetoClosesAt || now >= decision.vetoClosesAt),
      );
      const rejected = Boolean(
        decision &&
        (decision.vetoFinalizedAt
          ? decision.rejected
          : closed &&
            decision.totalVetoPower > 0n &&
            tally.rejectedPower * 10n >= decision.totalVetoPower * 9n),
      );
      const state = !decision
        ? ("NOT_PUBLISHED" as const)
        : !settings.vetoEnabled
          ? ("DISABLED" as const)
          : open
            ? ("OPEN" as const)
            : rejected
              ? ("REJECTED" as const)
              : ("PASSED" as const);
      return {
        settings,
        frozenAt: settlement.frozenAt,
        ownPower,
        totalPower,
        screeningResults,
        selectionResult,
        decision,
        veto: {
          state,
          ownChoice:
            tally.votes.find((vote) => vote.userId === userId)?.choice ?? null,
          canVote:
            open &&
            ownPower.veto > 0n &&
            !tally.votes.some((vote) => vote.userId === userId),
          canClose: Boolean(
            decision &&
            settings.vetoEnabled &&
            closed &&
            !decision.vetoFinalizedAt &&
            (await authority(tx, round, userId)),
          ),
          rejectedPower: closed ? tally.rejectedPower : null,
          ballots: closed
            ? tally.votes.map((vote) => ({
                user: vote.user,
                choice: vote.choice,
              }))
            : null,
          closesAt: decision?.vetoClosesAt ?? null,
        },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
