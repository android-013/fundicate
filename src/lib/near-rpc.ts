import {
  NATIVE_ASSET,
  accountIdSchema,
  canonicalJson,
  type PreparedTransfer,
  type ProviderObservation,
  type SettlementProvider,
  transactionHashSchema,
} from "./chain-core";

type RpcObject = Record<string, unknown>;
class NearRpcError extends Error {
  constructor(readonly code: unknown) {
    super("NEAR RPC could not establish the requested state.");
  }
}
export class NearRpc {
  constructor(
    readonly url: string,
    private readonly request: typeof fetch = fetch,
  ) {}
  async call<T = RpcObject>(
    method: string,
    params: Record<string, unknown> | unknown[],
  ): Promise<T> {
    const response = await this.request(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "fundicate", method, params }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("NEAR RPC is unavailable.");
    const body = await response.json();
    if (body.error || body.result === undefined)
      throw new NearRpcError(body.error?.code);
    return body.result as T;
  }
  async assertTestnet() {
    const status = await this.call<{ chain_id: string }>("status", []);
    if (status.chain_id !== "testnet")
      throw new Error("Only the NEAR testnet network is enabled.");
  }
  async view<T = RpcObject>(
    contractId: string,
    method: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = await this.call<{ result: number[] }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    return JSON.parse(Buffer.from(result.result).toString("utf8")) as T;
  }
}
export async function verifyNearDeployment(
  rpc: NearRpc,
  contractId: string,
  codeHash: string,
) {
  await rpc.assertTestnet();
  const account = await rpc.call<{ code_hash: string }>("query", {
    request_type: "view_account",
    account_id: contractId,
    finality: "final",
  });
  if (account.code_hash !== codeHash)
    throw new Error(
      "The deployed contract code differs from the reviewed WASM hash.",
    );
  const custody = await rpc.view(contractId, "get_custody", {});
  const controller = accountIdSchema.safeParse(custody?.controller);
  if (
    custody?.network !== "testnet" ||
    custody.asset_id !== NATIVE_ASSET ||
    !controller.success
  )
    throw new Error("The treasury must be initialized for NEAR testnet.");
  return {
    controller: controller.data,
    solvent: custody.solvent_including_in_flight === true,
  };
}
function success(status: unknown): boolean {
  return (
    !!status &&
    typeof status === "object" &&
    ("SuccessValue" in status || "SuccessReceiptId" in status)
  );
}
function failed(status: unknown): boolean {
  return !!status && typeof status === "object" && "Failure" in status;
}
export class NearTestnetProvider implements SettlementProvider {
  readonly id = "near-testnet";
  readonly network = "testnet";
  readonly assetId = NATIVE_ASSET;
  readonly decimals = 24;
  constructor(readonly rpc: NearRpc) {}
  async observe(
    expected: PreparedTransfer,
    hash: string,
  ): Promise<ProviderObservation> {
    transactionHashSchema.parse(hash);
    if (expected.network !== "testnet" || expected.assetId !== NATIVE_ASSET)
      throw new Error("Unsupported settlement asset.");
    try {
      await this.rpc.assertTestnet();
      const account = await this.rpc.call<{ code_hash: string }>("query", {
        request_type: "view_account",
        account_id: expected.contractId,
        finality: "final",
      });
      if (account.code_hash !== expected.contractCodeHash)
        throw new Error(
          "The deployed contract code differs from the immutable reviewed code hash.",
        );
      type TransactionObservation = {
        final_execution_status: string;
        transaction: {
          hash: string;
          signer_id: string;
          receiver_id: string;
          actions: {
            FunctionCall?: {
              method_name: string;
              args: string;
              deposit: string;
              gas: number | string;
            };
          }[];
        };
        status: unknown;
        transaction_outcome: { id: string; outcome: { status: unknown } };
        receipts_outcome: {
          id: string;
          outcome: { executor_id: string; status: unknown; logs: string[] };
        }[];
        receipts?: {
          receipt_id: string;
          predecessor_id: string;
          receiver_id: string;
          receipt: {
            Action?: { actions: { Transfer?: { deposit: string } }[] };
          };
        }[];
      };
      const params = {
        tx_hash: hash,
        sender_account_id: expected.signerId,
        wait_until: "FINAL",
      };
      let observation: TransactionObservation;
      try {
        observation = await this.rpc.call<TransactionObservation>(
          "tx_status",
          params,
        );
      } catch (error) {
        if (!(error instanceof NearRpcError) || error.code !== -32601)
          throw error;
        observation = await this.rpc.call<TransactionObservation>(
          "EXPERIMENTAL_tx_status",
          params,
        );
      }
      const tx = observation.transaction;
      if (observation.final_execution_status !== "FINAL")
        return {
          status: "UNKNOWN",
          transactionHash: hash,
          receiptIds: [],
          evidence: { reason: "Finality is not established." },
        };
      if (
        tx.hash !== hash ||
        tx.signer_id !== expected.signerId ||
        tx.receiver_id !== expected.contractId ||
        tx.actions.length !== 1
      )
        throw new Error(
          "Observed transaction identity differs from the prepared operation.",
        );
      const action = tx.actions[0].FunctionCall;
      if (
        !action ||
        action.method_name !== expected.method ||
        action.deposit !== expected.deposit ||
        String(action.gas) !== expected.gas
      )
        throw new Error(
          "Observed action, gas or attached amount differs from the prepared operation.",
        );
      const args = JSON.parse(
        Buffer.from(action.args, "base64").toString("utf8"),
      );
      // JSON property order is irrelevant; data and extra arguments are not.
      if (canonicalJson(args) !== canonicalJson(expected.args))
        throw new Error(
          "Observed arguments differ from the immutable operation.",
        );
      const allOutcomes = [
        observation.transaction_outcome,
        ...observation.receipts_outcome,
      ];
      if (new Set(allOutcomes.map((x) => x.id)).size !== allOutcomes.length)
        throw new Error("Duplicate receipt outcome identities are invalid.");
      const hasFailure =
        failed(observation.status) ||
        allOutcomes.some((x) => failed(x.outcome.status));
      const complete =
        allOutcomes.length >= 2 &&
        success(observation.status) &&
        allOutcomes.every((x) => success(x.outcome.status));
      const receiptIds = observation.receipts_outcome.map((x) => x.id);
      if (complete && expected.transfer) {
        let transfers = 0;
        for (const outcome of observation.receipts_outcome) {
          let receipt = observation.receipts?.find(
            (r) => r.receipt_id === outcome.id,
          );
          if (!receipt)
            receipt = await this.rpc.call("EXPERIMENTAL_receipt", {
              receipt_id: outcome.id,
            });
          if (
            receipt?.receipt_id === outcome.id &&
            receipt.predecessor_id === expected.contractId &&
            receipt.receiver_id === expected.transfer.recipient &&
            receipt.receipt.Action?.actions.length === 1 &&
            receipt.receipt.Action.actions[0].Transfer?.deposit ===
              expected.transfer.amount &&
            outcome.outcome.executor_id === expected.transfer.recipient
          )
            transfers++;
        }
        if (transfers !== 1)
          throw new Error(
            "A unique successful native transfer receipt to the committed recipient and amount was not established.",
          );
      }
      return {
        status: hasFailure ? "FAILED" : complete ? "CONFIRMED" : "UNKNOWN",
        transactionHash: hash,
        receiptIds,
        evidence: observation as unknown as RpcObject,
      };
    } catch (error) {
      // A timeout, missing transaction or malformed/mismatching observation is
      // not proof of failure and never authorizes a replacement transfer.
      return {
        status: "UNKNOWN",
        transactionHash: hash,
        receiptIds: [],
        evidence: {
          reason:
            error instanceof Error ? error.message : "Outcome unavailable.",
        },
      };
    }
  }
}
