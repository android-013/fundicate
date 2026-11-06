import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { ensure } from "./errors";
import { csvDocument } from "./analytics-core";
import { chainAnalytics } from "./chain-service";

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const value = new Date(v + "T00:00:00.000Z");
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === v;
}, "Use a valid calendar day.");
export const systemFiltersSchema = z.object({
  community: z.string().regex(/^(?:all|[a-z0-9]+(?:-[a-z0-9]+)*)$/).max(60).default("all"),
  from: calendarDay.optional(),
  to: calendarDay.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  dataset: z.enum(["rounds", "funds", "reputation", "chain"]).default("rounds"),
}).strict().refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not follow the end date.", path: ["from"] });
export type SystemFilters = z.infer<typeof systemFiltersSchema>;
export function parseSystemFilters(raw: Record<string, string | string[] | undefined>) {
  ensure(!Object.values(raw).some(Array.isArray), "Use each report filter only once.");
  return systemFiltersSchema.parse(Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== "")));
}
export type AssetTotals = {
  network: string; assetId: string; currency: string; decimals: number;
  received: string; held: string; reserved: string; paid: string; refunded: string; rounds: number;
};
type MoneyRow = {
  network: string; assetId: string; currency: string; decimals: number;
  received: bigint; held: bigint; reserved: bigint; paid: bigint; refunded: bigint;
};
export function groupAssetTotals(rows: readonly MoneyRow[]): AssetTotals[] {
  const groups = new Map<string, MoneyRow & { rounds: number }>();
  for (const row of rows) {
    ensure([row.received, row.held, row.reserved, row.paid, row.refunded].every((amount) => amount >= 0n) && row.received === row.held + row.reserved + row.paid + row.refunded, "Round custody and liabilities do not reconcile.", 409);
    const key = JSON.stringify([row.network, row.assetId, row.currency, row.decimals]);
    const value = groups.get(key) ?? { ...row, received: 0n, held: 0n, reserved: 0n, paid: 0n, refunded: 0n, rounds: 0 };
    for (const field of ["received", "held", "reserved", "paid", "refunded"] as const) value[field] += row[field];
    value.rounds++;
    groups.set(key, value);
  }
  return [...groups.values()].map((value) => ({ ...value, received: value.received.toString(), held: value.held.toString(), reserved: value.reserved.toString(), paid: value.paid.toString(), refunded: value.refunded.toString() })).sort((a, b) => JSON.stringify([a.network, a.assetId]).localeCompare(JSON.stringify([b.network, b.assetId])));
}
function record(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Record<string, Prisma.JsonValue> : {};
}
function integer(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && /^\d+$/.test(value) ? value : typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
}
export function sealedResultSummary(input: {
  status: string; result: Prisma.JsonValue | null; vetoClosesAt: Date | null; vetoFinalizedAt: Date | null; rejected: boolean;
}, now: Date) {
  const selectionClosed = input.status === "DECIDED";
  const vetoOpen = Boolean(input.vetoClosesAt && input.vetoClosesAt > now);
  // Do not even read/serialize a selection field while the complete round context is sealed.
  const published = selectionClosed && !vetoOpen;
  const result = published ? record(input.result) : {};
  return {
    sealed: !published,
    participation: published ? integer(result.participation) : null,
    eligiblePower: published ? integer(result.eligible) : null,
    quorumRequired: published ? integer(result.quorumRequired) : null,
    veto: vetoOpen ? "OPEN_SEALED" : input.vetoClosesAt ? input.vetoFinalizedAt ? input.rejected ? "REJECTED" : "NOT_REJECTED" : "AWAITING_FINALIZATION" : "DISABLED",
  };
}

