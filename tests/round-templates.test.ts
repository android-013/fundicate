import { describe, expect, it } from "vitest";
import { materializeTemplateRules, snapshotTemplateRules } from "../src/lib/round-templates";

const communityId = "e0a1ec6d-2d52-4cfe-80b8-bf62ae570d1a";
const day = 86400000;
const basic = { communityId, title: "Monthly community grant round", description: "Choose projects through a complete recorded community process.", proposalPolicy: "STAFF", quorumBps: 6000, submissionsCloseAt: "2027-01-08T12:00:00.000Z", funded: false };
const funded = { ...basic, funded: true, fundedVersion: "V4", fundingTarget: "1000.01", minimumContribution: "1.50", maximumContribution: "5000.99", collectionClosesAt: "2027-01-07T12:00:00.000Z", expiresAt: "2027-01-15T12:00:00.000Z", selectionMethod: "STV", selectionSeats: 2, screeningWeight: "EQUAL", selectionWeight: "CONTRIBUTION", vetoWeight: "CONTRIBUTION", allocationPolicy: "RANKED_CUTS", rankedSharesBps: [6000, 4000], vetoEnabled: true };

describe("immutable reusable round templates", () => {
  it("moves funding dates by their exact relation to the new submission deadline", () => {
    const snapshot = snapshotTemplateRules(funded);
    const next = materializeTemplateRules(snapshot, communityId, "2027-02-20T12:00:00.000Z");
    expect(snapshot.schedule).toEqual({ collectionBeforeSubmissionMs: day, expiryAfterSubmissionMs: 7 * day });
    expect(next.collectionClosesAt).toBe("2027-02-19T12:00:00.000Z");
    expect(next.expiresAt).toBe("2027-02-27T12:00:00.000Z");
  });
  it("retains method, seats, weights, veto, ranked shares and exact currency precision", () => {
    const next = materializeTemplateRules(snapshotTemplateRules(funded), communityId, "2027-02-20T12:00:00.000Z");
    for (const key of ["fundingTarget", "minimumContribution", "maximumContribution", "selectionMethod", "selectionSeats", "screeningWeight", "selectionWeight", "vetoWeight", "allocationPolicy", "rankedSharesBps", "vetoEnabled"] as const) expect(next[key]).toEqual(funded[key]);
  });
  it("stores no absolute deadlines, community ownership, ballots or transfer records", () => {
    const snapshot = snapshotTemplateRules(funded);
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain("2027-");
    expect(text).not.toContain(communityId);
    expect(text).not.toContain("ballot");
    expect(() => snapshotTemplateRules({ ...funded, contributions: ["spoof"] })).toThrow();
  });
  it("decision-only templates never acquire payment authority", () => {
    const snapshot = snapshotTemplateRules(basic);
    const next = materializeTemplateRules(snapshot, communityId, "2027-02-20T12:00:00.000Z");
    expect(snapshot.schedule).toEqual({ collectionBeforeSubmissionMs: null, expiryAfterSubmissionMs: null });
    expect(next.funded).toBe(false);
    expect(next).not.toHaveProperty("fundedVersion");
    expect(next).not.toHaveProperty("fundingTarget");
  });
  it("rejects collection after submissions and recovery expiry before the declared window", () => {
    expect(() => snapshotTemplateRules({ ...funded, collectionClosesAt: "2027-01-09T12:00:00.000Z" })).toThrow();
    expect(() => snapshotTemplateRules({ ...funded, expiresAt: "2027-01-10T12:00:00.000Z" })).toThrow();
  });
  it("cannot make a draft use a corrupt or unsupported future snapshot", () => {
    const snapshot = snapshotTemplateRules(funded);
    expect(() => materializeTemplateRules({ ...snapshot, schemaVersion: 2 }, communityId, "2027-02-20T12:00:00.000Z")).toThrow();
    expect(() => materializeTemplateRules({ ...snapshot, round: { ...snapshot.round, selectionMethod: "FAKE" } }, communityId, "2027-02-20T12:00:00.000Z")).toThrow();
    expect(() => materializeTemplateRules({ ...snapshot, schedule: { ...snapshot.schedule, collectionBeforeSubmissionMs: null } }, communityId, "2027-02-20T12:00:00.000Z")).toThrow();
  });
  it("independent draft materializations do not mutate a stored revision", () => {
    const snapshot = snapshotTemplateRules(funded);
    const before = JSON.stringify(snapshot);
    const next = materializeTemplateRules(snapshot, communityId, "2027-02-20T12:00:00.000Z", { title: "A different monthly decision" });
    expect(next.title).toBe("A different monthly decision");
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
