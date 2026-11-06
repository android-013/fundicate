import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NATIVE_ASSET, NATIVE_DECIMALS, allocationHash, canonicalJson, formatNativeAmount, nativeRefundOperationId, parseNativeAmount, type PreparedTransfer } from "../src/lib/chain-core";
import { NearRpc, NearTestnetProvider } from "../src/lib/near-rpc";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function hash(text: string) {
  const bytes = createHash("sha256").update(text).digest();
  let value = BigInt("0x" + bytes.toString("hex"));
  let encoded = "";
  while (value > 0n) { encoded = alphabet[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = "1" + encoded; }
  return encoded;
}
const txHash = hash("local-mock-transaction");
const contractReceipt = hash("local-mock-contract-receipt");
const transferReceipt = hash("local-mock-transfer-receipt");
const expected: PreparedTransfer = {
  network: "testnet", assetId: NATIVE_ASSET, contractId: "fundicate.testnet", signerId: "controller.testnet", operationId: "666e6779-443b-439c-9bce-8c2ae8c4c34e", method: "execute", args: { round_id: "round-1", asset_id: NATIVE_ASSET, operation_id: "plan:round-1:pay:scheme-1" }, deposit: "0", gas: "150000000000000", contractCodeHash: hash("reviewed-contract-code"), transfer: { kind: "PAYOUT", recipient: "recipient.testnet", amount: "100000000000000000000000", planHash: "allocation-reference" },
};
function transactionFixture() {
  return {
    final_execution_status: "FINAL",
    transaction: { hash: txHash, signer_id: expected.signerId, receiver_id: expected.contractId, actions: [{ FunctionCall: { method_name: expected.method, args: Buffer.from(JSON.stringify(expected.args)).toString("base64"), deposit: expected.deposit, gas: expected.gas } }] },
    status: { SuccessValue: "" },
    transaction_outcome: { id: txHash, outcome: { executor_id: expected.signerId, status: { SuccessReceiptId: contractReceipt }, receipt_ids: [contractReceipt] } },
    receipts_outcome: [
      { id: contractReceipt, outcome: { executor_id: expected.contractId, status: { SuccessValue: "" }, receipt_ids: [transferReceipt], logs: [] as string[] } },
      { id: transferReceipt, outcome: { executor_id: expected.transfer!.recipient, status: { SuccessValue: "" }, receipt_ids: [] as string[], logs: [] as string[] } },
    ],
    receipts: [
      { receipt_id: contractReceipt, predecessor_id: expected.signerId, receiver_id: expected.contractId, receipt: { Action: { actions: [{ FunctionCall: { method_name: expected.method } }] } } },
      { receipt_id: transferReceipt, predecessor_id: expected.contractId, receiver_id: expected.transfer!.recipient, receipt: { Action: { actions: [{ Transfer: { deposit: expected.transfer!.amount } }] } } },
    ],
  };
}
type Fixture = ReturnType<typeof transactionFixture>;
function mockProvider(fixture: Fixture, options: { network?: string; codeHash?: string; failure?: string; receiptFallback?: (id: string) => unknown } = {}) {
  const calls: { method: string; params: Record<string, unknown> | unknown[] }[] = [];
  const request: typeof fetch = async (_url, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    calls.push({ method, params });
    if (options.failure) throw new Error(options.failure);
    let result: unknown;
    if (method === "status") result = { chain_id: options.network ?? "testnet" };
    else if (method === "query") result = { code_hash: options.codeHash ?? expected.contractCodeHash };
    else if (method === "tx_status") result = fixture;
    else if (method === "EXPERIMENTAL_receipt") result = options.receiptFallback ? options.receiptFallback(params.receipt_id) : fixture.receipts.find((r) => r.receipt_id === params.receipt_id);
    else throw new Error(`Unexpected local mock method ${method}`);
    return Response.json({ jsonrpc: "2.0", id: "fundicate", result });
  };
  return { provider: new NearTestnetProvider(new NearRpc("https://local-mock.invalid", request)), calls };
}

describe("native asset precision and immutable operation identity", () => {
  it("keeps NEAR24 distinct and round-trips the smallest unit without floating point", () => {
    expect(NATIVE_ASSET).toBe("near:testnet:NEAR"); expect(NATIVE_DECIMALS).toBe(24);
    expect(parseNativeAmount("0.000000000000000000000001")).toBe(1n);
    expect(parseNativeAmount("1.000000000000000000000001")).toBe(10n ** 24n + 1n);
    expect(formatNativeAmount(10n ** 24n + 1n)).toBe("1.000000000000000000000001");
    expect(formatNativeAmount(parseNativeAmount("99999999999999.999999999999999999999999"))).toBe("99999999999999.999999999999999999999999");
  });
  it.each(["-1", "+1", "1e-24", "1,000", " 1", "1 ", "00", ".1", "1.", "NaN", "Infinity", "0.0000000000000000000000001", "100000000000000"])("rejects ambiguous or unsupported native amount %s", (value) => { expect(() => parseNativeAmount(value)).toThrow(); });
  it("canonicalizes nested JSON property order while preserving array meaning", () => {
    expect(canonicalJson({ z: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], z: 1 }));
    expect(canonicalJson({ values: [1, 2] })).not.toBe(canonicalJson({ values: [2, 1] }));
  });
  it("commits round, asset, kind, amount, recipient, operation nonce and item order in allocation hashes", () => {
    const items = [{ operation_id: "pay:1", kind: "PAYOUT" as const, recipient: "one.testnet", amount: "100" }, { operation_id: "refund:1", kind: "REFUND" as const, recipient: "source.testnet", amount: "50" }];
    const original = allocationHash("round-1", items);
    for (const altered of [[{ ...items[0], recipient: "other.testnet" }, items[1]], [{ ...items[0], amount: "101" }, items[1]], [{ ...items[0], operation_id: "pay:2" }, items[1]], [{ ...items[0], kind: "REFUND" as const }, items[1]], [...items].reverse()]) expect(allocationHash("round-1", altered)).not.toBe(original);
    expect(allocationHash("round-2", items)).not.toBe(original);
  });
  it("source-bound refund nonces remain contract-safe even for dotted account IDs", () => {
    const first = nativeRefundOperationId("vault-1", "alice.user.testnet");
    expect(first).toMatch(/^plan:vault-1:refund:[0-9a-f]{64}$/);
    expect(first).not.toContain(".");
    expect(first).toBe(nativeRefundOperationId("vault-1", "alice.user.testnet"));
    expect(first).not.toBe(nativeRefundOperationId("vault-1", "alice-user.testnet"));
    expect(first).not.toBe(nativeRefundOperationId("vault-2", "alice.user.testnet"));
  });
});

