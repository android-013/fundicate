import { describe, expect, it } from "vitest";
import {
  fundsConfigSchema,
  proportionalRefunds,
  roundContributionSchema,
  winnerAllPlan,
} from "../src/lib/funds-core";

const config = {
  fundingTarget: "100.00",
  minimumContribution: "1.00",
  maximumContribution: "1000.00",
  collectionClosesAt: "2026-12-01T00:00:00Z",
  expiresAt: "2026-12-10T00:00:00Z",
};
const shares = [
  { sourceAccountId: "c", userId: "u3", amount: 100n },
  { sourceAccountId: "a", userId: "u1", amount: 100n },
  { sourceAccountId: "b", userId: "u2", amount: 100n },
];
describe("funded V2 rules and exact allocation", () => {
  it("locks the only supported rule profile and exact minor units", () => {
    expect(fundsConfigSchema.parse(config)).toMatchObject({
      fundingTarget: 10000n,
      minimumContribution: 100n,
      maximumContribution: 100000n,
      vetoEnabled: false,
      selectionMethod: "FPTP",
      votingWeight: "EQUAL",
      allocationPolicy: "WINNER_ALL",
    });
  });
  it("rejects zero limits, inverted caps, malformed dates and unsupported future settings", () => {
    for (const extra of [
      { fundingTarget: "0" },
      { minimumContribution: "0" },
      { maximumContribution: "0.50" },
      { collectionClosesAt: "tomorrow" },
      { expiresAt: "tomorrow" },
      { vetoEnabled: true },
      { selectionMethod: "GLICKO2" },
      { votingWeight: "CONTRIBUTION" },
      { allocationPolicy: "PROPORTIONAL" },
      { assetId: "NEAR" },
      { network: "mainnet" },
      { decimals: 24 },
    ])
      expect(fundsConfigSchema.safeParse({ ...config, ...extra }).success).toBe(
        false,
      );
  });
  it("caps a winning request and refunds unused principal without fees", () => {
    const result = winnerAllPlan(300n, shares, 125n);
    expect(result.payout).toBe(125n);
    expect(result.refunded).toBe(175n);
    expect(
      result.refunds.map((share) => [share.sourceAccountId, share.refund]),
    ).toEqual([
      ["a", 59n],
      ["b", 58n],
      ["c", 58n],
    ]);
    expect(
      result.payout +
        result.refunds.reduce((sum, share) => sum + share.refund, 0n),
    ).toBe(300n);
  });
  it("uses a stable original-source tie break independent of contribution query ordering", () => {
    expect(proportionalRefunds(2n, shares)).toEqual(
      proportionalRefunds(2n, [...shares].reverse()),
    );
    expect(
      proportionalRefunds(2n, shares).map((share) => share.refund),
    ).toEqual([1n, 1n, 0n]);
  });
  it("uses largest remainders rather than assigning every rounding unit to the first donor", () => {
    const result = proportionalRefunds(2n, [
      { sourceAccountId: "a", userId: "u1", amount: 1n },
      { sourceAccountId: "b", userId: "u2", amount: 3n },
      { sourceAccountId: "c", userId: "u3", amount: 6n },
    ]);
    expect(result.map((share) => share.refund)).toEqual([0n, 1n, 1n]);
  });
  it("preserves exact amounts far above Number.MAX_SAFE_INTEGER", () => {
    const large = 900719925474099312345n;
    const result = winnerAllPlan(
      large * 3n,
      shares.map((share) => ({ ...share, amount: large })),
      large + 1n,
    );
    expect(result.payout).toBe(large + 1n);
    expect(
      result.refunds.reduce((sum, share) => sum + share.refund, 0n) +
        result.payout,
    ).toBe(large * 3n);
    expect(result.refunds.map((share) => share.refund)).toEqual([
      (large * 2n - 1n) / 3n + 1n,
      (large * 2n - 1n) / 3n + 1n,
      (large * 2n - 1n) / 3n,
    ]);
  });
  it("refunds original received ownership completely when no winner can be paid", () => {
    const result = winnerAllPlan(300n, shares, null);
    expect(result.payout).toBe(0n);
    expect(result.refunds.every((share) => share.refund === share.amount)).toBe(
      true,
    );
    expect(winnerAllPlan(0n, [], null)).toEqual({
      payout: 0n,
      refunded: 0n,
      refunds: [],
    });
  });
  it("handles requests at and above the pool without creating surplus or refunds", () => {
    for (const requested of [300n, 400n]) {
      const result = winnerAllPlan(300n, shares, requested);
      expect(result.payout).toBe(300n);
      expect(result.refunds.every((share) => share.refund === 0n)).toBe(true);
    }
  });
  it("rejects negative money, over-refunds, mismatched pools and ambiguous ownership", () => {
    expect(() => proportionalRefunds(-1n, shares)).toThrow();
    expect(() => proportionalRefunds(301n, shares)).toThrow();
    expect(() => proportionalRefunds(1n, [])).toThrow();
    expect(() => proportionalRefunds(1n, [shares[0], shares[0]])).toThrow();
    expect(() =>
      proportionalRefunds(0n, [{ ...shares[0], amount: 0n }]),
    ).toThrow();
    expect(() => winnerAllPlan(299n, shares, 100n)).toThrow();
    expect(() => winnerAllPlan(300n, shares, 0n)).toThrow();
  });
  it("forbids contribution destination and clock injection in HTTP input", () => {
    const contribution = {
      communityId: "11111111-1111-4111-a111-111111111111",
      roundId: "22222222-2222-4222-a222-222222222222",
      idempotencyKey: "33333333-3333-4333-a333-333333333333",
      amount: "1.01",
    };
    expect(roundContributionSchema.parse(contribution).amount).toBe(101n);
    for (const extra of [
      { recipient: "other" },
      { userId: "other" },
      { now: config.collectionClosesAt },
      { amount: "0" },
    ])
      expect(
        roundContributionSchema.safeParse({ ...contribution, ...extra })
          .success,
      ).toBe(false);
  });
});
