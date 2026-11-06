import { describe, expect, it } from "vitest";
import {
  allocateV3,
  v3FundsConfigSchema,
  weightedScreeningOutcome,
  weightedSelectionOutcome,
} from "../src/lib/elections-core";

const config = {
  fundingTarget: "1.00",
  minimumContribution: "0.01",
  maximumContribution: "100.00",
  collectionClosesAt: "2026-12-01T00:00:00Z",
  expiresAt: "2026-12-10T00:00:00Z",
};
const candidates = [
  {
    schemeId: "a",
    request: 1000n,
    recipient: "Recipient A",
    beneficiaryId: "owner-a",
    support: 60n,
  },
  {
    schemeId: "b",
    request: 1000n,
    recipient: "Recipient B",
    beneficiaryId: "owner-b",
    support: 30n,
  },
  {
    schemeId: "c",
    request: 1000n,
    recipient: "Recipient C",
    beneficiaryId: "owner-c",
    support: 10n,
  },
];
describe("versioned weighted FPTP and allocation", () => {
  it("validates independent stage weights and only supported V3 options", () => {
    expect(
      v3FundsConfigSchema.parse({
        ...config,
        screeningWeight: "CONTRIBUTION",
        selectionWeight: "EQUAL",
        vetoWeight: "CONTRIBUTION",
        vetoEnabled: true,
      }),
    ).toMatchObject({
      fundingTarget: 100n,
      screeningWeight: "CONTRIBUTION",
      selectionWeight: "EQUAL",
      vetoWeight: "CONTRIBUTION",
    });
    for (const unsupported of [
      { selectionMethod: "GLICKO2" },
      { votingWeight: "EQUAL" },
      { currency: "NEAR" },
      { screeningWeight: "CAPPED" },
      { vetoEnabled: "true" },
      { maximumContribution: "0" },
    ])
      expect(
        v3FundsConfigSchema.safeParse({ ...config, ...unsupported }).success,
      ).toBe(false);
  });
  it("requires positive ranked shares totaling exactly 100 percent", () => {
    expect(
      v3FundsConfigSchema.safeParse({
        ...config,
        allocationPolicy: "RANKED_CUTS",
        rankedSharesBps: [6000, 3000, 1000],
      }).success,
    ).toBe(true);
    for (const rankedSharesBps of [
      [],
      [6000, 3000],
      [10001],
      [0, 10000],
      [5000.5, 4999.5],
    ])
      expect(
        v3FundsConfigSchema.safeParse({
          ...config,
          allocationPolicy: "RANKED_CUTS",
          rankedSharesBps,
        }).success,
      ).toBe(false);
    expect(
      v3FundsConfigSchema.safeParse({
        ...config,
        allocationPolicy: "WINNER_ALL",
        rankedSharesBps: [10000],
      }).success,
    ).toBe(false);
  });
  it("counts abstention power in quorum, but not strict YES/NO approval", () => {
    const result = weightedScreeningOutcome(
      [
        { choice: "YES", power: 2n },
        { choice: "NO", power: 1n },
        { choice: "ABSTAIN", power: 97n },
      ],
      100n,
      10000,
    );
    expect(result).toMatchObject({
      yes: 2n,
      no: 1n,
      abstain: 97n,
      participation: 100n,
      quorumRequired: 100n,
      approved: true,
    });
    expect(
      weightedScreeningOutcome(
        [
          { choice: "YES", power: 50n },
          { choice: "NO", power: 50n },
        ],
        100n,
        1,
      ).approved,
    ).toBe(false);
  });
  it("rounds quorum upward without floating point and rejects impossible power", () => {
    expect(
      weightedScreeningOutcome([{ choice: "YES", power: 1n }], 3n, 3334)
        .quorumRequired,
    ).toBe(2n);
    expect(
      weightedScreeningOutcome([{ choice: "YES", power: 1n }], 3n, 3334)
        .approved,
    ).toBe(false);
    expect(() =>
      weightedScreeningOutcome([{ choice: "YES", power: 4n }], 3n, 5000),
    ).toThrow();
    expect(() =>
      weightedScreeningOutcome([{ choice: "YES", power: 0n }], 3n, 5000),
    ).toThrow();
    expect(() =>
      weightedScreeningOutcome([{ choice: "MAYBE", power: 1n }], 3n, 5000),
    ).toThrow();
    expect(weightedScreeningOutcome([], 0n, 5000).approved).toBe(false);
  });
  it("selects by paid power rather than head count and preserves ties", () => {
    const result = weightedSelectionOutcome(
      ["a", "b"],
      [
        { schemeId: "a", power: 90n },
        { schemeId: "b", power: 5n },
        { schemeId: "b", power: 5n },
      ],
      100n,
      10000,
    );
    expect(result.winnerSchemeId).toBe("a");
    expect(result.counts).toEqual({ a: 90n, b: 10n });
    expect(
      weightedSelectionOutcome(
        ["a", "b"],
        [
          { schemeId: "a", power: 1n },
          { schemeId: "b", power: 1n },
        ],
        2n,
        5000,
      ).outcome,
    ).toBe("TIED");
    expect(weightedSelectionOutcome(["a"], [], 1n, 5000).outcome).toBe(
      "NO_QUORUM",
    );
    expect(() =>
      weightedSelectionOutcome(["a"], [{ schemeId: "b", power: 1n }], 1n, 5000),
    ).toThrow();
    expect(() => weightedSelectionOutcome(["a", "a"], [], 1n, 5000)).toThrow();
  });
  it("winner-all caps its sole winner and refuses arbitrary top-tie allocation", () => {
    const result = allocateV3(
      100n,
      candidates.map((candidate) =>
        candidate.schemeId === "a" ? { ...candidate, request: 40n } : candidate,
      ),
      "WINNER_ALL",
    );
    expect(result.payouts.map((payout) => payout.amount)).toEqual([40n]);
    expect(result.refundTotal).toBe(60n);
    expect(
      allocateV3(
        100n,
        candidates.map((candidate) => ({ ...candidate, support: 10n })),
        "WINNER_ALL",
      ),
    ).toEqual({ payouts: [], refundTotal: 100n });
  });
  it("proportional shares use exact deterministic largest remainders before caps", () => {
    const tied = candidates.map((candidate) => ({ ...candidate, support: 1n }));
    const result = allocateV3(101n, tied, "PROPORTIONAL");
    expect(result.payouts.map((payout) => payout.amount)).toEqual([
      34n,
      34n,
      33n,
    ]);
    expect(result).toEqual(
      allocateV3(101n, [...tied].reverse(), "PROPORTIONAL"),
    );
    const capped = allocateV3(
      100n,
      candidates.map((candidate) =>
        candidate.schemeId === "a" ? { ...candidate, request: 1n } : candidate,
      ),
      "PROPORTIONAL",
    );
    expect(capped.payouts.map((payout) => payout.amount)).toEqual([
      1n,
      30n,
      10n,
    ]);
    expect(capped.refundTotal).toBe(59n);
  });
  it("does not redistribute unpayable or missing ranked entitlements", () => {
    const result = allocateV3(
      101n,
      candidates.slice(0, 2),
      "RANKED_CUTS",
      [6000, 3000, 1000],
    );
    expect(result.payouts.map((payout) => payout.amount)).toEqual([61n, 30n]);
    expect(result.refundTotal).toBe(10n);
    const invalid = allocateV3(
      100n,
      candidates.map((candidate) =>
        candidate.schemeId === "a"
          ? { ...candidate, recipient: "Invalid\u007frecipient" }
          : candidate,
      ),
      "PROPORTIONAL",
    );
    expect(invalid.payouts.map((payout) => payout.amount)).toEqual([30n, 10n]);
    expect(invalid.refundTotal).toBe(60n);
  });
  it("refunds every occupied tied rank without shifting the remaining shares", () => {
    const result = allocateV3(
      100n,
      candidates.map((candidate) =>
        candidate.schemeId !== "a" ? { ...candidate, support: 20n } : candidate,
      ),
      "RANKED_CUTS",
      [6000, 3000, 1000],
    );
    expect(
      result.payouts.map((payout) => [payout.schemeId, payout.amount]),
    ).toEqual([["a", 60n]]);
    expect(result.refundTotal).toBe(40n);
    const top = allocateV3(
      100n,
      candidates.map((candidate) =>
        candidate.schemeId !== "c" ? { ...candidate, support: 60n } : candidate,
      ),
      "RANKED_CUTS",
      [6000, 3000, 1000],
    );
    expect(
      top.payouts.map((payout) => [payout.schemeId, payout.amount]),
    ).toEqual([["c", 10n]]);
    expect(top.refundTotal).toBe(90n);
  });
  it("conserves above Number.MAX_SAFE_INTEGER in every allocation mode", () => {
    const large = 900719925474099312345n;
    for (const policy of [
      "WINNER_ALL",
      "PROPORTIONAL",
      "RANKED_CUTS",
    ] as const) {
      const result = allocateV3(
        large,
        candidates.map((candidate) => ({ ...candidate, request: large })),
        policy,
        policy === "RANKED_CUTS" ? [6000, 3000, 1000] : [],
      );
      expect(
        result.refundTotal +
          result.payouts.reduce((sum, payout) => sum + payout.amount, 0n),
      ).toBe(large);
    }
    expect(() => allocateV3(-1n, candidates, "WINNER_ALL")).toThrow();
    expect(() =>
      allocateV3(1n, [candidates[0], candidates[0]], "WINNER_ALL"),
    ).toThrow();
    expect(() => allocateV3(1n, candidates, "RANKED_CUTS", [50])).toThrow();
  });
});
