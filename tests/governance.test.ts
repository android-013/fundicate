import { describe, it, expect } from "vitest";
import { calculateOutcome } from "../src/lib/governance";
import { money, proposalSchema } from "../src/lib/validation";
import { moneyFormat } from "../src/lib/format";
const ballots = (yes: number, no: number, abstain = 0) => [
  ...Array.from({ length: yes }, () => ({ choice: "YES" as const })),
  ...Array.from({ length: no }, () => ({ choice: "NO" as const })),
  ...Array.from({ length: abstain }, () => ({ choice: "ABSTAIN" as const })),
];
describe("integer-safe governance", () => {
  it("requires strictly more yes than no", () => {
    expect(calculateOutcome(ballots(2, 2), 4, 5000, 5001).approved).toBe(false);
    expect(calculateOutcome(ballots(3, 2), 5, 5000, 5001).approved).toBe(true);
  });
  it("rounds quorum upward", () => {
    expect(calculateOutcome(ballots(1, 0), 3, 5000, 5001).quorumRequired).toBe(
      2,
    );
    expect(calculateOutcome(ballots(1, 0), 3, 5000, 5001).approved).toBe(false);
  });
  it("counts abstention toward quorum but excludes it from approval", () => {
    const r = calculateOutcome(ballots(1, 0, 2), 5, 5000, 5001);
    expect(r.approved).toBe(true);
    expect(r.valid).toBe(1);
    expect(r.participation).toBe(3);
  });
  it("does not approve an all-abstention ballot", () =>
    expect(calculateOutcome(ballots(0, 0, 3), 3, 5000, 5001).approved).toBe(
      false,
    ));
  it("requires exactly at least two-thirds for removal", () => {
    expect(calculateOutcome(ballots(2, 1), 3, 5000, 6667, true).approved).toBe(
      true,
    );
    expect(calculateOutcome(ballots(3, 2), 5, 5000, 6667, true).approved).toBe(
      false,
    );
    expect(calculateOutcome(ballots(4, 2), 6, 5000, 6667, true).approved).toBe(
      true,
    );
  });
  it("uses the configured approval threshold", () => {
    expect(calculateOutcome(ballots(2, 1), 3, 5000, 7500).approved).toBe(false);
    expect(calculateOutcome(ballots(3, 1), 4, 5000, 7500).approved).toBe(true);
  });
  it("rejects invalid ballots and impossible population sizes", () => {
    expect(() =>
      calculateOutcome([{ choice: "INVALID" } as never], 1, 5000, 5001),
    ).toThrow();
    expect(() => calculateOutcome(ballots(2, 0), 1, 5000, 5001)).toThrow();
    expect(() => calculateOutcome([], 0, 0, 5001)).toThrow();
  });
  it("never approves an empty electorate", () =>
    expect(calculateOutcome([], 0, 5000, 5001).approved).toBe(false));
});
describe("monetary validation", () => {
  it("displays large balances without losing cents", () =>
    expect(moneyFormat(9007199254740993n)).toBe("$90,071,992,547,409.93"));
  it("preserves the sign on a negative sub-unit amount", () =>
    expect(moneyFormat(-29n)).toBe("-$0.29"));
  it("converts decimal strings to exact integer minor units", () => {
    expect(money.parse("0.29")).toBe(29n);
    expect(money.parse("1234.5")).toBe(123450n);
  });
  it("rejects floating precision, negative amounts and scientific notation", () => {
    for (const v of ["1.001", "-1", "1e5", "NaN", "100000000"])
      expect(money.safeParse(v).success).toBe(false);
  });
  it("rejects unsafe supporting URL schemes", () => {
    expect(
      proposalSchema.shape.supportingUrl.safeParse("javascript:alert(1)")
        .success,
    ).toBe(false);
  });
});
