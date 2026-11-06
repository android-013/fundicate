import { z } from "zod";
import { money } from "./validation";

export type WeightMode = "EQUAL" | "CONTRIBUTION";
export type AllocationPolicy = "WINNER_ALL" | "PROPORTIONAL" | "RANKED_CUTS";
const positiveMoney = money.refine(
  (value) => value > 0n,
  "Use a positive amount.",
);
export const v3FundsConfigSchema = z
  .object({
    fundingTarget: positiveMoney,
    minimumContribution: positiveMoney,
    maximumContribution: positiveMoney,
    collectionClosesAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    selectionMethod: z.literal("FPTP").default("FPTP"),
    screeningWeight: z.enum(["EQUAL", "CONTRIBUTION"]).default("EQUAL"),
    selectionWeight: z.enum(["EQUAL", "CONTRIBUTION"]).default("EQUAL"),
    vetoWeight: z.enum(["EQUAL", "CONTRIBUTION"]).default("EQUAL"),
    allocationPolicy: z
      .enum(["WINNER_ALL", "PROPORTIONAL", "RANKED_CUTS"])
      .default("WINNER_ALL"),
    rankedSharesBps: z
      .array(z.number().int().min(1).max(10000))
      .max(50)
      .default([]),
    vetoEnabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.maximumContribution < config.minimumContribution)
      context.addIssue({
        code: "custom",
        path: ["maximumContribution"],
        message: "Maximum must meet the minimum.",
      });
    if (config.allocationPolicy === "RANKED_CUTS") {
      if (
        !config.rankedSharesBps.length ||
        config.rankedSharesBps.reduce((sum, share) => sum + share, 0) !== 10000
      )
        context.addIssue({
          code: "custom",
          path: ["rankedSharesBps"],
          message: "Ranked shares must total 100%.",
        });
    } else if (config.rankedSharesBps.length)
      context.addIssue({
        code: "custom",
        path: ["rankedSharesBps"],
        message: "Ranked shares require ranked allocation.",
      });
  });
export type V3FundsConfig = z.output<typeof v3FundsConfigSchema>;

export const V3_RULES_POLICY = {
  rulesVersion: 3,
  selectionMethod: "FPTP",
  platformFee: "0",
  requestCap: "MIN_ENTITLEMENT_AND_REQUEST",
  residualPolicy: "PRO_RATA_ORIGINAL_SOURCES_LARGEST_REMAINDER_SOURCE_ID",
  allocationRemainder: "LARGEST_REMAINDER_SCHEME_ID_OR_SLOT_INDEX",
  rankedTiePolicy: "REFUND_ALL_TIED_POSITIONS_NO_SHIFT",
  unusedPolicy: "REFUND_NO_REDISTRIBUTION",
  failedTargetPolicy: "REFUND_ORIGINAL_SOURCES",
  noWinnerPolicy: "REFUND_ORIGINAL_SOURCES",
  unpayablePolicy: "REFUND_ORIGINAL_SOURCES",
  expiryPolicy: "REFUND_UNPREPARED_AFTER_PUBLISHED_VETO",
  vetoDurationMs: 86400000,
  vetoThreshold: "10_REJECT_GTE_9_ALL_ELIGIBLE",
  electoratePolicy: "ACTIVE_AT_COLLECTION_CUTOFF",
} as const;

function validConfiguration(
  eligible: bigint,
  quorumBps: number,
  powers: bigint[],
) {
  if (
    eligible < 0n ||
    !Number.isInteger(quorumBps) ||
    quorumBps < 1 ||
    quorumBps > 10000 ||
    powers.some((power) => power <= 0n)
  )
    throw new Error("Invalid weighted election configuration.");
  const participation = powers.reduce((sum, power) => sum + power, 0n);
  if (participation > eligible)
    throw new Error("Cast power exceeds the frozen electorate.");
  return {
    participation,
    quorumRequired: (eligible * BigInt(quorumBps) + 9999n) / 10000n,
  };
}

export function weightedScreeningOutcome(
  votes: readonly { choice: string; power: bigint }[],
  eligible: bigint,
  quorumBps: number,
) {
  const { participation, quorumRequired } = validConfiguration(
    eligible,
    quorumBps,
    votes.map((vote) => vote.power),
  );
  let yes = 0n,
    no = 0n,
    abstain = 0n;
  for (const vote of votes) {
    if (vote.choice === "YES") yes += vote.power;
    else if (vote.choice === "NO") no += vote.power;
    else if (vote.choice === "ABSTAIN") abstain += vote.power;
    else throw new Error("Unknown screening choice.");
  }
  const quorumMet = eligible > 0n && participation >= quorumRequired;
  return {
    eligible,
    yes,
    no,
    abstain,
    participation,
    quorumRequired,
    quorumMet,
    approved: quorumMet && yes > no,
  };
}

