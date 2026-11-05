import { z } from "zod";
import { money, uuid } from "./validation";
import { fundsConfigSchema } from "./funds-core";

export const ROUND_STAGE_MS = 24 * 60 * 60 * 1000;
export const MAX_ROUND_SCHEMES = 50;
export const roundSchema = z
  .object({
    communityId: uuid,
    title: z.string().trim().min(5).max(140),
    description: z.string().trim().min(20).max(8000),
    proposalPolicy: z.enum(["STAFF", "MEMBERS", "EVERYONE"]),
    quorumBps: z.coerce.number().int().min(1).max(10000),
    submissionsCloseAt: z.iso.datetime(),
    funded: z.boolean().default(false),
    fundingTarget: z.unknown().optional(),
    minimumContribution: z.unknown().optional(),
    maximumContribution: z.unknown().optional(),
    collectionClosesAt: z.unknown().optional(),
    expiresAt: z.unknown().optional(),
    vetoEnabled: z.unknown().optional(),
    selectionMethod: z.unknown().optional(),
    votingWeight: z.unknown().optional(),
    allocationPolicy: z.unknown().optional(),
  })
  .strict()
  .superRefine((data, context) => {
    if (!data.funded) {
      for (const key of [
        "fundingTarget",
        "minimumContribution",
        "maximumContribution",
        "collectionClosesAt",
        "expiresAt",
        "vetoEnabled",
        "selectionMethod",
        "votingWeight",
        "allocationPolicy",
      ] as const) {
        if (data[key] !== undefined)
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Funding settings require an explicitly funded round.",
          });
      }
    }
  })
  .transform((data) => {
    const {
      funded,
      fundingTarget,
      minimumContribution,
      maximumContribution,
      collectionClosesAt,
      expiresAt,
      vetoEnabled,
      selectionMethod,
      votingWeight,
      allocationPolicy,
      ...round
    } = data;
    return {
      ...round,
      funded,
      funding: funded
        ? fundsConfigSchema.parse({
            fundingTarget,
            minimumContribution,
            maximumContribution,
            collectionClosesAt,
            expiresAt,
            vetoEnabled,
            selectionMethod,
            votingWeight,
            allocationPolicy,
          })
        : null,
    };
  });
export const schemeSchema = z.object({
  communityId: uuid,
  roundId: uuid,
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(8000),
  amount: money.refine((v) => v > 0n, "Request an amount greater than zero."),
  recipient: z.string().trim().min(2).max(150),
  category: z
    .enum(["UNSPECIFIED", "DONATION", "CROWDFUNDING", "INVESTMENT_REQUEST"])
    .default("UNSPECIFIED"),
  supportingUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(1000)
        .refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS link."),
    ])
    .default(""),
});
export const roundActionSchema = z.object({
  communityId: uuid,
  roundId: uuid,
  action: z.enum([
    "open",
    "screen",
    "close-screening",
    "close-selection",
    "cancel",
  ]),
});
export const screeningSchema = z.object({
  communityId: uuid,
  roundId: uuid,
  schemeId: uuid,
  choice: z.enum(["YES", "NO", "ABSTAIN"]),
});
export const selectionSchema = screeningSchema.omit({ choice: true });

export function selectionOutcome(
  schemeIds: string[],
  votes: { schemeId: string }[],
  eligible: number,
  quorumBps: number,
) {
  if (
    !Number.isInteger(eligible) ||
    eligible < 1 ||
    votes.length > eligible ||
    !Number.isInteger(quorumBps) ||
    quorumBps < 1 ||
    quorumBps > 10000 ||
    new Set(schemeIds).size !== schemeIds.length
  )
    throw new Error("Invalid selection configuration.");
  const counts = new Map(schemeIds.map((id) => [id, 0]));
  for (const vote of votes) {
    if (!counts.has(vote.schemeId))
      throw new Error("A selection references an unqualified scheme.");
    counts.set(vote.schemeId, counts.get(vote.schemeId)! + 1);
  }
  const quorumRequired = Math.ceil((eligible * quorumBps) / 10000);
  const maximum = Math.max(0, ...counts.values());
  const leaders = [...counts]
    .filter(([, count]) => count === maximum && count > 0)
    .map(([id]) => id);
  const outcome =
    votes.length < quorumRequired
      ? "NO_QUORUM"
      : leaders.length !== 1
        ? "TIED"
        : "WINNER_SELECTED";
  return {
    outcome,
    winnerSchemeId: outcome === "WINNER_SELECTED" ? leaders[0] : null,
    quorumRequired,
    participation: votes.length,
    counts: Object.fromEntries(counts),
  };
}
