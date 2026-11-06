import { z } from "zod";
import { uuid } from "./validation";

export const reputationTargetTypes = [
  "MEMBER",
  "SCHEME",
  "PROPOSAL",
  "ROUND",
] as const;
export const reputationDimensions = [
  "PARTICIPATION",
  "PRESENTATION",
  "VERIFIED_RECIPIENT_PERFORMANCE",
] as const;
const content = {
  score: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(20).max(3000),
};
const scope = { communityId: uuid, reviewId: uuid };
export const createReputationSchema = z
  .object({
    communityId: uuid,
    targetType: z.enum(reputationTargetTypes),
    targetId: uuid,
    dimension: z.enum(reputationDimensions),
    contextType: z.enum(["ROUND", "PROPOSAL"]),
    contextId: uuid,
    ...content,
  })
  .strict();
export const editReputationSchema = z.object({ ...scope, ...content }).strict();
export const reportReputationSchema = z
  .object({
    ...scope,
    reason: z.string().trim().min(10).max(1500),
  })
  .strict();
export const moderateReputationSchema = z
  .object({
    ...scope,
    action: z.enum(["HIDE", "RESTORE"]),
    reason: z.string().trim().min(10).max(1500),
  })
  .strict();
export const appealReputationSchema = z
  .object({
    ...scope,
    moderationId: uuid,
    statement: z.string().trim().min(20).max(2000),
  })
  .strict();

export function reviewDimensionAllowed(targetType: string, dimension: string) {
  return targetType === "MEMBER" || targetType === "ROUND"
    ? dimension === "PARTICIPATION" ||
        (targetType === "MEMBER" &&
          dimension === "VERIFIED_RECIPIENT_PERFORMANCE")
    : (targetType === "SCHEME" || targetType === "PROPOSAL") &&
        (dimension === "PRESENTATION" ||
          dimension === "VERIFIED_RECIPIENT_PERFORMANCE");
}

export function aggregateReputation(
  rows: readonly {
    targetType: string;
    targetId: string;
    dimension: string;
    score: number;
    hidden: boolean;
  }[],
) {
  const groups = new Map<
    string,
    {
      targetType: string;
      targetId: string;
      dimension: string;
      count: number;
      total: number;
      average: number;
    }
  >();
  for (const row of rows) {
    if (row.hidden) continue;
    if (!Number.isInteger(row.score) || row.score < 1 || row.score > 5)
      throw new Error("Invalid reputation score.");
    const key = `${row.targetType}:${row.targetId}:${row.dimension}`;
    const group = groups.get(key) ?? {
      targetType: row.targetType,
      targetId: row.targetId,
      dimension: row.dimension,
      count: 0,
      total: 0,
      average: 0,
    };
    group.count++;
    group.total += row.score;
    group.average = group.total / group.count;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    `${a.targetType}:${a.targetId}:${a.dimension}`.localeCompare(
      `${b.targetType}:${b.targetId}:${b.dimension}`,
    ),
  );
}

export function reputationDimensionLabel(value: string) {
  if (value === "VERIFIED_RECIPIENT_PERFORMANCE")
    return "Receipt-backed recipient experience";
  if (value === "PRESENTATION") return "Presentation";
  return "Participation";
}
