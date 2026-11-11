import "dotenv/config";
import { tsImport } from "tsx/esm/api";

const flags = process.argv.slice(2);
let db;
try {
  const pool =
    flags.length === 2 && flags[0] === "--pool"
      ? flags[1]
      : flags.length === 0
        ? process.env.NEAR_EVIDENCE_POOL_ID
        : undefined;
  if (!pool || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(pool))
    throw new Error("Use npm run near:evidence -- --pool <pool ID>.");

  const { validateRuntimeConfig } = await tsImport(
    "../src/lib/runtime-config.ts",
    import.meta.url,
  );
  const { NearRpc, NearTestnetProvider, verifyNearDeployment } = await tsImport(
    "../src/lib/near-rpc.ts",
    import.meta.url,
  );
  const { matchesNativeReceipt, preparedChainOperation } = await tsImport(
    "../src/lib/chain-service.ts",
    import.meta.url,
  );
  ({ db } = await tsImport("../src/lib/db.ts", import.meta.url));
  const { near } = validateRuntimeConfig();
  if (!near)
    throw new Error("Enable NEAR testnet mode and configure the treasury.");
  const vault = await db.chainVault.findUnique({
    where: { id: pool },
    include: {
      operations: {
        where: {
          status: "CONFIRMED",
          kind: { in: ["DEPOSIT", "PAYOUT", "REFUND"] },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (
    !vault ||
    vault.contractId !== near.contractId ||
    vault.rulesSnapshot.contractCodeHash !== near.codeHash
  )
    throw new Error(
      "Use a pool registered on the configured treasury with the reviewed WASM hash.",
    );
  if (
    !["DEPOSIT", "PAYOUT", "REFUND"].every((kind) =>
      vault.operations.some((operation) => operation.kind === kind),
    )
  )
    throw new Error("Confirm a deposit, payout and refund in Fundicate first.");

  const rpc = new NearRpc(near.rpcUrl);
  const adapter = new NearTestnetProvider(rpc);
  const deployment = await verifyNearDeployment(
    rpc,
    near.contractId,
    near.codeHash,
  );
  const transactions = [];
  for (const operation of vault.operations) {
    const expected = preparedChainOperation(vault, operation);
    const observed = await adapter.observe(expected, operation.transactionHash);
    if (
      observed.status !== "CONFIRMED" ||
      !(await matchesNativeReceipt(rpc, vault, operation))
    )
      throw new Error(
        `Could not independently verify the ${operation.kind} transaction for this pool.`,
      );
    transactions.push({
      kind: operation.kind,
      amountYocto: operation.amount.toFixed(0),
      signer: expected.signerId,
      receiver: expected.contractId,
      recipient: expected.transfer?.recipient ?? expected.contractId,
      contractOperationId: expected.args.operation_id,
      transactionHash: observed.transactionHash,
      receiptIds: observed.receiptIds,
      finality: "FINAL",
    });
  }
  const round = await rpc.view(near.contractId, "get_round", {
    round_id: pool,
  });
  if (
    round?.round_id !== pool ||
    round.asset_id !== "near:testnet:NEAR" ||
    round.allocation_hash !== vault.allocationHash
  )
    throw new Error(
      "The on-chain round or allocation hash does not match Fundicate.",
    );
  for (const [kind, field] of [
    ["DEPOSIT", "received"],
    ["PAYOUT", "paid"],
    ["REFUND", "refunded"],
  ]) {
    const amount = transactions
      .filter((row) => row.kind === kind)
      .reduce((total, row) => total + BigInt(row.amountYocto), 0n);
    if (amount !== BigInt(round[field]))
      throw new Error(
        `The chain ${field} total differs from the verified receipts.`,
      );
  }
  if (
    BigInt(round.received) !== BigInt(round.paid) + BigInt(round.refunded) ||
    BigInt(round.in_flight) !== 0n
  )
    throw new Error(
      "Complete settlement of the entire pool before exporting final evidence.",
    );
  console.log(
    JSON.stringify(
      {
        status: "verified",
        network: "testnet",
        assetId: "near:testnet:NEAR",
        decimals: 24,
        poolId: pool,
        sourceDecisionId: vault.roundId,
        treasury: near.contractId,
        controller: deployment.controller,
        codeHash: near.codeHash,
        allocationHash: round.allocation_hash,
        verifiedAt: new Date().toISOString(),
        totalsYocto: {
          received: round.received,
          paid: round.paid,
          refunded: round.refunded,
        },
        transactions,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