export function weightedSelectionOutcome(
  schemeIds: readonly string[],
  votes: readonly { schemeId: string; power: bigint }[],
  eligible: bigint,
  quorumBps: number,
) {
  const { participation, quorumRequired } = validConfiguration(
    eligible,
    quorumBps,
    votes.map((vote) => vote.power),
  );
  if (new Set(schemeIds).size !== schemeIds.length)
    throw new Error("Duplicate selection candidate.");
  const support = new Map(schemeIds.map((id) => [id, 0n]));
  for (const vote of votes) {
    if (!support.has(vote.schemeId))
      throw new Error("Unqualified selection candidate.");
    support.set(vote.schemeId, support.get(vote.schemeId)! + vote.power);
  }
  const ordered = [...support].sort(([a, left], [b, right]) =>
    left === right ? (a < b ? -1 : a > b ? 1 : 0) : left > right ? -1 : 1,
  );
  let rank = 1;
  const ranking = ordered.map(([schemeId, value], index) => {
    if (index && ordered[index - 1][1] !== value) rank = index + 1;
    return { schemeId, support: value, rank };
  });
  const leaders = ranking.filter(
    (entry) => entry.support > 0n && entry.rank === 1,
  );
  const outcome =
    eligible === 0n || participation < quorumRequired
      ? "NO_QUORUM"
      : leaders.length !== 1
        ? "TIED"
        : "WINNER_SELECTED";
  return {
    outcome,
    winnerSchemeId: outcome === "WINNER_SELECTED" ? leaders[0].schemeId : null,
    eligible,
    participation,
    quorumRequired,
    counts: Object.fromEntries(support),
    ranking,
  };
}

export type AllocationCandidate = {
  schemeId: string;
  request: bigint;
  recipient: string;
  beneficiaryId: string;
  support: bigint;
};
export type AllocationPayout = {
  schemeId: string;
  amount: bigint;
  recipient: string;
  beneficiaryId: string;
};
const payable = (recipient: string) =>
  recipient.trim().length >= 2 &&
  recipient.length <= 150 &&
  !/[\u0000-\u001f\u007f]/.test(recipient);

function distribute(
  pool: bigint,
  weights: readonly { key: string; weight: bigint }[],
) {
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0n);
  if (total <= 0n) return new Map<string, bigint>();
  const shares = weights.map((entry) => ({
    ...entry,
    amount: (pool * entry.weight) / total,
    remainder: (pool * entry.weight) % total,
  }));
  let remainder = pool - shares.reduce((sum, share) => sum + share.amount, 0n);
  for (const share of [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.key < b.key
        ? -1
        : a.key > b.key
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (!remainder) break;
    share.amount += 1n;
    remainder -= 1n;
  }
  if (remainder)
    throw new Error("Allocation failed to conserve remainder units.");
  return new Map(shares.map((share) => [share.key, share.amount]));
}

export function allocateV3(
  received: bigint,
  candidates: readonly AllocationCandidate[],
  policy: AllocationPolicy,
  rankedSharesBps: readonly number[] = [],
) {
  if (
    received < 0n ||
    new Set(candidates.map((candidate) => candidate.schemeId)).size !==
      candidates.length ||
    candidates.some(
      (candidate) =>
        !candidate.schemeId ||
        !candidate.beneficiaryId ||
        candidate.request <= 0n ||
        candidate.support < 0n,
    )
  )
    throw new Error("Invalid allocation basis.");
  if (!["WINNER_ALL", "PROPORTIONAL", "RANKED_CUTS"].includes(policy))
    throw new Error("Unknown allocation policy.");
  if (policy === "RANKED_CUTS") {
    if (
      !rankedSharesBps.length ||
      rankedSharesBps.length > 50 ||
      rankedSharesBps.some(
        (share) => !Number.isInteger(share) || share <= 0 || share > 10000,
      ) ||
      rankedSharesBps.reduce((sum, share) => sum + share, 0) !== 10000
    )
      throw new Error("Ranked shares must total exactly 100%.");
  } else if (rankedSharesBps.length)
    throw new Error("Unexpected ranked shares.");
  const positive = candidates
    .filter((candidate) => candidate.support > 0n)
    .sort((a, b) =>
      a.support === b.support
        ? a.schemeId < b.schemeId
          ? -1
          : 1
        : a.support > b.support
          ? -1
          : 1,
    );
  const entitlements = new Map<string, bigint>();
  if (policy === "WINNER_ALL") {
    if (
      positive.length &&
      (positive.length === 1 || positive[0].support > positive[1].support)
    )
      entitlements.set(positive[0].schemeId, received);
  } else if (policy === "PROPORTIONAL") {
    for (const [id, amount] of distribute(
      received,
      positive.map((candidate) => ({
        key: candidate.schemeId,
        weight: candidate.support,
      })),
    ))
      entitlements.set(id, amount);
  } else {
    const slots = distribute(
      received,
      rankedSharesBps.map((share, index) => ({
        key: index.toString().padStart(3, "0"),
        weight: BigInt(share),
      })),
    );
    for (let index = 0; index < positive.length;) {
      let end = index + 1;
      while (
        end < positive.length &&
        positive[end].support === positive[index].support
      )
        end++;
      if (end === index + 1 && index < rankedSharesBps.length)
        entitlements.set(
          positive[index].schemeId,
          slots.get(index.toString().padStart(3, "0")) ?? 0n,
        );
      index = end;
    }
  }
  const payouts: AllocationPayout[] = [];
  for (const candidate of positive) {
    const entitlement = entitlements.get(candidate.schemeId) ?? 0n;
    const amount =
      candidate.request < entitlement ? candidate.request : entitlement;
    if (amount > 0n && payable(candidate.recipient))
      payouts.push({
        schemeId: candidate.schemeId,
        amount,
        recipient: candidate.recipient,
        beneficiaryId: candidate.beneficiaryId,
      });
  }
  payouts.sort((a, b) => (a.schemeId < b.schemeId ? -1 : 1));
  const paid = payouts.reduce((sum, payout) => sum + payout.amount, 0n);
  if (paid > received) throw new Error("Allocation exceeds received funds.");
  return { payouts, refundTotal: received - paid };
}
