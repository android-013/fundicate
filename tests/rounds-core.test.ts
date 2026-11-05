import { describe, it, expect } from "vitest";
import {
  selectionOutcome,
  roundSchema,
  schemeSchema,
} from "../src/lib/rounds-core";
describe("funding round rules", () => {
  it("selects the unique leading scheme using equal ballots and rounded quorum", () => {
    const r = selectionOutcome(
      ["a", "b"],
      [{ schemeId: "a" }, { schemeId: "a" }, { schemeId: "b" }],
      5,
      5000,
    );
    expect(r.winnerSchemeId).toBe("a");
    expect(r.quorumRequired).toBe(3);
    expect(r.counts).toEqual({ a: 2, b: 1 });
  });
  it("does not invent a winner when quorum fails", () => {
    const r = selectionOutcome(["a", "b"], [{ schemeId: "a" }], 5, 5000);
    expect(r.outcome).toBe("NO_QUORUM");
    expect(r.winnerSchemeId).toBeNull();
  });
  it("records ties without staff or arbitrary tie breaking", () => {
    const r = selectionOutcome(
      ["a", "b"],
      [{ schemeId: "a" }, { schemeId: "b" }],
      2,
      5000,
    );
    expect(r.outcome).toBe("TIED");
    expect(r.winnerSchemeId).toBeNull();
  });
  it("rejects unknown candidates, duplicate candidates and impossible electorates", () => {
    expect(() =>
      selectionOutcome(["a"], [{ schemeId: "b" }], 1, 5000),
    ).toThrow();
    expect(() => selectionOutcome(["a", "a"], [], 1, 5000)).toThrow();
    expect(() =>
      selectionOutcome(["a"], [{ schemeId: "a" }], 0, 5000),
    ).toThrow();
    expect(() => selectionOutcome(["a"], [], 1, 0)).toThrow();
  });
  it("validates immutable round policy, quorum and deadlines", () => {
    const r = {
      communityId: "11111111-1111-4111-a111-111111111111",
      title: "A round for shared ideas",
      description: "Decide between useful projects for the community.",
      submissionsCloseAt: "2026-12-01T12:00:00Z",
      proposalPolicy: "EVERYONE",
      quorumBps: 5000,
    };
    expect(roundSchema.safeParse(r).success).toBe(true);
    expect(
      roundSchema.safeParse({ ...r, proposalPolicy: "ADMIN_WEIGHTED" }).success,
    ).toBe(false);
    expect(roundSchema.safeParse({ ...r, quorumBps: 0 }).success).toBe(false);
    expect(
      roundSchema.safeParse({ ...r, submissionsCloseAt: "tomorrow" }).success,
    ).toBe(false);
  });
  it("rejects zero funding requests, executable links and cross-record identifiers", () => {
    const r = {
      communityId: "11111111-1111-4111-a111-111111111111",
      roundId: "22222222-2222-4222-a222-222222222222",
      title: "A public scheme",
      description: "A complete plan to improve our shared neighborhood.",
      amount: "12.34",
      recipient: "The neighborhood",
      supportingUrl: "https://example.com/plan",
    };
    expect(schemeSchema.parse(r).amount).toBe(1234n);
    expect(schemeSchema.safeParse({ ...r, amount: "0" }).success).toBe(false);
    expect(
      schemeSchema.safeParse({ ...r, supportingUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      schemeSchema.safeParse({ ...r, roundId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});
