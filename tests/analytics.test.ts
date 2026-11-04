import { describe, it, expect } from "vitest";
import {
  analyticsHref,
  averageMinor,
  buildTrend,
  changePercent,
  csvCell,
  csvDocument,
  decimalMinor,
  medianMinor,
  parseFilters,
  periodFor,
  preferenceSchema,
} from "../src/lib/analytics-core";
describe("analytics boundaries and exact financial summaries", () => {
  it("uses inclusive custom calendar days with an exclusive UTC upper bound", () => {
    const p = periodFor(
      parseFilters({ range: "custom", from: "2026-10-01", to: "2026-10-31" }),
      new Date("2026-11-03T11:00:00Z"),
    );
    expect(p.start?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("rejects impossible dates, missing custom dates and reversed windows", () => {
    for (const v of [
      { range: "custom", from: "2026-02-30", to: "2026-03-01" },
      { range: "custom", from: "2026-10-01" },
      { range: "custom", from: "2026-10-31", to: "2026-10-01" },
    ])
      expect(() => parseFilters(v)).toThrow();
  });
  it("rejects duplicate query parameters, invalid datasets and pagination", () => {
    expect(() => parseFilters({ community: ["campus", "other"] })).toThrow();
    expect(() => parseFilters({ q: ["first", "second"] })).toThrow();
    expect(() => parseFilters({ dataset: "passwords" })).toThrow();
    expect(() => parseFilters({ page: "-1" })).toThrow();
  });
  it("retains filter provenance and removes a cleared person filter", () => {
    const f = parseFilters({
      range: "all",
      dataset: "votes",
      cohort: "decisions",
      person: "11111111-1111-4111-a111-111111111111",
    });
    const url = analyticsHref("records", f, { person: undefined });
    expect(url).toContain("cohort=decisions");
    expect(url).not.toContain("person=");
  });
  it("normalizes human-entered record types and statuses", () => {
    const f = parseFilters({ type: "contribution", status: " confirmed " });
    expect(f.type).toBe("CONTRIBUTION");
    expect(f.status).toBe("CONFIRMED");
  });
  it("calculates medians and averages with bigint precision and half-up rounding", () => {
    expect(medianMinor([1n, 2n])).toBe(2n);
    expect(medianMinor([9007199254740993n, 9007199254740995n])).toBe(
      9007199254740994n,
    );
    expect(averageMinor(5n, 2)).toBe(3n);
    expect(averageMinor(0n, 0)).toBe(0n);
  });
  it("never invents a percentage change from an empty baseline", () => {
    expect(changePercent(10000n, 0n)).toBeNull();
    expect(changePercent(15000n, 10000n)).toBe(50);
    expect(changePercent(5000n, 10000n)).toBe(-50);
  });
  it("reconciles every trend bucket to the opening balance without invented activity", () => {
    const points = buildTrend({
      start: new Date("2026-10-01Z"),
      end: new Date("2026-10-04Z"),
      opening: 10000n,
      transactions: [
        { createdAt: new Date("2026-10-02T12:00:00Z"), delta: 2500n },
        { createdAt: new Date("2026-10-03T12:00:00Z"), delta: -1200n },
      ],
      votes: [{ createdAt: new Date("2026-10-02T13:00:00Z") }],
      members: [],
    });
    expect(points.map((p) => p.balance)).toEqual([10000n, 12500n, 11300n]);
    expect(points[0].incoming).toBe(0n);
    expect(points[1].votes).toBe(1);
    expect(points[2].outgoing).toBe(1200n);
  });
  it("uses monthly buckets for longer histories", () => {
    const p = buildTrend({
      start: new Date("2026-01-01Z"),
      end: new Date("2026-07-01Z"),
      transactions: [],
      votes: [],
      members: [],
    });
    expect(p.length).toBe(6);
    expect(p[0].date).toBe("2026-01");
    expect(p.every((v) => v.incoming === 0n)).toBe(true);
  });
  it("renders exact CSV monetary units above the safe Number range", () =>
    expect(decimalMinor(9007199254740993n)).toBe("90071992547409.93"));
  it("escapes spreadsheet formulas, quotes, commas and newlines", () => {
    expect(csvCell(' =HYPERLINK("bad")')).toBe('"\' =HYPERLINK(""bad"")"');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvDocument(["Name"], [["+SUM(1)"]])).toContain('"\'+SUM(1)"');
  });
  it("only accepts unique known dashboard widgets", () => {
    expect(
      preferenceSchema.safeParse({ widgets: ["votes", "votes"] }).success,
    ).toBe(false);
    expect(
      preferenceSchema.safeParse({ widgets: ["wallet-secrets"] }).success,
    ).toBe(false);
    expect(preferenceSchema.safeParse({ widgets: [] }).success).toBe(false);
  });
});
