import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const contractRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(contractRoot, "../..");
const portableRoot = join(projectRoot, ".local/contract-toolchain");
const portableBin = join(
  portableRoot,
  "rustup/toolchains/1.95.0-x86_64-pc-windows-gnu/bin",
);
const portable =
  process.platform === "win32" && existsSync(join(portableBin, "cargo.exe"));
const cargo =
  process.env.FUNDICATE_CARGO ??
  (portable ? join(portableBin, "cargo.exe") : "cargo");
const env = {
  ...process.env,
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "2",
};
if (portable) {
  env.RUSTUP_HOME = join(portableRoot, "rustup");
  env.CARGO_HOME = join(portableRoot, "cargo");
  env.RUSTC = join(portableBin, "rustc.exe");
  const tools = [portableBin, join(portableRoot, "nasm/nasm-2.16.03")];
  if (existsSync("C:/msys64/mingw64/bin/gcc.exe"))
    tools.push("C:/msys64/mingw64/bin");
  env.PATH = [...tools, env.PATH ?? ""].join(delimiter);
}
// GNU dlltool cannot quote its intermediate assembler paths containing spaces.
// Only build artifacts use this temporary directory; canonical source is never copied.
if (process.platform === "win32" && projectRoot.includes(" ")) {
  const key = createHash("sha256")
    .update(projectRoot)
    .digest("hex")
    .slice(0, 12);
  const buildRoot =
    process.env.FUNDICATE_CONTRACT_BUILD_ROOT ??
    join(tmpdir(), `fundicate-contract-${key}`);
  env.CARGO_TARGET_DIR ??= join(buildRoot, "target");
  env.TEMP = join(buildRoot, "temp");
  env.TMP = env.TEMP;
  mkdirSync(env.TEMP, { recursive: true });
}
for (const args of [
  ["fmt", "--", "--check"],
  ["test", "--locked"],
  ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown"],
]) {
  process.stdout.write(`Contract check: cargo ${args.join(" ")}\n`);
  const result = spawnSync(cargo, args, {
    cwd: contractRoot,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const suffix = "wasm32-unknown-unknown/release/fundicate_near_treasury.wasm";
const artifact = join(contractRoot, "target", suffix);
const built = join(
  env.CARGO_TARGET_DIR ?? join(contractRoot, "target"),
  suffix,
);
if (resolve(built) !== resolve(artifact)) {
  mkdirSync(dirname(artifact), { recursive: true });
  copyFileSync(built, artifact);
}
const bytes = readFileSync(artifact);
if (!bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
  throw new Error("Expected a WebAssembly v1 module");
process.stdout.write(
  `${JSON.stringify({ contract: "fundicate-near-treasury", sdk: "5.30.1", rust: "1.95.0", artifact, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })}\n`,
);
