import { describe, expect, it } from "vitest";
import {
  externalPaymentSchema,
  externalPaymentReversalSchema,
  sameExternalPayment,
} from "../src/lib/payment-records-core";

const id = "b23da4a3-dc28-4ac3-af94-543f60d806d9";
const input = {
  communityId: id,
  kind: "CONTRIBUTION",
  amount: "120.03",
  currency: "BDT",
  reference: "bank-reference-123",
  note: "Statement entry recorded by staff.",
  occurredAt: "2026-11-01T12:00:00.000Z",
};
describe("external payment attestation boundaries", () => {
  it("keeps exact minor units and accepts optional empty form controls", () => {
    const value = externalPaymentSchema.parse({
      ...input,
      roundId: "",
      counterpartyId: "",
      evidenceUrl: "",
    });
    expect(value.amount).toBe(12003n);
    expect(value.roundId).toBeUndefined();
    expect(value.evidenceUrl).toBeUndefined();
  });
  it("rejects forged verification, transfer and voting-power properties", () => {
    for (const key of [
      "verified",
      "status",
      "balance",
      "votingPower",
      "recordedById",
      "reversesId",
    ])
      expect(() =>
        externalPaymentSchema.parse({
          ...input,
          [key]: key === "verified" ? true : id,
        }),
      ).toThrow();
  });
  it("rejects malformed money, zero, negative, excess precision and unsafe integer coercion", () => {
    for (const amount of [
      "0",
      "-1",
      "1.001",
      "1e5",
      "Infinity",
      "99999999999999",
      12,
      null,
    ])
      expect(() => externalPaymentSchema.parse({ ...input, amount })).toThrow();
    expect(
      externalPaymentSchema.parse({ ...input, amount: "9999999.99" }).amount,
    ).toBe(999999999n);
  });
  it("rejects invalid identity/currency/date and excessive reference or note", () => {
    for (const change of [
      { communityId: "' OR 1=1 --" },
      { roundId: "bad" },
      { currency: "NEAR" },
      { kind: "REVERSAL" },
      { occurredAt: "yesterday" },
      { reference: "x" },
      { reference: "x".repeat(121) },
      { note: "x".repeat(2001) },
    ])
      expect(() =>
        externalPaymentSchema.parse({ ...input, ...change }),
      ).toThrow();
  });
  it("permits only bounded HTTPS evidence links without credentials", () => {
    for (const evidenceUrl of [
      "http://example.com/receipt",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "https://user:pass@example.com",
      "https://example.com/" + "x".repeat(2048),
    ])
      expect(() =>
        externalPaymentSchema.parse({ ...input, evidenceUrl }),
      ).toThrow();
    expect(
      externalPaymentSchema.parse({
        ...input,
        evidenceUrl: "https://example.com/receipt",
      }).evidenceUrl,
    ).toBe("https://example.com/receipt");
  });
  it("requires a meaningful reversal reason and cannot change the original amount", () => {
    const reverse = {
      communityId: id,
      recordId: id,
      reference: "reversal-123",
      note: "Incorrect bank record reversed.",
      occurredAt: input.occurredAt,
    };
    expect(externalPaymentReversalSchema.parse(reverse).recordId).toBe(id);
    expect(() =>
      externalPaymentReversalSchema.parse({ ...reverse, note: "no" }),
    ).toThrow();
    expect(() =>
      externalPaymentReversalSchema.parse({ ...reverse, amount: "100" }),
    ).toThrow();
  });
  it("matches every meaningful replay field and never silently overwrites conflicting details", () => {
    const parsed = externalPaymentSchema.parse(input);
    const row = {
      ...parsed,
      roundId: null,
      counterpartyId: null,
      evidenceUrl: null,
      occurredAt: new Date(parsed.occurredAt),
    };
    expect(
      sameExternalPayment(row, {
        ...parsed,
        occurredAt: new Date(parsed.occurredAt),
      }),
    ).toBe(true);
    for (const change of [
      { amount: 12004n },
      { currency: "USD" },
      { kind: "REFUND" },
      { reference: "other" },
      { note: "changed" },
      { evidenceUrl: "https://example.com" },
      { roundId: id },
      { counterpartyId: id },
      { occurredAt: new Date("2026-11-02T12:00:00Z") },
    ])
      expect(sameExternalPayment(row, { ...row, ...change })).toBe(false);
  });
});
