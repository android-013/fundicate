import { z } from "zod";
import { money, uuid } from "./validation";

const positiveMoney = money.refine(
  (amount) => amount > 0n,
  "Amount must be greater than zero.",
);

// These are the only executable rules in V2. Future settings must fail validation.
export const fundsConfigSchema = z
  .object({
    fundingTarget: positiveMoney,
    minimumContribution: positiveMoney,
    maximumContribution: positiveMoney,
    collectionClosesAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    vetoEnabled: z.literal(false).default(false),
    selectionMethod: z.literal("FPTP").default("FPTP"),
    votingWeight: z.literal("EQUAL").default("EQUAL"),
    allocationPolicy: z.literal("WINNER_ALL").default("WINNER_ALL"),
  })
  .strict()
  .refine(
    (config) => config.maximumContribution >= config.minimumContribution,
    {
      message: "The maximum contribution must be at least the minimum.",
      path: ["maximumContribution"],
    },
  );
export type FundsConfig = z.output<typeof fundsConfigSchema>;

export const roundContributionSchema = z
  .object({
    communityId: uuid,
    roundId: uuid,
    amount: positiveMoney,
    idempotencyKey: uuid,
  })
  .strict();
export const roundFinanceActionSchema = z
  .object({ communityId: uuid, roundId: uuid })
  .strict();

export type ContributionShare = {
  sourceAccountId: string;
  userId: string;
  amount: bigint;
};
export type RefundShare = ContributionShare & { refund: bigint };

/** Exact largest-remainder allocation; ties use the immutable source account ID. */
export function proportionalRefunds(
  totalRefund: bigint,
  shares: readonly ContributionShare[],
): RefundShare[] {
  if (totalRefund < 0n) throw new Error("A refund cannot be negative.");
  const ids = new Set<string>();
  let total = 0n;
  for (const share of shares) {
    if (
      !share.sourceAccountId ||
      !share.userId ||
      share.amount <= 0n ||
      ids.has(share.sourceAccountId)
    )
      throw new Error(
        "Refund shares must be positive, unique original sources.",
      );
    ids.add(share.sourceAccountId);
    total += share.amount;
  }
  if (totalRefund > total)
    throw new Error("Refund exceeds the received contribution pool.");
  if (total === 0n) return [];
  const allocated = shares.map((share) => ({
    ...share,
    refund: (totalRefund * share.amount) / total,
    remainder: (totalRefund * share.amount) % total,
  }));
  let residual =
    totalRefund - allocated.reduce((sum, share) => sum + share.refund, 0n);
  const ordered = [...allocated].sort((a, b) =>
    a.remainder === b.remainder
      ? a.sourceAccountId < b.sourceAccountId
        ? -1
        : a.sourceAccountId > b.sourceAccountId
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const share of ordered) {
    if (!residual) break;
    share.refund += 1n;
    residual -= 1n;
  }
  if (residual) throw new Error("Refund remainder could not be allocated.");
  return allocated
    .sort((a, b) => (a.sourceAccountId < b.sourceAccountId ? -1 : 1))
    .map(({ sourceAccountId, userId, amount, refund }) => ({
      sourceAccountId,
      userId,
      amount,
      refund,
    }));
}

export function winnerAllPlan(
  received: bigint,
  shares: readonly ContributionShare[],
  requestedAmount: bigint | null,
) {
  const contributed = shares.reduce((sum, share) => sum + share.amount, 0n);
  if (
    received < 0n ||
    contributed !== received ||
    (requestedAmount !== null && requestedAmount <= 0n)
  )
    throw new Error(
      "The allocation must use the exact received pool and a positive request.",
    );
  const payout =
    requestedAmount === null
      ? 0n
      : requestedAmount < received
        ? requestedAmount
        : received;
  const refunds = proportionalRefunds(received - payout, shares);
  return { payout, refunded: received - payout, refunds };
}

export const V2_FUNDS_POLICY = {
  rulesVersion: 2,
  selectionMethod: "FPTP",
  votingWeight: "EQUAL",
  allocationPolicy: "WINNER_ALL",
  vetoEnabled: false,
  platformFee: "0",
  requestCap: "MIN_POOL_AND_WINNING_REQUEST",
  residualPolicy: "PRO_RATA_ORIGINAL_SOURCES_LARGEST_REMAINDER_SOURCE_ID",
  failedTargetPolicy: "REFUND_ORIGINAL_SOURCES",
  noWinnerPolicy: "REFUND_ORIGINAL_SOURCES",
  unpayablePolicy: "REFUND_ORIGINAL_SOURCES",
  expiryPolicy: "REFUND_UNPREPARED_ONLY",
} as const;
