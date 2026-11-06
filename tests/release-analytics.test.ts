import { describe, expect, it } from "vitest";
import { groupAssetTotals, parseSystemFilters, sealedResultSummary } from "../src/lib/release-analytics";

const now = new Date("2027-01-01T12:00:00.000Z");
const money = { network: "local-simulation", assetId: "fiat:BDT", currency: "BDT", decimals: 2, received: 10000n, held: 2000n, reserved: 3000n, paid: 4000n, refunded: 1000n };
const result = { participation: "11", eligible: "20", quorumRequired: "10", counts: { hiddenCandidate: "11" }, ballots: [{ userId: "private-voter", choice: "secret" }] };

describe("system analytics integrity boundaries", () => {
  it("groups complete exact principal without currency or network conversion", () => {
    const values = groupAssetTotals([money, money, { ...money, currency: "USD", assetId: "fiat:USD" }, { ...money, network: "near-testnet", assetId: "near:testnet:NEAR", currency: "NEAR", decimals: 24 }]);
    expect(values).toHaveLength(3);
    expect(values.find((row) => row.currency === "BDT")?.received).toBe("20000");
    expect(values.find((row) => row.currency === "NEAR")?.decimals).toBe(24);
  });
  it("refuses a principal deficit or negative liability instead of reporting a fake reconciliation", () => {
    expect(() => groupAssetTotals([{ ...money, received: 10001n }])).toThrow();
    expect(() => groupAssetTotals([{ ...money, held: -1n, reserved: 5001n }])).toThrow();
  });
  it("preserves exact integers beyond floating point precision", () => {
    const huge = 999999999999999999999999999999n;
    expect(groupAssetTotals([{ ...money, received: huge, held: huge, reserved: 0n, paid: 0n, refunded: 0n }])[0].received).toBe(huge.toString());
  });
  it("never serializes partial participation or vote fields from an open selection", () => {
    const safe = sealedResultSummary({ status: "SELECTION", result, vetoClosesAt: null, vetoFinalizedAt: null, rejected: false }, now);
    expect(safe.sealed).toBe(true);
    expect(safe.participation).toBeNull();
    expect(JSON.stringify(safe)).not.toMatch(/private-voter|secret|hiddenCandidate|counts|ballots/);
  });
  it("keeps the complete context sealed until the last instant of an enabled veto", () => {
    const input = { status: "DECIDED", result, vetoClosesAt: now, vetoFinalizedAt: null, rejected: false };
    expect(sealedResultSummary(input, new Date(now.getTime() - 1)).sealed).toBe(true);
    expect(sealedResultSummary(input, now).sealed).toBe(false);
    expect(sealedResultSummary(input, now).veto).toBe("AWAITING_FINALIZATION");
  });
  it("exposes only the whitelisted published denominator fields after context closure", () => {
    const safe = sealedResultSummary({ status: "DECIDED", result, vetoClosesAt: null, vetoFinalizedAt: now, rejected: false }, now);
    expect(safe.participation).toBe("11");
    expect(safe.eligiblePower).toBe("20");
    expect(safe.quorumRequired).toBe("10");
    expect(JSON.stringify(safe)).not.toMatch(/private-voter|secret|hiddenCandidate|counts|ballots/);
  });
  it("does not manufacture unrecorded historic denominators", () => {
    expect(sealedResultSummary({ status: "DECIDED", result: {}, vetoClosesAt: null, vetoFinalizedAt: null, rejected: false }, now).participation).toBeNull();
  });
  it("rejects repeated, malformed and reversed-date filters", () => {
    expect(() => parseSystemFilters({ community: ["all", "other"] })).toThrow();
    expect(() => parseSystemFilters({ from: "2027-02-30" })).toThrow();
    expect(() => parseSystemFilters({ from: "2027-02-02", to: "2027-02-01" })).toThrow();
    expect(() => parseSystemFilters({ q: "private-voter" })).toThrow();
  });
});
