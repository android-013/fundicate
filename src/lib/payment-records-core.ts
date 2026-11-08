import { z } from "zod";
import { money, uuid } from "./validation";

const reference = z.string().trim().min(3).max(120);
const note = z.string().trim().max(2000).default("");
const optionalUuid = z
  .union([uuid, z.literal("")])
  .optional()
  .transform((value) => value || undefined);
const evidenceUrl = z
  .union([
    z
      .string()
      .max(2048)
      .url()
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Use an HTTPS evidence link without embedded credentials."),
    z.literal(""),
  ])
  .optional()
  .transform((value) => value || undefined);

/** These are staff attestations of externally handled payments, never custody or transfers. */
export const externalPaymentSchema = z
  .object({
    communityId: uuid,
    roundId: optionalUuid,
    counterpartyId: optionalUuid,
    kind: z.enum(["CONTRIBUTION", "PAYOUT", "REFUND"]),
    amount: money.refine((value) => value > 0n, "Enter a positive amount."),
    currency: z.enum(["USD", "BDT", "EUR"]),
    reference,
    note,
    evidenceUrl,
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const externalPaymentReversalSchema = z
  .object({
    communityId: uuid,
    recordId: uuid,
    reference,
    note: z.string().trim().min(10).max(2000),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const EXTERNAL_PAYMENT_DISCLOSURE =
  "Staff-recorded external payment; independently unverified. No money is transferred and no voting power is granted by this record.";

type ComparablePayment = {
  roundId?: string | null;
  counterpartyId?: string | null;
  kind: string;
  amount: bigint;
  currency: string;
  reference: string;
  note: string;
  evidenceUrl?: string | null;
  occurredAt: Date;
};
export function sameExternalPayment(
  a: ComparablePayment,
  b: ComparablePayment,
) {
  return (
    (a.roundId ?? null) === (b.roundId ?? null) &&
    (a.counterpartyId ?? null) === (b.counterpartyId ?? null) &&
    a.kind === b.kind &&
    a.amount === b.amount &&
    a.currency === b.currency &&
    a.reference === b.reference &&
    a.note === b.note &&
    (a.evidenceUrl ?? null) === (b.evidenceUrl ?? null) &&
    a.occurredAt.getTime() === b.occurredAt.getTime()
  );
}