/** A bounded cohort report. Every total covers the complete, explicitly selected round cohort. */
export async function getReleaseAnalytics(userId: string, input: unknown = {}, now = new Date()) {
  const filters = systemFiltersSchema.parse(input);
  return db.$transaction(async (tx) => {
    const memberships = await tx.communityMembership.findMany({ where: { userId, status: "ACTIVE" }, select: { communityId: true, community: { select: { id: true, name: true, slug: true } } }, orderBy: { joinedAt: "asc" } });
    ensure(filters.community === "all" || memberships.some((m) => m.community.slug === filters.community), "System analysis is limited to your active communities.", 403);
    const communities = memberships.filter((m) => filters.community === "all" || m.community.slug === filters.community).map((m) => m.community);
    const communityIds = communities.map((c) => c.id);
    const createdAt = {
      ...(filters.from ? { gte: new Date(filters.from + "T00:00:00.000Z") } : {}),
      ...(filters.to ? { lt: new Date(new Date(filters.to + "T00:00:00.000Z").getTime() + 86400000) } : {}),
    };
    const rounds = await tx.fundingRound.findMany({
      where: { communityId: { in: communityIds }, createdAt },
      include: { community: { select: { slug: true, name: true } }, settlement: { include: { accounts: { where: { key: { in: ["HELD", "RESERVED"] } }, select: { key: true, balance: true } } } }, decision: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 501,
    });
    ensure(rounds.length <= 500, "This report exceeds 500 rounds. Choose a community or narrower round creation dates; totals are never silently truncated.", 422);
    const funded = rounds.filter((round) => round.settlement !== null);
    const assets = groupAssetTotals(funded.map((round) => {
      const s = round.settlement!;
      return { network: s.network, assetId: s.assetId, currency: s.currency, decimals: s.decimals, received: s.received, paid: s.paid, refunded: s.refunded, held: s.accounts.find((a) => a.key === "HELD")?.balance ?? 0n, reserved: s.accounts.find((a) => a.key === "RESERVED")?.balance ?? 0n };
    }));
    const summaries = rounds.map((round) => {
      const settings = record(round.settlement?.rulesSnapshot);
      const decision = round.decision;
      const publicResult = sealedResultSummary({ status: round.status, result: decision?.result ?? null, vetoClosesAt: decision?.vetoClosesAt ?? null, vetoFinalizedAt: decision?.vetoFinalizedAt ?? null, rejected: decision?.rejected ?? false }, now);
      return { id: round.id, title: round.title, community: round.community.name, slug: round.community.slug, href: `/communities/${round.community.slug}/rounds/${round.id}`, createdAt: round.createdAt.toISOString(), status: round.status, rulesVersion: round.rulesVersion, method: typeof settings.selectionMethod === "string" ? settings.selectionMethod : "FPTP", screeningWeight: typeof settings.screeningWeight === "string" ? settings.screeningWeight : "EQUAL", selectionWeight: typeof settings.selectionWeight === "string" ? settings.selectionWeight : "EQUAL", vetoWeight: typeof settings.vetoWeight === "string" ? settings.vetoWeight : "EQUAL", allocationPolicy: typeof settings.allocationPolicy === "string" ? settings.allocationPolicy : round.settlement ? "WINNER_ALL" : "DECISION_ONLY", ...publicResult,
        money: round.settlement ? { assetId: round.settlement.assetId, currency: round.settlement.currency, network: round.settlement.network, decimals: round.settlement.decimals, received: round.settlement.received.toString(), paid: round.settlement.paid.toString(), refunded: round.settlement.refunded.toString(), held: (round.settlement.accounts.find((a) => a.key === "HELD")?.balance ?? 0n).toString(), reserved: (round.settlement.accounts.find((a) => a.key === "RESERVED")?.balance ?? 0n).toString() } : null,
        allocation: !publicResult.sealed && decision ? record(decision.allocation) : null,
      };
    });
    const methodCounts = new Map<string, number>();
    for (const round of summaries) {
      const key = `${round.method} / ${round.selectionWeight} / ${round.allocationPolicy}`;
      methodCounts.set(key, (methodCounts.get(key) ?? 0) + 1);
    }
    // Only latest, currently visible scores enter aggregates. Bodies, authors, reports and hidden scores never leave this query.
    const reputation = communityIds.length ? await tx.$queryRaw<{ communityId: string; targetType: string; dimension: string; count: bigint; total: bigint }[]>`
      SELECT r."communityId",r."targetType",r.dimension,COUNT(*)::bigint AS count,SUM(v.score)::bigint AS total
      FROM "ReputationReview" r
      JOIN LATERAL (SELECT score FROM "ReputationRevision" v WHERE v."reviewId"=r.id ORDER BY revision DESC LIMIT 1) v ON true
      LEFT JOIN LATERAL (SELECT action FROM "ReputationModeration" m WHERE m."reviewId"=r.id ORDER BY sequence DESC LIMIT 1) m ON true
      WHERE r."communityId" IN (${Prisma.join(communityIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND COALESCE(m.action,'RESTORE') <> 'HIDE'
      GROUP BY r."communityId",r."targetType",r.dimension ORDER BY r."communityId",r."targetType",r.dimension
    ` : [];
    const chain = await chainAnalytics(tx, communityIds);
    const pageSize = 25;
    const pageCount = Math.max(1, Math.ceil(summaries.length / pageSize));
    ensure(filters.page <= pageCount, "This report page does not exist.", 404);
    return {
      filters, generatedAt: now.toISOString(), communities: memberships.map((m) => m.community),
      scope: { roundCount: rounds.length, fundedCount: funded.length, sealedCount: summaries.filter((r) => r.sealed).length, pageSize, pageCount, selectedCommunities: communities.length, definition: "Money and election totals cover rounds created within the selected dates. Reputation and chain custody are current snapshots of the selected communities, independent of those dates." },
      assets, methods: [...methodCounts].map(([method, count]) => ({ method, count })),
      rounds: summaries.slice((filters.page - 1) * pageSize, filters.page * pageSize),
      reputation: reputation.map((group) => ({ communityId: group.communityId, community: communities.find((c) => c.id === group.communityId)!.name, slug: communities.find((c) => c.id === group.communityId)!.slug, targetType: group.targetType, dimension: group.dimension, count: Number(group.count), average: Number(group.total) / Number(group.count) })),
      chain,
    };
  }, { isolationLevel: "RepeatableRead", timeout: 20000 });
}
export type ReleaseAnalyticsReport = Awaited<ReturnType<typeof getReleaseAnalytics>>;

export function releaseAnalyticsCsv(report: ReleaseAnalyticsReport) {
  if (report.filters.dataset === "funds")
    return csvDocument(["Network", "Asset ID", "Currency", "Decimals", "Round count", "Received units", "Held units", "Reserved units", "Paid units", "Refunded units", "Source"], report.assets.map((asset) => [asset.network, asset.assetId, asset.currency, asset.decimals, asset.rounds, asset.received, asset.held, asset.reserved, asset.paid, asset.refunded, "/analytics/system"]));
  if (report.filters.dataset === "reputation")
    return csvDocument(["Community", "Target type", "Dimension", "Visible review count", "Average score", "Source"], report.reputation.map((row) => [row.community, row.targetType, row.dimension, row.count, row.average, `/communities/${row.slug}/reputation`]));
  if (report.filters.dataset === "chain")
    return csvDocument(["Record kind", "Network", "Asset ID", "Decimals", "Received units", "Held units", "Reserved units", "Paid units", "Refunded units", "Operating reserve units", "Historical operating top-ups units", "Reserve observed UTC", "Unknown operations", "Transaction hash", "Status", "Observed UTC", "Source"], [
      ...report.chain.groups.map((asset) => ["CURRENT_CUSTODY", asset.network, asset.assetId, asset.decimals, asset.received, asset.held, asset.reserved, asset.paid, asset.refunded, asset.operatingReserve ?? "Not yet observed", asset.operatingTopups, asset.reserveObservedAt ?? "", asset.unknown, "", "", "", "/analytics/system"]),
      ...report.chain.observations.map((observation) => ["FINAL_OBSERVATION", observation.network, observation.assetId, observation.decimals, "", "", "", "", "", "", "", "", "", observation.transactionHash, observation.status, observation.observedAt, observation.roundId ? `/communities/${observation.communitySlug}/rounds/${observation.roundId}` : `/communities/${observation.communitySlug}/treasury`]),
    ]);
  // Deliberately export the same bounded page and redacted fields users can inspect on screen.
  return csvDocument(["Round ID", "Community", "Title", "Created UTC", "Status", "Rules version", "Method", "Selection weight", "Allocation", "Ballots sealed", "Published participation power", "Published eligible power", "Published quorum power", "Veto", "Asset", "Network", "Decimals", "Received units", "Held units", "Reserved units", "Paid units", "Refunded units", "Source"], report.rounds.map((round) => [round.id, round.community, round.title, round.createdAt, round.status, String(round.rulesVersion), round.method, round.selectionWeight, round.allocationPolicy, String(round.sealed), round.participation ?? "", round.eligiblePower ?? "", round.quorumRequired ?? "", round.veto, round.money?.assetId ?? "", round.money?.network ?? "", String(round.money?.decimals ?? ""), round.money?.received ?? "", round.money?.held ?? "", round.money?.reserved ?? "", round.money?.paid ?? "", round.money?.refunded ?? "", round.href]));
}
