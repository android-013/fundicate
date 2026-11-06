import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  METHODS,
  methodPairs,
  tallyMethod,
  validateMethodBallot,
  glicko2,
  eloPeriod,
  v4FundsConfigSchema,
  type Method,
  type MethodBallot,
} from "../src/lib/methods-core";
import { allocateV3, type AllocationPolicy } from "../src/lib/elections-core";

const ids = ["a", "b", "c"];
function ballot(method: Method, ranking: string[]): MethodBallot {
  if (method === "FPTP") return { schemeId: ranking[0] };
  if (method === "IRV" || method === "STV") return { ranking };
  return {
    pairs: methodPairs(ids).map((p) => ({
      ...p,
      choice: ranking.indexOf(p.a) < ranking.indexOf(p.b) ? "A" : "B",
    })),
  };
}
describe("published V4 methods", () => {
  it("preserves genuine top ties and separates tied STV money from elected seats", () => {
    for (const method of METHODS) {
      const config = {
        selectionMethod: method,
        selectionSeats: method === "STV" ? 2 : 1,
      };
      const result = tallyMethod(
        config,
        ids,
        [
          { userId: "left", power: 1n, ballot: ballot(method, ids) },
          {
            userId: "right",
            power: 1n,
            ballot: ballot(method, [...ids].reverse()),
          },
        ],
        2n,
        10000,
      );
      if (method === "STV") expect(result.elected).toHaveLength(2);
      expect(result.outcome).toBe("TIED");
      expect(result.winnerSchemeId).toBeNull();
      const plan = allocateV3(
        101n,
        result.ranking.map((r) => ({
          schemeId: r.schemeId,
          support: r.support,
          request: 1000n,
          recipient: `recipient ${r.schemeId}`,
          beneficiaryId: `owner ${r.schemeId}`,
        })),
        "WINNER_ALL",
      );
      expect(plan.payouts).toEqual([]);
      expect(plan.refundTotal).toBe(101n);
    }
  });
  it("serves the exact frozen specification before voting", () => {
    expect(readFileSync("public/rules/fundicate-methods-v1.txt", "utf8")).toBe(
      readFileSync("docs/algorithms/part-04.md", "utf8"),
    );
  });
  it("matches Glickman's official standard example, including deviation and volatility", () => {
    const result = glicko2({ rating: 1500, deviation: 200, volatility: 0.06 }, [
      { rating: 1400, deviation: 30, score: 1 },
      { rating: 1550, deviation: 100, score: 0 },
      { rating: 1700, deviation: 300, score: 0 },
    ]);
    // The PDF rounds mu' to -0.2069 before its final conversion. Keep the
    // engine's unrounded calculation and also reproduce that published step.
    expect(result.rating).toBeCloseTo(1464.0506705393013, 8);
    expect(
      1500 +
        (Math.round(((result.rating - 1500) / 173.7178) * 10000) / 10000) *
          173.7178,
    ).toBeCloseTo(1464.06, 2);
    expect(result.deviation).toBeCloseTo(151.52, 2);
    expect(result.volatility).toBeCloseTo(0.059996, 5);
  });
  it("preserves standard Glicko inactivity, draw symmetry and frequency replication", () => {
    const p = { rating: 1500, deviation: 350, volatility: 0.06 };
    const idle = glicko2(p, []);
    expect(idle.rating).toBe(1500);
    expect(idle.volatility).toBe(0.06);
    expect(idle.deviation).toBeGreaterThan(350);
    expect(
      glicko2(p, [{ rating: 1500, deviation: 350, score: 0.5 }]).rating,
    ).toBe(1500);
    const repeated = Array.from({ length: 7 }, () => ({
      rating: 1400,
      deviation: 100,
      score: 1,
    }));
    const expanded = glicko2(p, repeated),
      aggregate = glicko2(p, [{ ...repeated[0], frequency: 7 }]);
    expect(aggregate.rating).toBeCloseTo(expanded.rating, 9);
    expect(aggregate.deviation).toBeCloseTo(expanded.deviation, 9);
    expect(aggregate.volatility).toBeCloseTo(expanded.volatility, 9);
    expect(() =>
      glicko2(p, [{ rating: 1400, deviation: 30, score: 1 }], {
        maxIterations: 1,
      }),
    ).toThrow();
    expect(() =>
      glicko2(p, [{ rating: 1400, deviation: 30, score: 1, frequency: 0 }]),
    ).toThrow();
  });
  it("Elo follows a simultaneous period rather than sequential feedback", () => {
    expect(eloPeriod(1500, [{ rating: 1500, score: 1 }])).toBe(1516);
    expect(eloPeriod(1500, [{ rating: 1500, score: 0.5 }])).toBe(1500);
    expect(
      eloPeriod(1500, [
        { rating: 1500, score: 1, frequency: 3 },
        { rating: 1500, score: 0 },
      ]),
    ).toBe(1532);
  });
  it("IRV transfers preferences to a majority and discloses exhaustion and elimination ties", () => {
    const result = tallyMethod(
      { selectionMethod: "IRV", selectionSeats: 1 },
      ids,
      [
        { userId: "u1", power: 4n, ballot: { ranking: ["a"] } },
        { userId: "u2", power: 3n, ballot: { ranking: ["b"] } },
        { userId: "u3", power: 2n, ballot: { ranking: ["c", "b"] } },
      ],
      9n,
      5000,
    );
    expect(result.winnerSchemeId).toBe("b");
    expect(result.transcript).toMatchObject({
      engine: { rounds: [{ eliminated: "c" }, { elected: "b" }] },
    });
    const exhausted = tallyMethod(
      { selectionMethod: "IRV", selectionSeats: 1 },
      ids,
      [
        { userId: "u1", power: 3n, ballot: { ranking: ["a"] } },
        { userId: "u2", power: 2n, ballot: { ranking: ["b"] } },
        { userId: "u3", power: 1n, ballot: { ranking: ["c"] } },
      ],
      6n,
      5000,
    );
    expect(exhausted.transcript).toMatchObject({
      engine: {
        rounds: [
          { eliminated: "c" },
          { exhausted: "1", active: "5", elected: "a" },
        ],
      },
    });
  });
  it("STV transfers exact surplus with Droop quota and separately records elected seats", () => {
    const result = tallyMethod(
      { selectionMethod: "STV", selectionSeats: 2 },
      ids,
      [
        { userId: "u1", power: 6n, ballot: { ranking: ["a", "b", "c"] } },
        { userId: "u2", power: 3n, ballot: { ranking: ["b", "c"] } },
        { userId: "u3", power: 1n, ballot: { ranking: ["c"] } },
      ],
      10n,
      5000,
    );
    expect(result.elected).toEqual(["a", "b"]);
    expect(result.transcript).toMatchObject({
      engine: {
        quota: "4/1",
        events: [
          { elected: "a", surplus: "2/1", transferFactor: "1/3" },
          { elected: "b", surplus: "1/1", transferFactor: "1/5" },
        ],
        conservation: {
          initial: "10/1",
          retained: "8/1",
          live: "2/1",
          exhausted: "0/1",
        },
      },
    });
    const reduced = tallyMethod(
      { selectionMethod: "STV", selectionSeats: 50 },
      ["a"],
      [{ userId: "u", power: 1n, ballot: { ranking: ["a"] } }],
      1n,
      10000,
    );
    expect(reduced.elected).toEqual(["a"]);
    expect(reduced.transcript).toMatchObject({ engine: { effectiveSeats: 1 } });
  });
  it("pair workload, validation, draw rules and unique voter denominators are exact", () => {
    expect(
      methodPairs(Array.from({ length: 50 }, (_, i) => `c${i}`)),
    ).toHaveLength(1225);
    for (const method of ["ELO", "GLICKO_2", "FORCED_PAIRWISE"] as const) {
      const config = { selectionMethod: method, selectionSeats: 1 };
      const valid = ballot(method, ids) as {
        pairs: { a: string; b: string; choice: "A" | "B" | "DRAW" }[];
      };
      expect(() =>
        validateMethodBallot(config, ids, { pairs: valid.pairs.slice(1) }),
      ).toThrow();
      expect(() =>
        validateMethodBallot(config, ids, {
          pairs: [valid.pairs[0], valid.pairs[0], valid.pairs[2]],
        }),
      ).toThrow();
      expect(() =>
        validateMethodBallot(config, ids, {
          pairs: valid.pairs.map((p, i) => (i ? p : { ...p, a: p.b, b: p.a })),
        }),
      ).toThrow();
      expect(() =>
        validateMethodBallot(config, ids, {
          pairs: [...valid.pairs, { a: "a", b: "foreign", choice: "A" }],
        }),
      ).toThrow();
      const result = tallyMethod(
        config,
        ids,
        [{ userId: "one", power: 7n, ballot: valid }],
        20n,
        5000,
      );
      expect(result.participation).toBe(7n);
      expect(result.outcome).toBe("NO_QUORUM");
      expect(() =>
        tallyMethod(
          config,
          ids,
          [
            { userId: "one", power: 7n, ballot: valid },
            { userId: "one", power: 7n, ballot: valid },
          ],
          20n,
          5000,
        ),
      ).toThrow();
      const draws = {
        pairs: valid.pairs.map((p) => ({ ...p, choice: "DRAW" })),
      };
      if (method === "FORCED_PAIRWISE")
        expect(() => validateMethodBallot(config, ids, draws)).toThrow();
      else expect(validateMethodBallot(config, ids, draws)).toEqual(draws);
    }
    for (const method of ["IRV", "STV"] as const)
      expect(() =>
        validateMethodBallot(
          { selectionMethod: method, selectionSeats: 1 },
          ids,
          { ranking: ["a", "a"] },
        ),
      ).toThrow();
  });
  for (const method of METHODS)
    for (const weight of ["EQUAL", "CONTRIBUTION"] as const)
      for (const policy of [
        "WINNER_ALL",
        "PROPORTIONAL",
        "RANKED_CUTS",
      ] as AllocationPolicy[]) {
        const cell = `${method}-${weight}-${policy}`;
        it(`matrix ${cell}: replay, declared support and conserved monetary oracle`, () => {
          const powers = weight === "EQUAL" ? [1n, 1n, 1n] : [5n, 3n, 2n];
          const votes = [ids, ids, ["b", "a", "c"]].map((rank, i) => ({
            userId: `u${i}`,
            power: powers[i],
            ballot: ballot(method, rank),
          }));
          const config = {
            selectionMethod: method,
            selectionSeats: method === "STV" ? 2 : 1,
          };
          const total = powers.reduce((sum, p) => sum + p, 0n);
          const result = tallyMethod(config, ids, votes, total, 5000);
          expect(
            tallyMethod(
              config,
              [...ids].reverse(),
              [...votes].reverse(),
              total,
              5000,
            ),
          ).toEqual(result);
          expect(result.winnerSchemeId).toBe("a");
          expect(result.ranking.map((r) => r.schemeId)).toEqual(ids);
          const plan = allocateV3(
            101n,
            ids.map((id) => ({
              schemeId: id,
              request: 1000n,
              recipient: `recipient ${id}`,
              beneficiaryId: `owner${id}`,
              support: result.counts[id],
            })),
            policy,
            policy === "RANKED_CUTS" ? [6000, 3000, 1000] : [],
          );
          const amounts = Object.fromEntries(
            plan.payouts.map((p) => [p.schemeId, p.amount]),
          );
          const expected =
            policy === "WINNER_ALL"
              ? { a: 101n }
              : policy === "RANKED_CUTS"
                ? method === "FPTP"
                  ? { a: 61n, b: 30n }
                  : { a: 61n, b: 30n, c: 10n }
                : method === "FPTP"
                  ? weight === "EQUAL"
                    ? { a: 67n, b: 34n }
                    : { a: 81n, b: 20n }
                  : { a: 50n, b: 34n, c: 17n };
          expect(amounts).toEqual(expected);
          expect(plan.refundTotal).toBe(
            policy === "RANKED_CUTS" && method === "FPTP" ? 10n : 0n,
          );
          expect(
            plan.payouts.reduce((sum, p) => sum + p.amount, plan.refundTotal),
          ).toBe(101n);
        });
      }
  for (const method of METHODS)
    it(`${method} empty, tied, single-candidate and zero-power edges`, () => {
      const config = { selectionMethod: method, selectionSeats: 1 };
      expect(tallyMethod(config, ids, [], 3n, 5000).outcome).toBe("NO_QUORUM");
      const single =
        method === "FPTP"
          ? { schemeId: "a" }
          : method === "IRV" || method === "STV"
            ? { ranking: ["a"] }
            : { pairs: [] };
      expect(
        tallyMethod(
          config,
          ["a"],
          [{ userId: "one", power: 1n, ballot: single }],
          1n,
          10000,
        ).winnerSchemeId,
      ).toBe("a");
      expect(() =>
        tallyMethod(
          config,
          ids,
          [{ userId: "one", power: 0n, ballot: ballot(method, ids) }],
          1n,
          5000,
        ),
      ).toThrow();
    });
  it("rejects unsupported seat, property and rank-share configurations", () => {
    const base = {
      fundingTarget: "1",
      minimumContribution: ".01",
      maximumContribution: "10",
      collectionClosesAt: "2026-11-07T00:00:00.000Z",
      expiresAt: "2026-11-20T00:00:00.000Z",
      selectionMethod: "ELO",
      selectionSeats: 2,
    };
    expect(v4FundsConfigSchema.safeParse(base).success).toBe(false);
    expect(() =>
      validateMethodBallot(
        { selectionMethod: "FPTP", selectionSeats: 1 },
        ids,
        { schemeId: "a", extra: true },
      ),
    ).toThrow();
  });
});
