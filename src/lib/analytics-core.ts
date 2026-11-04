import { z } from "zod";

export const analyticsSections = [
  "overview",
  "treasury",
  "governance",
  "network",
  "personal",
  "records",
] as const;
export type AnalyticsSection = (typeof analyticsSections)[number];
export const datasets = [
  "transactions",
  "proposals",
  "votes",
  "members",
  "activity",
] as const;
export type Dataset = (typeof datasets)[number];
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00.000Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid calendar date.");
export const filtersSchema = z
  .object({
    community: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60)
      .or(z.literal("all"))
      .default("all"),
    range: z.enum(["30d", "90d", "365d", "all", "custom"]).default("30d"),
    from: daySchema.optional(),
    to: daySchema.optional(),
    currency: z.enum(["all", "USD", "BDT", "EUR"]).default("all"),
    dataset: z.enum(datasets).default("transactions"),
    cohort: z.enum(["events", "decisions"]).default("events"),
    q: z.string().trim().max(100).default(""),
    status: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z_]*$/)
      .max(40)
      .default(""),
    type: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z_]*$/)
      .max(40)
      .default(""),
    person: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .superRefine((v, ctx) => {
    if (v.range === "custom" && (!v.from || !v.to))
      ctx.addIssue({
        code: "custom",
        message: "Choose both a start and an end date.",
        path: ["from"],
      });
    if (v.range === "custom" && v.from && v.to && v.from > v.to)
      ctx.addIssue({
        code: "custom",
        message: "The start date must be before the end date.",
        path: ["from"],
      });
  });
export type AnalyticsFilters = z.infer<typeof filtersSchema>;
export type SearchValues = Record<string, string | string[] | undefined>;
export function parseFilters(raw: SearchValues): AnalyticsFilters {
  const duplicate = Object.entries(raw).find(([, value]) =>
    Array.isArray(value),
  );
  if (duplicate)
    throw new z.ZodError([
      {
        code: "custom",
        path: [duplicate[0]],
        message: "Use each filter only once.",
      },
    ]);
  const values = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""),
  );
  return filtersSchema.parse(values);
}
export function analyticsHref(
  section: AnalyticsSection,
  filters: Partial<AnalyticsFilters> = {},
  changes: Partial<AnalyticsFilters> = {},
) {
  const values = { ...filters, ...changes };
  const params = new URLSearchParams();
  for (const key of [
    "community",
    "range",
    "from",
    "to",
    "currency",
    "dataset",
    "cohort",
    "q",
    "status",
    "type",
    "person",
    "page",
  ] as const) {
    const v = values[key];
    if (v !== undefined && v !== "" && !(key === "page" && v === 1))
      params.set(key, String(v));
  }
  return `/analytics${section === "overview" ? "" : "/" + section}${params.size ? "?" + params : ""}`;
}
export function periodFor(filters: AnalyticsFilters, now = new Date()) {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end =
    filters.range === "custom"
      ? new Date(new Date(filters.to! + "T00:00:00Z").getTime() + 86400000)
      : new Date(now);
  const start =
    filters.range === "all"
      ? null
      : filters.range === "custom"
        ? new Date(filters.from! + "T00:00:00Z")
        : new Date(
            today.getTime() -
              (Number(filters.range.replace("d", "")) - 1) * 86400000,
          );
  if (start && start > end) throw new Error("Invalid date interval");
  return {
    start,
    end,
    label:
      filters.range === "all"
        ? "All recorded history"
        : `${start!.toISOString().slice(0, 10)} → ${new Date(end.getTime() - (filters.range === "custom" ? 1 : 0)).toISOString().slice(0, 10)} UTC`,
  };
}
export function percentage(numerator: number, denominator: number) {
  return denominator
    ? Math.round((numerator * 10000) / denominator) / 100
    : null;
}
export function medianMinor(values: bigint[]) {
  if (!values.length) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle] + 1n) / 2n;
}
export function averageMinor(total: bigint, count: number) {
  return count ? (total + BigInt(Math.floor(count / 2))) / BigInt(count) : 0n;
}
export function changePercent(current: bigint, previous: bigint) {
  if (previous === 0n) return null;
  return (
    Number(
      ((current - previous) * 10000n) / (previous < 0n ? -previous : previous),
    ) / 100
  );
}
export function decimalMinor(amount: bigint) {
  const abs = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csvDocument(headers: string[], rows: unknown[][]) {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
export type TrendPoint = {
  date: string;
  label: string;
  incoming: bigint;
  outgoing: bigint;
  balance: bigint;
  contributions: number;
  votes: number;
  members: number;
};
export function buildTrend({
  start,
  end,
  transactions,
  votes,
  members,
  opening = 0n,
}: {
  start: Date | null;
  end: Date;
  transactions: { createdAt: Date; delta: bigint }[];
  votes: { createdAt: Date }[];
  members: { joinedAt: Date }[];
  opening?: bigint;
}): TrendPoint[] {
  const timestamps = [
    ...transactions.map((t) => t.createdAt.getTime()),
    ...votes.map((v) => v.createdAt.getTime()),
    ...members.map((m) => m.joinedAt.getTime()),
  ];
  const first =
    start ??
    new Date(
      timestamps.length
        ? timestamps.reduce(
            (minimum, value) => Math.min(minimum, value),
            timestamps[0],
          )
        : end.getTime() - 29 * 86400000,
    );
  const totalDays = Math.max(
    1,
    Math.ceil((end.getTime() - first.getTime()) / 86400000),
  );
  const monthly = totalDays > 120;
  const key = (d: Date) => d.toISOString().slice(0, monthly ? 7 : 10);
  const map = new Map<string, TrendPoint>();
  const cursor = new Date(
    Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      monthly ? 1 : first.getUTCDate(),
    ),
  );
  while (cursor < end && map.size < 1200) {
    const date = key(cursor);
    map.set(date, {
      date,
      label: monthly
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            year: "2-digit",
            timeZone: "UTC",
          }).format(cursor)
        : new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(cursor),
      incoming: 0n,
      outgoing: 0n,
      balance: 0n,
      contributions: 0,
      votes: 0,
      members: 0,
    });
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const tx of transactions) {
    const p = map.get(key(tx.createdAt));
    if (p) {
      if (tx.delta > 0n) {
        p.incoming += tx.delta;
        p.contributions++;
      } else p.outgoing -= tx.delta;
    }
  }
  for (const vote of votes) {
    const p = map.get(key(vote.createdAt));
    if (p) p.votes++;
  }
  for (const member of members) {
    const p = map.get(key(member.joinedAt));
    if (p) p.members++;
  }
  let balance = opening;
  return [...map.values()].map((p) => {
    balance += p.incoming - p.outgoing;
    return { ...p, balance };
  });
}
export const dashboardWidgets = [
  "treasury",
  "votes",
  "communities",
  "network",
  "activity",
  "contributions",
] as const;
export const preferenceSchema = z.object({
  widgets: z
    .array(z.enum(dashboardWidgets))
    .min(1)
    .max(6)
    .refine(
      (v) => new Set(v).size === v.length,
      "Choose each widget only once.",
    ),
});
export const savedViewSchema = z.object({
  name: z.string().trim().min(2).max(60),
  section: z.enum(analyticsSections).default("overview"),
  filters: filtersSchema,
});
