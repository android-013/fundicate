import { Prisma, type ChainOperation, type ChainVault } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { access, atomic } from "./service";
import { AppError, ensure } from "./errors";
import { uuid } from "./validation";
import { validateRuntimeConfig } from "./runtime-config";
import {
  NATIVE_ASSET,
  accountIdSchema,
  allocationHash,
  canonicalJson,
  nativeRefundOperationId,
  parseNativeAmount,
  transactionHashSchema,
  type NativePlanItem,
  type PreparedTransfer,
} from "./chain-core";
import { NearRpc, NearTestnetProvider, verifyNearDeployment } from "./near-rpc";
import { allocateV3 } from "./elections-core";
import { proportionalRefunds } from "./funds-core";

type Tx = Prisma.TransactionClient;
const scopeSchema = z.object({ communityId: uuid, vaultId: uuid }).strict();
const capsSchema = z
  .array(
    z
      .object({
        schemeId: uuid,
        recipient: accountIdSchema,
        request: z.string().max(40),
      })
      .strict(),
  )
  .min(1)
  .max(50);
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
function liveConfig() {
  const config = validateRuntimeConfig();
  ensure(
    config.near && config.mode === "near-testnet",
    "Enable the NEAR testnet provider in the service configuration first.",
    409,
  );
  return config.near;
}
function provider() {
  const config = liveConfig();
  return new NearTestnetProvider(new NearRpc(config.rpcUrl));
}
async function deployment(rpc: NearRpc, contractId: string, codeHash: string) {
  try {
    return await verifyNearDeployment(rpc, contractId, codeHash);
  } catch {
    throw new AppError(
      "Check the testnet RPC, deployed WASM hash and treasury initialization with npm run near:check.",
      503,
    );
  }
}
function nativeAmount(value: string) {
  try {
    return parseNativeAmount(value);
  } catch {
    throw new AppError("Enter a NEAR amount with up to 24 decimal places.");
  }
}
async function lock(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ChainVault" WHERE id=${id}::uuid FOR UPDATE`;
}
async function vaultFor(
  tx: Tx,
  userId: string,
  scope: { communityId: string; vaultId: string },
  staff = false,
) {
  await access(tx, scope.communityId, userId, staff);
  const vault = await tx.chainVault.findFirst({
    where: { id: scope.vaultId, communityId: scope.communityId },
  });
  ensure(vault, "Native pool not found.", 404);
  return vault;
}
async function linked(tx: Tx, userId: string, accountId: string) {
  ensure(
    await tx.walletLink.findFirst({
      where: { userId, accountId, network: "testnet", revokedAt: null },
    }),
    "Link and verify the signing wallet in Security first.",
    403,
  );
}
async function event(
  tx: Tx,
  vault: ChainVault,
  actorId: string,
  action: string,
  details: Prisma.InputJsonValue = {},
) {
  await tx.auditEvent.create({
    data: {
      communityId: vault.communityId,
      entityId: vault.id,
      actorId,
      action,
      details,
    },
  });
}
export function preparedChainOperation(
  vault: ChainVault,
  operation: ChainOperation,
): PreparedTransfer {
  return {
    network: "testnet",
    assetId: NATIVE_ASSET,
    contractId: vault.contractId,
    contractCodeHash: String(
      (vault.rulesSnapshot as Record<string, unknown>).contractCodeHash,
    ),
    operationId: operation.id,
    signerId: operation.expectedSigner,
    method: operation.method,
    args: operation.args as Record<string, unknown>,
    deposit: operation.attachedDeposit.toFixed(0),
    gas: "150000000000000",
    ...(["PAYOUT", "REFUND"].includes(operation.kind)
      ? {
          transfer: {
            kind: operation.kind as "PAYOUT" | "REFUND",
            recipient: operation.recipient,
            amount: operation.amount.toFixed(0),
            planHash: vault.allocationHash!,
          },
        }
      : {}),
  };
}
export async function matchesNativeReceipt(
  rpc: NearRpc,
  vault: ChainVault,
  operation: ChainOperation,
) {
  const args = operation.args as Record<string, unknown>;
  const onchain = await rpc.view(vault.contractId, "get_operation", {
    operation_id: args.operation_id,
  });
  const transfer = ["PAYOUT", "REFUND"].includes(operation.kind);
  return (
    onchain?.status === "SUCCESS" &&
    onchain.operation_id === args.operation_id &&
    onchain.round_id === (operation.kind === "RESERVE" ? null : vault.id) &&
    onchain.asset_id === NATIVE_ASSET &&
    onchain.kind === operation.kind &&
    String(onchain.amount) === operation.amount.toFixed(0) &&
    onchain.recipient ===
      (transfer ? operation.recipient : operation.expectedSigner) &&
    (!transfer || onchain.plan_hash === vault.allocationHash)
  );
}
async function intent(
  tx: Tx,
  vault: ChainVault,
  actorId: string,
  input: {
    key: string;
    kind: string;
    amount: bigint;
    recipient: string;
    signer: string;
    method: string;
    args: Record<string, unknown>;
    deposit?: bigint;
  },
) {
  const old = await tx.chainOperation.findUnique({
    where: { operationKey: input.key },
  });
  if (old) {
    ensure(
      old.vaultId === vault.id &&
        old.actorId === actorId &&
        old.method === input.method &&
        old.amount.toFixed(0) === input.amount.toString() &&
        old.expectedSigner === input.signer &&
        canonicalJson(old.args) === canonicalJson(input.args),
      "Operation identity already describes another request.",
      409,
    );
    return old;
  }
  return tx.chainOperation.create({
    data: {
      vaultId: vault.id,
      actorId,
      operationKey: input.key,
      kind: input.kind,
      amount: input.amount.toString(),
      recipient: input.recipient,
      expectedSigner: input.signer,
      method: input.method,
      args: json(input.args),
      attachedDeposit: (input.deposit ?? 0n).toString(),
    },
  });
}
export async function createChainVault(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const config = liveConfig();
  const poolFields = z.object({
    communityId: uuid,
    roundId: uuid,
    title: z.string().trim().min(3).max(120),
    caps: capsSchema,
  });
  const data = z
    .union([
      poolFields
        .extend({ collectionMinutes: z.number().int().min(1).max(43200) })
        .strict(),
      poolFields
        .extend({
          collectionClosesAt: z.iso.datetime(),
          expiresAt: z.iso.datetime(),
        })
        .strict(),
    ])
    .parse(input);
  const closes =
    "collectionMinutes" in data
      ? new Date(now.getTime() + data.collectionMinutes * 60_000)
      : new Date(data.collectionClosesAt);
  const expires =
    "expiresAt" in data
      ? new Date(data.expiresAt)
      : new Date(closes.getTime() + 7 * 86_400_000);
  ensure(
    closes > now &&
      closes.getTime() <= now.getTime() + 30 * 86400000 &&
      expires.getTime() >= closes.getTime() + 3 * 86400000 &&
      expires.getTime() <= closes.getTime() + 90 * 86400000,
    "Collection must be within 30 days; recovery expiry must be 3–90 days later.",
  );
  return atomic(async (tx) => {
    await access(tx, data.communityId, userId, true);
    const round = await tx.fundingRound.findFirst({
      where: { id: data.roundId, communityId: data.communityId },
      include: {
        decision: true,
        settlement: true,
        schemes: { where: { status: "QUALIFIED" } },
      },
    });
    ensure(
      round?.rulesVersion === 4 &&
        round.status === "DECIDED" &&
        round.decision?.vetoFinalizedAt &&
        !round.decision.rejected &&
        round.settlement,
      "Choose a final, unrejected V4 decision. Its complete rejection window must be finalized first.",
      409,
    );
    ensure(
      ["WINNER_SELECTED", "ALLOCATION_SELECTED"].includes(round.outcome ?? ""),
      "The source round has no approved allocation.",
      409,
    );
    const settings = round.settlement.rulesSnapshot as Record<string, unknown>;
    const result = round.decision.result as Record<string, unknown>;
    const counts = result.counts as Record<string, string> | undefined;
    ensure(
      counts && typeof counts === "object",
      "Published method supports are unavailable.",
      409,
    );
    ensure(
      new Set(data.caps.map((c) => c.schemeId)).size === data.caps.length &&
        data.caps.length === round.schemes.length &&
        data.caps.every((c) => round.schemes.some((s) => s.id === c.schemeId)),
      "Declare a native cap and wallet for every qualified scheme exactly once.",
    );
    const caps = data.caps.map((c) => ({
      ...c,
      request: nativeAmount(c.request).toString(),
      support: String(counts[c.schemeId] ?? "0"),
    }));
    ensure(
      caps.every((c) => BigInt(c.request) > 0n && /^\d+$/.test(c.support)),
      "Native request caps must be positive.",
    );
    // This opt-in pool reuses a final ranking, never converts the old fiat pool
    // or changes its frozen paid/equal electorate. Native caps are new consent.
    const vault = await tx.chainVault.create({
      data: {
        communityId: data.communityId,
        roundId: round.id,
        creatorId: userId,
        title: data.title,
        contractId: config.contractId,
        collectionClosesAt: closes,
        expiresAt: expires,
        vetoEnabled: false,
        rulesSnapshot: json({
          policy: "NATIVE_POOL_V1",
          assetId: NATIVE_ASSET,
          decimals: 24,
          contractCodeHash: config.codeHash,
          sourceDecision: round.id,
          sourcePublishedAt: round.decision.publishedAt.toISOString(),
          sourceVotingWeight: settings.selectionWeight,
          sourceMethod: settings.selectionMethod,
          allocationPolicy: settings.allocationPolicy,
          rankedSharesBps: settings.rankedSharesBps,
          caps,
          fees: "0",
          veto: "SOURCE_ROUND_FINALIZED",
          custodyTrust:
            "Application controller attests off-chain decisions; contract enforces committed destinations, amounts, nonces and refund ownership.",
        }),
        createdAt: now,
      },
    });
    await event(tx, vault, userId, "NATIVE_POOL_CREATED", {
      roundId: round.id,
      assetId: NATIVE_ASSET,
    });
    return vault;
  });
}
export async function prepareChainAction(
  userId: string,
  input: unknown,
  now = new Date(),
  rpcInput?: NearRpc,
) {
  const data = scopeSchema
    .extend({
      action: z.enum([
        "register",
        "reserve",
        "deposit",
        "commit",
        "execute",
        "recover",
      ]),
      accountId: accountIdSchema,
      amount: z.string().max(40).optional(),
      operationId: z.string().max(128).optional(),
      idempotencyKey: uuid,
    })
    .strict()
    .parse(input);
  const config = liveConfig();
  // Remote reads happen before the local transaction. Intent is checked again
  // under a vault lock; the contract remains authoritative over live balances.
  const pre = await vaultFor(db, userId, data);
  await linked(db, userId, data.accountId);
  const rpc = rpcInput ?? provider().rpc;
  const codeHash = String(
    (pre.rulesSnapshot as Record<string, unknown>).contractCodeHash,
  );
  ensure(
    pre.contractId === config.contractId && codeHash === config.codeHash,
    "This pool uses another configured treasury or code revision.",
    409,
  );
  const deployed = await deployment(rpc, pre.contractId, codeHash);
  if (["register", "commit"].includes(data.action))
    ensure(
      data.accountId === deployed.controller,
      "Select the treasury controller wallet for this action.",
      403,
    );
  const live =
    data.action === "reserve"
      ? null
      : await rpc.view<Record<string, unknown> | null>(
          pre.contractId,
          "get_round",
          { round_id: pre.id },
        );
  if (["deposit", "commit", "execute", "recover"].includes(data.action))
    ensure(
      live?.round_id === pre.id && live.asset_id === NATIVE_ASSET,
      "Register and confirm this pool on NEAR before continuing.",
      409,
    );
  const liveItem =
    data.action === "execute" && data.operationId
      ? await rpc.view(pre.contractId, "get_operation", {
          operation_id: data.operationId,
        })
      : null;
  return atomic(async (tx) => {
    await lock(tx, data.vaultId);
    const vault = await vaultFor(
      tx,
      userId,
      data,
      !(
        ["deposit", "recover"].includes(data.action) ||
        (data.action === "execute" && liveItem?.kind === "REFUND")
      ),
    );
    await linked(tx, userId, data.accountId);
    const rules = vault.rulesSnapshot as Record<string, unknown>;
    const caps = rules.caps as {
      schemeId: string;
      recipient: string;
      request: string;
      support: string;
    }[];
    let method: string,
      args: Record<string, unknown>,
      amount = 0n,
      deposit = 0n,
      recipient = vault.contractId,
      key = `${vault.id}:${data.action}:${data.idempotencyKey}`,
      kind = data.action.toUpperCase();
    if (data.action === "register") {
      ensure(!live, "This native pool is already registered on NEAR.", 409);
      ensure(
        now < vault.collectionClosesAt,
        "The collection deadline has passed.",
        409,
      );
      method = "register_round";
      key = `${vault.id}:register`;
      args = {
        round_id: vault.id,
        asset_id: NATIVE_ASSET,
        collection_end_ns: (
          BigInt(vault.collectionClosesAt.getTime()) * 1000000n
        ).toString(),
        expires_at_ns: (
          BigInt(vault.expiresAt.getTime()) * 1000000n
        ).toString(),
        veto_enabled: vault.vetoEnabled,
        recipients: [...new Set(caps.map((c) => c.recipient))].sort(),
      };
    } else if (data.action === "reserve" || data.action === "deposit") {
      amount = nativeAmount(data.amount ?? "");
      deposit = amount;
      ensure(
        data.action === "reserve" ? amount >= 10n ** 23n : amount > 0n,
        data.action === "reserve"
          ? "Reserve top-ups require at least 0.1 NEAR."
          : "Enter a positive native NEAR amount.",
      );
      ensure(
        data.action === "reserve" || deployed.solvent,
        "Top up the contract operating reserve before collecting principal.",
        409,
      );
      ensure(
        data.action !== "deposit" || now < vault.collectionClosesAt,
        "Collection is closed.",
        409,
      );
      method = data.action === "reserve" ? "top_up_reserve" : "deposit";
      args =
        data.action === "reserve"
          ? { operation_id: key }
          : { round_id: vault.id, asset_id: NATIVE_ASSET, operation_id: key };
      kind = data.action === "reserve" ? "RESERVE" : "DEPOSIT";
    } else if (data.action === "commit") {
      ensure(
        now >= vault.collectionClosesAt && live,
        "Collection must finish before allocation publication.",
        409,
      );
      ensure(
        now < vault.expiresAt && !live.allocation_hash,
        "This pool already has a contract allocation or has reached recovery expiry.",
        409,
      );
      const source = live.contributors as string[];
      ensure(
        Array.isArray(source) && source.length <= 1000,
        "Contribution sources are unavailable or exceed this release's 1,000-source limit.",
        409,
      );
      const received = BigInt(String(live.received));
      const deposits = await tx.chainOperation.findMany({
        where: { vaultId: vault.id, kind: "DEPOSIT", status: "CONFIRMED" },
      });
      const bySource = new Map<string, bigint>();
      for (const d of deposits)
        bySource.set(
          d.expectedSigner,
          (bySource.get(d.expectedSigner) ?? 0n) + BigInt(d.amount.toFixed(0)),
        );
      ensure(
        received > 0n &&
          bySource.size === source.length &&
          [...bySource.values()].reduce((s, n) => s + n, 0n) === received &&
          source.every((s) => bySource.has(s)),
        "Reconcile every on-chain deposit through the app before committing a plan.",
        409,
      );
      const allocation = allocateV3(
        received,
        caps.map((c) => ({
          schemeId: c.schemeId,
          request: BigInt(c.request),
          recipient: c.recipient,
          beneficiaryId: c.schemeId,
          support: BigInt(c.support),
        })),
        rules.allocationPolicy as "WINNER_ALL" | "PROPORTIONAL" | "RANKED_CUTS",
        rules.rankedSharesBps as number[],
      );
      const refunds = proportionalRefunds(
        allocation.refundTotal,
        [...bySource]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([account, amount]) => ({
            sourceAccountId: account,
            userId: account,
            amount,
          })),
      );
      const items: NativePlanItem[] = [
        ...allocation.payouts.map((p) => ({
          operation_id: `plan:${vault.id}:pay:${p.schemeId}`,
          kind: "PAYOUT" as const,
          recipient: p.recipient,
          amount: p.amount.toString(),
        })),
        ...refunds
          .filter((r) => r.refund > 0n)
          .map((r) => ({
            operation_id: nativeRefundOperationId(vault.id, r.sourceAccountId),
            kind: "REFUND" as const,
            recipient: r.sourceAccountId,
            amount: r.refund.toString(),
          })),
      ];
      const hash = allocationHash(vault.id, items);
      if (vault.plan)
        ensure(
          vault.allocationHash === hash,
          "An immutable native allocation already exists.",
          409,
        );
      else
        await tx.chainVault.update({
          where: { id: vault.id },
          data: { allocationHash: hash, plan: json(items), publishedAt: now },
        });
      method = "commit_plan";
      key = `${vault.id}:commit`;
      args = {
        round_id: vault.id,
        asset_id: NATIVE_ASSET,
        allocation_hash: hash,
        items,
      };
    } else if (data.action === "execute") {
      ensure(
        vault.plan && data.operationId,
        "Choose an item from the immutable plan.",
        409,
      );
      const item = (vault.plan as unknown as NativePlanItem[]).find(
        (i) => i.operation_id === data.operationId,
      );
      ensure(item, "Unknown native allocation item.", 404);
      ensure(
        live?.allocation_hash === vault.allocationHash &&
          liveItem?.plan_hash === vault.allocationHash &&
          liveItem.round_id === vault.id &&
          liveItem.kind === item.kind &&
          liveItem.recipient === item.recipient &&
          liveItem.amount === item.amount &&
          ["READY", "FAILED"].includes(String(liveItem.status)),
        "The contract has no matching executable item. Reconcile the recorded plan or receipt.",
        409,
      );
      if (item.kind === "PAYOUT")
        ensure(
          data.accountId === deployed.controller,
          "Select the treasury controller wallet for this payout.",
          403,
        );
      method = "execute";
      key = `${vault.id}:execute:${item.operation_id}`;
      args = {
        round_id: vault.id,
        asset_id: NATIVE_ASSET,
        operation_id: item.operation_id,
      };
      amount = BigInt(item.amount);
      recipient = item.recipient;
      kind = item.kind;
      const previous = await tx.chainOperation.findMany({
        where: {
          vaultId: vault.id,
          method: "execute",
          args: { path: ["operation_id"], equals: item.operation_id },
        },
        orderBy: { createdAt: "desc" },
      });
      if (previous.length) {
        const latest = previous[0];
        if (latest.status === "FAILED") {
          ensure(
            await tx.chainObservation.findFirst({
              where: {
                operationId: latest.id,
                status: "FAILED",
                finality: "FINAL",
              },
            }),
            "Verify the original transaction's final failure before retrying.",
            409,
          );
          key = `${vault.id}:retry:${item.operation_id}:${data.idempotencyKey}`;
        } else key = latest.operationKey;
      }
    } else {
      ensure(
        now >= vault.expiresAt && !vault.plan,
        "Only an expired, uncommitted pool can use recovery refunds.",
        409,
      );
      method = "recovery_refund";
      key = `${vault.id}:recover`;
      args = { round_id: vault.id, asset_id: NATIVE_ASSET };
    }
    const operation = await intent(tx, vault, userId, {
      key,
      kind,
      amount,
      recipient,
      signer: data.accountId,
      method,
      args,
      deposit,
    });
    ensure(
      operation.status === "PREPARED",
      "This operation was submitted. Reconcile its existing identity; do not sign again.",
      409,
    );
    await event(tx, vault, userId, "NATIVE_OPERATION_PREPARED", {
      operationId: operation.id,
      kind,
    });
    return preparedChainOperation(vault, operation);
  });
}
export async function recordChainSubmission(userId: string, input: unknown) {
  liveConfig();
  const { operationId, transactionHash } = z
    .object({ operationId: uuid, transactionHash: transactionHashSchema })
    .strict()
    .parse(input);
  return atomic(async (tx) => {
    const scope = await tx.chainOperation.findFirst({
      where: { id: operationId, actorId: userId },
      select: { vaultId: true },
    });
    ensure(scope, "Operation not found.", 404);
    await lock(tx, scope.vaultId);
    const operation = await tx.chainOperation.findUnique({
      where: { id: operationId },
    });
    ensure(operation?.actorId === userId, "Operation not found.", 404);
    ensure(
      !operation.transactionHash ||
        operation.transactionHash === transactionHash,
      "Reconcile the existing transaction; its identity cannot be replaced.",
      409,
    );
    if (operation.transactionHash === transactionHash) return operation;
    ensure(
      operation.status === "UNKNOWN" && operation.submittedAt,
      "Open the wallet handoff for this operation first.",
      409,
    );
    return tx.chainOperation.update({
      where: { id: operationId },
      data: {
        transactionHash,
        status: "SUBMITTED",
        submittedAt: operation.submittedAt ?? new Date(),
      },
    });
  });
}
export async function authorizeChainWallet(userId: string, input: unknown) {
  const config = liveConfig();
  const { operationId } = z.object({ operationId: uuid }).strict().parse(input);
  const operation = await db.chainOperation.findFirst({
    where: { id: operationId, actorId: userId },
    include: { vault: true },
  });
  ensure(
    operation && operation.status === "PREPARED",
    "This wallet handoff was already started. Recover and reconcile its receipt before signing again.",
    409,
  );
  const instruction = preparedChainOperation(operation.vault, operation);
  ensure(
    config.contractId === instruction.contractId &&
      config.codeHash === instruction.contractCodeHash,
    "This operation uses another configured treasury or code revision.",
    409,
  );
  const deployed = await deployment(
    new NearRpc(config.rpcUrl),
    instruction.contractId,
    instruction.contractCodeHash,
  );
  await atomic(async (tx) => {
    await lock(tx, operation.vaultId);
    const staff = ["REGISTER", "RESERVE", "COMMIT", "PAYOUT"].includes(
      operation.kind,
    );
    await vaultFor(
      tx,
      userId,
      { communityId: operation.vault.communityId, vaultId: operation.vaultId },
      staff,
    );
    await linked(tx, userId, operation.expectedSigner);
    if (["REGISTER", "COMMIT", "PAYOUT"].includes(operation.kind))
      ensure(
        operation.expectedSigner === deployed.controller,
        "Select the treasury controller wallet for this action.",
        403,
      );
    const pending = await tx.chainOperation.findFirst({
      where: {
        vaultId: operation.vaultId,
        expectedSigner: operation.expectedSigner,
        method: operation.method,
        status: { in: ["UNKNOWN", "SUBMITTED"] },
      },
    });
    ensure(
      !pending,
      "Reconcile the existing wallet handoff for this action before opening another.",
      409,
    );
    const updated = await tx.chainOperation.updateMany({
      where: {
        id: operationId,
        actorId: userId,
        status: "PREPARED",
        transactionHash: null,
      },
      data: { status: "UNKNOWN", submittedAt: new Date() },
    });
    ensure(
      updated.count === 1,
      "This wallet handoff was already started. Recover and reconcile its receipt before signing again.",
      409,
    );
  });
  return instruction;
}
export async function reconcileChainOperation(
  userId: string,
  input: unknown,
  adapterInput?: NearTestnetProvider,
) {
  liveConfig();
  const { operationId } = z.object({ operationId: uuid }).strict().parse(input);
  const operation = await db.chainOperation.findUnique({
    where: { id: operationId },
    include: { vault: true },
  });
  ensure(operation, "Operation not found.", 404);
  ensure(operation.actorId === userId, "Operation not found.", 404);
  ensure(
    operation.transactionHash,
    "No transaction identity is available. Recover the wallet receipt before retrying.",
    409,
  );
  if (["CONFIRMED", "FAILED"].includes(operation.status))
    return { status: operation.status };
  const adapter = adapterInput ?? provider(),
    observation = await adapter.observe(
      preparedChainOperation(operation.vault, operation),
      operation.transactionHash,
    );
  let recoveryPlan: {
    hash: string;
    items: NativePlanItem[];
    publishedAt: Date;
  } | null = null;
  // A successful execution call is insufficient unless the contract's transfer
  // callback also reports SUCCESS for the exact stored destination and amount.
  if (
    observation.status === "CONFIRMED" &&
    ["PAYOUT", "REFUND", "DEPOSIT", "RESERVE"].includes(operation.kind)
  ) {
    try {
      if (
        !(await matchesNativeReceipt(adapter.rpc, operation.vault, operation))
      )
        observation.status = "UNKNOWN";
    } catch {
      observation.status = "UNKNOWN";
    }
  }
  if (observation.status === "CONFIRMED") {
    try {
      const custody = await adapter.rpc.view(
        operation.vault.contractId,
        "get_custody",
        {},
      );
      const account = await adapter.rpc.call("query", {
        request_type: "view_account",
        finality: "final",
        account_id: operation.vault.contractId,
      });
      observation.evidence = {
        ...observation.evidence,
        custodyObservation: {
          contractId: operation.vault.contractId,
          observedAt: new Date().toISOString(),
          custody,
          account,
        },
      };
    } catch {
      observation.evidence = {
        ...observation.evidence,
        custodyObservation: null,
      };
    }
    if (operation.method === "recovery_refund") {
      try {
        const round = await adapter.rpc.view(
          operation.vault.contractId,
          "get_round",
          { round_id: operation.vault.id },
        );
        ensure(
          round.round_id === operation.vault.id &&
            round.asset_id === NATIVE_ASSET &&
            round.recovery === true &&
            Array.isArray(round.operation_ids),
          "Invalid recovery plan.",
          409,
        );
        const items: NativePlanItem[] = [];
        for (const id of round.operation_ids as string[]) {
          const item = await adapter.rpc.view(
            operation.vault.contractId,
            "get_operation",
            { operation_id: id },
          );
          ensure(
            item.round_id === operation.vault.id &&
              item.asset_id === NATIVE_ASSET &&
              item.kind === "REFUND" &&
              item.plan_hash === round.allocation_hash &&
              typeof item.recipient === "string" &&
              typeof item.amount === "string",
            "Recovery item is not source bound.",
            409,
          );
          items.push({
            operation_id: id,
            kind: "REFUND",
            recipient: item.recipient,
            amount: item.amount,
          });
        }
        recoveryPlan = {
          hash: String(round.allocation_hash),
          items,
          publishedAt: new Date(
            Number(BigInt(String(round.published_at_ns)) / 1000000n),
          ),
        };
      } catch {
        observation.status = "UNKNOWN";
      }
    }
  }
  return atomic(async (tx) => {
    await lock(tx, operation.vaultId);
    const current = await tx.chainOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (["CONFIRMED", "FAILED"].includes(current.status))
      return { status: current.status };
    if (recoveryPlan) {
      const currentVault = await tx.chainVault.findUniqueOrThrow({
        where: { id: operation.vaultId },
      });
      if (!currentVault.plan)
        await tx.chainVault.update({
          where: { id: currentVault.id },
          data: {
            allocationHash: recoveryPlan.hash,
            plan: json(recoveryPlan.items),
            publishedAt: recoveryPlan.publishedAt,
          },
        });
    }
    await tx.chainObservation.create({
      data: {
        vaultId: operation.vaultId,
        operationId: operation.id,
        rpcUrl: new URL(adapter.rpc.url).origin,
        transactionHash: operation.transactionHash!,
        finality: observation.status === "UNKNOWN" ? "UNESTABLISHED" : "FINAL",
        status: observation.status,
        receiptIds: json(observation.receiptIds),
        evidence: json(observation.evidence),
      },
    });
    await tx.chainOperation.update({
      where: { id: operation.id },
      data: {
        status: observation.status,
        confirmedAt: observation.status === "CONFIRMED" ? new Date() : null,
      },
    });
    await event(tx, operation.vault, userId, "NATIVE_OPERATION_OBSERVED", {
      operationId: operation.id,
      status: observation.status,
    });
    return { status: observation.status };
  });
}
export async function getChainWorkspace(userId: string, communityId: string) {
  await access(db, communityId, userId);
  const [vaults, wallets, rounds] = await Promise.all([
    db.chainVault.findMany({
      where: { communityId },
      orderBy: { createdAt: "desc" },
      take: 101,
      include: {
        operations: { orderBy: { createdAt: "desc" }, take: 201 },
        round: { select: { title: true } },
        observations: {
          where: { status: "CONFIRMED" },
          orderBy: { observedAt: "desc" },
          take: 20,
        },
      },
    }),
    db.walletLink.findMany({
      where: { userId, network: "testnet", revokedAt: null },
      select: { accountId: true },
    }),
    db.fundingRound.findMany({
      where: {
        communityId,
        rulesVersion: 4,
        status: "DECIDED",
        outcome: { in: ["WINNER_SELECTED", "ALLOCATION_SELECTED"] },
        decision: { vetoFinalizedAt: { not: null }, rejected: false },
      },
      select: {
        id: true,
        title: true,
        schemes: {
          where: { status: "QUALIFIED" },
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  ensure(
    vaults.length <= 100,
    "More than 100 native pools require a narrower workspace.",
    422,
  );
  return {
    vaults,
    wallets,
    rounds,
    enabled: process.env.FUNDICATE_MODE === "near-testnet",
  };
}
export async function chainAnalytics(tx: Tx, communityIds: string[]) {
  const vaults = await tx.chainVault.findMany({
    where: { communityId: { in: communityIds } },
    include: {
      community: { select: { slug: true } },
      operations: true,
      observations: {
        where: { status: "CONFIRMED" },
        orderBy: { observedAt: "desc" },
        take: 20,
      },
    },
    take: 501,
  });
  ensure(
    vaults.length <= 500,
    "Narrow the native treasury report to at most 500 pools.",
    422,
  );
  let received = 0n,
    paid = 0n,
    refunded = 0n,
    reserved = 0n,
    reserve = 0n,
    unknown = 0,
    operations = 0;
  for (const v of vaults)
    for (const o of v.operations) {
      operations++;
      if (o.status === "UNKNOWN" || o.status === "SUBMITTED") unknown++;
      if (o.status !== "CONFIRMED") continue;
      const amount = BigInt(o.amount.toFixed(0));
      if (o.kind === "DEPOSIT") received += amount;
      if (o.kind === "PAYOUT") paid += amount;
      if (o.kind === "REFUND") refunded += amount;
      if (o.kind === "RESERVE") reserve += amount;
    }
  for (const v of vaults)
    if (v.plan) {
      const planned = (v.plan as unknown as NativePlanItem[]).reduce(
        (s, i) => s + BigInt(i.amount),
        0n,
      );
      const completed = v.operations
        .filter(
          (o) =>
            o.status === "CONFIRMED" && ["PAYOUT", "REFUND"].includes(o.kind),
        )
        .reduce((s, o) => s + BigInt(o.amount.toFixed(0)), 0n);
      reserved += planned - completed;
    }
  const held = received - paid - refunded - reserved;
  ensure(
    held >= 0n && reserved >= 0n,
    "Native observed principal does not reconcile; query contract custody before further execution.",
    409,
  );
  const contractSnapshots = new Map<string, { at: string; reserve: bigint }>();
  for (const v of vaults)
    for (const o of v.observations) {
      const evidence = o.evidence as Record<string, Prisma.JsonValue>;
      const snapshot = evidence.custodyObservation as {
        contractId?: string;
        observedAt?: string;
        custody?: {
          asset_id?: string;
          operational_surplus_including_in_flight?: string;
        };
      } | null;
      if (
        snapshot?.contractId === v.contractId &&
        snapshot.observedAt &&
        snapshot.custody?.asset_id === NATIVE_ASSET &&
        /^\d+$/.test(
          snapshot.custody.operational_surplus_including_in_flight ?? "",
        )
      ) {
        const old = contractSnapshots.get(v.contractId);
        if (!old || old.at < snapshot.observedAt)
          contractSnapshots.set(v.contractId, {
            at: snapshot.observedAt,
            reserve: BigInt(
              snapshot.custody.operational_surplus_including_in_flight!,
            ),
          });
      }
    }
  const allObserved =
    contractSnapshots.size === new Set(vaults.map((v) => v.contractId)).size &&
    vaults.length > 0;
  const operatingReserve = allObserved
    ? [...contractSnapshots.values()]
        .reduce((s, v) => s + v.reserve, 0n)
        .toString()
    : null;
  const reserveObservedAt = allObserved
    ? [...contractSnapshots.values()].map((s) => s.at).sort()[0]
    : null;
  return {
    groups: vaults.length
      ? [
          {
            network: "testnet",
            assetId: NATIVE_ASSET,
            decimals: 24,
            received: received.toString(),
            held: held.toString(),
            reserved: reserved.toString(),
            paid: paid.toString(),
            refunded: refunded.toString(),
            operatingReserve,
            operatingTopups: reserve.toString(),
            reserveObservedAt,
            operations,
            unknown,
          },
        ]
      : [],
    observations: vaults.flatMap((v) =>
      v.observations.map((o) => ({
        id: o.id,
        vaultId: v.id,
        roundId: v.roundId,
        communitySlug: v.community.slug,
        transactionHash: o.transactionHash,
        network: v.network,
        assetId: v.assetId,
        decimals: v.decimals,
        kind:
          v.operations.find((p) => p.id === o.operationId)?.kind ??
          "OBSERVATION",
        status: o.status,
        observedAt: o.observedAt.toISOString(),
      })),
    ),
  };
}
