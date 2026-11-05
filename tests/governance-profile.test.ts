import { describe, expect, it } from "vitest";
import {
  communitySchema,
  declarationSchema,
  proposalSchema,
} from "../src/lib/validation";

const community = {
  name: "Declaration collective",
  slug: "declaration-collective",
  description: "A community with explicitly published membership rules.",
  purpose: "Make shared decisions through member participation.",
  currency: "USD",
  minimumContribution: "10",
  questions: "Why join?\nWhat will you offer?",
};
const founder = {
  governanceProfile: "STRICT",
  founderContribution: "10.29",
  founderIntroduction:
    "I am founding this collective to support shared projects.",
  founderAnswers:
    "I want to build with others.\nI can contribute research and time.",
};
describe("versioned community governance inputs", () => {
  it("keeps historical clients on the legacy profile with unknown founder pledges", () => {
    const parsed = communitySchema.parse(community);
    expect(parsed.governanceProfile).toBe("LEGACY");
    expect(parsed.founderContribution).toBeUndefined();
    expect(
      communitySchema.parse({ ...community, founderContribution: "" })
        .founderContribution,
    ).toBeUndefined();
  });
  it("requires the strict founder declaration and introduction", () => {
    expect(
      communitySchema.safeParse({ ...community, governanceProfile: "STRICT" })
        .success,
    ).toBe(false);
    expect(
      communitySchema.safeParse({
        ...community,
        ...founder,
        founderContribution: "9.99",
      }).success,
    ).toBe(false);
    expect(
      communitySchema.safeParse({
        ...community,
        ...founder,
        founderIntroduction: "Short",
      }).success,
    ).toBe(false);
  });
  it("requires exactly one answer for every founder membership question", () => {
    for (const founderAnswers of [
      "One answer",
      "One\n\nThree",
      "One\nTwo\nThree",
      `${"a".repeat(1001)}\nTwo`,
    ])
      expect(
        communitySchema.safeParse({ ...community, ...founder, founderAnswers })
          .success,
      ).toBe(false);
    expect(
      communitySchema.safeParse({
        ...community,
        ...founder,
        questions: "1\n2\n3\n4\n5\n6",
        founderAnswers: "a\nb\nc\nd\ne\nf",
      }).success,
    ).toBe(false);
    expect(
      communitySchema.parse({ ...community, ...founder }).founderContribution,
    ).toBe(1029n);
  });
  it("supports a real zero declaration when the published minimum is zero", () => {
    expect(
      communitySchema.parse({
        ...community,
        ...founder,
        minimumContribution: "0",
        founderContribution: "0",
        questions: "",
        founderAnswers: "",
      }).founderContribution,
    ).toBe(0n);
  });
  it("validates prospective declarations without converting them to received funds", () => {
    const data = declarationSchema.parse({
      communityId: "11111111-1111-4111-8111-111111111111",
      amount: "10.29",
    });
    expect(data.amount).toBe(1029n);
    expect(declarationSchema.safeParse({ ...data, amount: "-1" }).success).toBe(
      false,
    );
  });
  it("requires a UUID for any published successor reference", () => {
    expect(
      proposalSchema.shape.successorId.safeParse("not-a-user").success,
    ).toBe(false);
    expect(proposalSchema.shape.successorId.parse(undefined)).toBe("");
  });
});
