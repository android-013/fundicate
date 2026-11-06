import { createHash } from "node:crypto";
import { z } from "zod";

export const NATIVE_ASSET = "near:testnet:NEAR" as const;
export const NATIVE_DECIMALS = 24;
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a],[b]) => a.localeCompare(b))) : entry);
}
export const accountIdSchema = z.string().min(2).max(64).regex(/^(?:[a-z0-9]+(?:[-_][a-z0-9]+)*\.)*[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
export const atomicAmountSchema = z.string().regex(/^(0|[1-9][0-9]{0,37})$/);
export const transactionHashSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
export function parseNativeAmount(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,13})(\.[0-9]{1,24})?$/.test(value)) throw new Error("Use a nonnegative NEAR amount with at most 24 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, "0"));
}
export function formatNativeAmount(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const fraction = (absolute % 10n ** 24n).toString().padStart(24, "0").replace(/0+$/, "");
  return `${sign}${absolute / 10n ** 24n}${fraction ? "." + fraction : ""}`;
}
export type NativePlanItem = { operation_id: string; kind: "PAYOUT" | "REFUND"; recipient: string; amount: string };
export const nativeRefundOperationId = (vaultId:string, source:string) => `plan:${vaultId}:refund:${createHash("sha256").update(source).digest("hex")}`;
export function allocationHash(roundId: string, items: NativePlanItem[]) {
  return createHash("sha256").update(JSON.stringify([roundId, NATIVE_ASSET, items.map(i => ({ operation_id: i.operation_id, kind: i.kind, recipient: i.recipient, amount: i.amount }))])).digest("hex");
}
export type PreparedTransfer = {
  network: "testnet"; assetId: typeof NATIVE_ASSET; contractId: string;
  operationId: string; signerId: string; method: string;
  args: Record<string, unknown>; deposit: string; gas: string; contractCodeHash: string;
  transfer?: {kind:"PAYOUT"|"REFUND";recipient:string;amount:string;planHash:string};
};
export type ProviderObservation = {
  status: "CONFIRMED" | "FAILED" | "UNKNOWN";
  transactionHash: string; receiptIds: string[];
  evidence: Record<string, unknown>;
};
// Providers prepare wallet instructions and independently observe outcomes. They
// never perform network calls inside a retryable database transaction.
export interface SettlementProvider {
  readonly id: string;
  readonly network: string;
  readonly assetId: string;
  readonly decimals: number;
  observe(expected: PreparedTransfer, hash: string): Promise<ProviderObservation>;
}
