import { describe, expect, it } from "vitest";
import {
  aggregateReputation,
  createReputationSchema,
  editReputationSchema,
  moderateReputationSchema,
  reviewDimensionAllowed,
  reputationDimensionLabel,
} from "../src/lib/reputation-core";

const id = "00000000-0000-4000-8000-000000000001";
const valid = {
  communityId: id,
  targetType: "MEMBER",
  targetId: id,
  dimension: "PARTICIPATION",
  contextType: "ROUND",
  contextId: id,
  score: 4,
  text: "Specific and respectful shared experience.",
};

describe("reputation contracts", () => {
  it("accepts only integer 1–5 scores and substantive written reviews", () => {
    for (const score of [1, 2, 3, 4, 5])
      expect(createReputationSchema.parse({ ...valid, score }).score).toBe(
        score,
      );
    for (const score of [0, 6, 1.5, "bad", Infinity])
      expect(
        createReputationSchema.safeParse({ ...valid, score }).success,
      ).toBe(false);
    for (const text of ["", "short", " ".repeat(25), "x".repeat(3001)])
      expect(createReputationSchema.safeParse({ ...valid, text }).success).toBe(
        false,
      );
  });

  it("rejects unknown/mutable identity fields in create and edit", () => {
    expect(
      createReputationSchema.safeParse({ ...valid, hidden: false }).success,
    ).toBe(false);
    expect(
      editReputationSchema.safeParse({
        communityId: id,
        reviewId: id,
        score: 5,
        text: valid.text,
        targetId: id,
      }).success,
    ).toBe(false);
    expect(
      moderateReputationSchema.safeParse({
        communityId: id,
        reviewId: id,
        action: "DELETE",
        reason: "This reason is sufficiently long.",
      }).success,
    ).toBe(false);
    expect(
      moderateReputationSchema.safeParse({
        communityId: id,
        reviewId: id,
        action: "HIDE",
        reason: " ",
      }).success,
    ).toBe(false);
  });

  it("separates participation and presentation dimensions for every required target", () => {
    expect(reviewDimensionAllowed("MEMBER", "PARTICIPATION")).toBe(true);
    expect(reviewDimensionAllowed("ROUND", "PARTICIPATION")).toBe(true);
    expect(reviewDimensionAllowed("SCHEME", "PRESENTATION")).toBe(true);
    expect(reviewDimensionAllowed("PROPOSAL", "PRESENTATION")).toBe(true);
    for (const type of ["MEMBER", "SCHEME", "PROPOSAL"])
      expect(
        reviewDimensionAllowed(type, "VERIFIED_RECIPIENT_PERFORMANCE"),
      ).toBe(true);
    expect(
      reviewDimensionAllowed("ROUND", "VERIFIED_RECIPIENT_PERFORMANCE"),
    ).toBe(false);
    expect(reviewDimensionAllowed("MEMBER", "PRESENTATION")).toBe(false);
    expect(reviewDimensionAllowed("PROPOSAL", "PARTICIPATION")).toBe(false);
  });

  it("averages latest visible inputs once and keeps dimensions independent", () => {
    const rows = [
      {
        targetType: "MEMBER",
        targetId: id,
        dimension: "PARTICIPATION",
        score: 5,
        hidden: false,
      },
      {
        targetType: "MEMBER",
        targetId: id,
        dimension: "PARTICIPATION",
        score: 2,
        hidden: false,
      },
      {
        targetType: "MEMBER",
        targetId: id,
        dimension: "PARTICIPATION",
        score: 1,
        hidden: true,
      },
      {
        targetType: "MEMBER",
        targetId: id,
        dimension: "VERIFIED_RECIPIENT_PERFORMANCE",
        score: 4,
        hidden: false,
      },
    ];
    const result = aggregateReputation(rows);
    expect(result).toHaveLength(2);
    expect(
      result.find((row) => row.dimension === "PARTICIPATION"),
    ).toMatchObject({ count: 2, total: 7, average: 3.5 });
    expect(
      result.find((row) => row.dimension === "VERIFIED_RECIPIENT_PERFORMANCE"),
    ).toMatchObject({ count: 1, average: 4 });
    expect(aggregateReputation([...rows].reverse())).toEqual(result);
  });

  it("never fabricates an aggregate for hidden-only or empty targets", () => {
    expect(aggregateReputation([])).toEqual([]);
    expect(
      aggregateReputation([
        {
          targetType: "ROUND",
          targetId: id,
          dimension: "PARTICIPATION",
          score: 5,
          hidden: true,
        },
      ]),
    ).toEqual([]);
    expect(() =>
      aggregateReputation([
        {
          targetType: "ROUND",
          targetId: id,
          dimension: "PARTICIPATION",
          score: 0,
          hidden: false,
        },
      ]),
    ).toThrow();
  });

  it("labels receipt-backed experience without claiming verified real-world success", () => {
    expect(reputationDimensionLabel("VERIFIED_RECIPIENT_PERFORMANCE")).toBe(
      "Receipt-backed recipient experience",
    );
    expect(reputationDimensionLabel("PRESENTATION")).toBe("Presentation");
  });
});
