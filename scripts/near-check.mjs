import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tsImport } from "tsx/esm/api";

const flags = process.argv.slice(2);
try {
  if (flags.length === 1 && flags[0] === "--code-hash") {
    const artifact = new URL(
      "../contracts/near-treasury/target/wasm32-unknown-unknown/release/fundicate_near_treasury.wasm",
      import.meta.url,
    );
    const wasm = readFileSync(artifact);
    if (!wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
      throw new Error(
        "Build the reviewed WASM with npm run near:contract first.",
      );
    const digest = createHash("sha256").update(wasm).digest();
    const alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let value = BigInt(`0x${digest.toString("hex")}`);
    let encoded = "";
    while (value > 0n) {
      encoded = alphabet[Number(value % 58n)] + encoded;
      value /= 58n;
    }
    for (const byte of digest) {
      if (byte !== 0) break;
      encoded = "1" + encoded;
    }
    console.log(encoded);
  } else {
    if (flags.length)
      throw new Error(
        "Use npm run near:check or npm run near:check -- --code-hash.",
      );
    const { validateRuntimeConfig } = await tsImport(
      "../src/lib/runtime-config.ts",
      import.meta.url,
    );
    const { NearRpc, verifyNearDeployment } = await tsImport(
      "../src/lib/near-rpc.ts",
      import.meta.url,
    );
    const { near } = validateRuntimeConfig();
    if (!near)
      throw new Error(
        "Set FUNDICATE_MODE=near-testnet and the treasury settings in your runtime environment.",
      );
    const state = await verifyNearDeployment(
      new NearRpc(near.rpcUrl),
      near.contractId,
      near.codeHash,
    );
    console.log(
      JSON.stringify(
        {
          status: state.solvent ? "ready" : "reserve-needed",
          network: near.network,
          contractId: near.contractId,
          codeHash: near.codeHash,
          controller: state.controller,
        },
        null,
        2,
      ),
    );
    if (!state.solvent) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error?.code === "ENOENT"
      ? "Build the reviewed WASM with npm run near:contract first."
      : error.message,
  );
  process.exitCode = 1;
}