describe("local mocked NEAR RPC observation safety (not real testnet proof)", () => {
  it("requires FINAL, matching code and exact transaction plus actual successful transfer receipt", async () => {
    const { provider, calls } = mockProvider(transactionFixture());
    const result = await provider.observe(expected, txHash);
    expect(result.status).toBe("CONFIRMED");
    expect(result.receiptIds).toContain(transferReceipt);
    expect(calls.find((call) => call.method === "tx_status")?.params).toEqual({ tx_hash: txHash, sender_account_id: expected.signerId, wait_until: "FINAL" });
    expect(calls.find((call) => call.method === "query")?.params).toEqual({ request_type: "view_account", account_id: expected.contractId, finality: "final" });
  });
  it("treats inclusion or execution before FINAL as UNKNOWN", async () => {
    for (const final_execution_status of ["NONE", "INCLUDED", "EXECUTED_OPTIMISTIC", "EXECUTED"]) {
      const fixture = transactionFixture(); fixture.final_execution_status = final_execution_status;
      expect((await mockProvider(fixture).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
    }
  });
  it("refuses a mainnet response and an unexpected reviewed-contract code hash", async () => {
    expect((await mockProvider(transactionFixture(), { network: "mainnet" }).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
    expect((await mockProvider(transactionFixture(), { codeHash: hash("unreviewed-code") }).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
  const changes: [string, (fixture: Fixture) => void][] = [
    ["hash", (f) => { f.transaction.hash = hash("different-tx"); }],
    ["signer", (f) => { f.transaction.signer_id = "other.testnet"; }],
    ["receiver", (f) => { f.transaction.receiver_id = "other.testnet"; }],
    ["extra action", (f) => { f.transaction.actions.push(f.transaction.actions[0]); }],
    ["method", (f) => { f.transaction.actions[0].FunctionCall.method_name = "different_method"; }],
    ["deposit", (f) => { f.transaction.actions[0].FunctionCall.deposit = "1"; }],
    ["gas", (f) => { f.transaction.actions[0].FunctionCall.gas = "300000000000000"; }],
    ["round", (f) => { f.transaction.actions[0].FunctionCall.args = Buffer.from(JSON.stringify({ ...expected.args, round_id: "other-round" })).toString("base64"); }],
    ["asset", (f) => { f.transaction.actions[0].FunctionCall.args = Buffer.from(JSON.stringify({ ...expected.args, asset_id: "fiat:BDT" })).toString("base64"); }],
    ["nonce", (f) => { f.transaction.actions[0].FunctionCall.args = Buffer.from(JSON.stringify({ ...expected.args, operation_id: "other-nonce" })).toString("base64"); }],
    ["extra argument", (f) => { f.transaction.actions[0].FunctionCall.args = Buffer.from(JSON.stringify({ ...expected.args, recipient: "other.testnet" })).toString("base64"); }],
    ["transfer amount", (f) => { f.receipts[1].receipt.Action.actions[0] = { Transfer: { deposit: "1" } }; }],
    ["transfer recipient", (f) => { f.receipts[1].receiver_id = "other.testnet"; }],
    ["transfer predecessor", (f) => { f.receipts[1].predecessor_id = "other.testnet"; }],
    ["transfer executor", (f) => { f.receipts_outcome[1].outcome.executor_id = "other.testnet"; }],
  ];
  it.each(changes)("keeps mismatched %s observations UNKNOWN", async (_name, mutate) => {
    const fixture = transactionFixture(); mutate(fixture);
    expect((await mockProvider(fixture).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
  it("does not accept a successful contract call without its transfer receipt", async () => {
    const fixture = transactionFixture(); fixture.receipts.splice(1); fixture.receipts_outcome.splice(1);
    expect((await mockProvider(fixture).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
  it("does not accept two matching native transfers for one prepared operation", async () => {
    const fixture = transactionFixture();
    const extraId = hash("duplicate-transfer");
    fixture.receipts.push({ ...fixture.receipts[1], receipt_id: extraId });
    fixture.receipts_outcome.push({ ...fixture.receipts_outcome[1], id: extraId });
    expect((await mockProvider(fixture).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
  it("can fetch missing receipt bodies but rejects a substituted body for another receipt identity", async () => {
    const fixture = transactionFixture();
    const bodies = [...fixture.receipts]; fixture.receipts = [];
    const valid = mockProvider(fixture, { receiptFallback: (id) => bodies.find((r) => r.receipt_id === id) });
    expect((await valid.provider.observe(expected, txHash)).status).toBe("CONFIRMED");
    const substituted = mockProvider(fixture, { receiptFallback: (id) => id === transferReceipt ? { ...bodies[1], receipt_id: hash("unrelated-receipt") } : bodies[0] });
    expect((await substituted.provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
  it("records a FINAL matching transaction failure as FAILED, while RPC loss remains UNKNOWN", async () => {
    const fixture = transactionFixture();
    Object.assign(fixture.receipts_outcome[0].outcome, { status: { Failure: { ActionError: { kind: "FunctionCallError" } } } });
    expect((await mockProvider(fixture).provider.observe(expected, txHash)).status).toBe("FAILED");
    expect((await mockProvider(transactionFixture(), { failure: "Local mocked lost RPC response" }).provider.observe(expected, txHash)).status).toBe("UNKNOWN");
  });
});
