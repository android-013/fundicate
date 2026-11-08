import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const allowed = new Set(["--docker", "--origin", "--prepare-only"]);
for (let index = 0; index < args.length; index++) {
  if (!allowed.has(args[index]))
    throw new Error("Use --docker [--origin URL] [--prepare-only].");
  if (args[index] === "--origin") index++;
}
if (!args.includes("--docker")) {
  console.log(
    "Native setup: configure DATABASE_URL and APP_ORIGIN, run npm ci, npm run db:migrate, npm run doctor, npm run build and npm start. Demo seeding is optional and development-only. For isolated containers use node scripts/bootstrap.mjs --docker.",
  );
  process.exit(0);
}
const originIndex = args.indexOf("--origin");
const originValue =
  originIndex < 0 ? "http://127.0.0.1:3000" : args[originIndex + 1];
let origin;
try {
  origin = new URL(originValue);
} catch {
  throw new Error("Provide a valid --origin URL.");
}
if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  (origin.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))
)
  throw new Error(
    "Use a loopback HTTP origin for local use or your public HTTPS origin.",
  );
const directory = resolve(".local/deploy");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const envPath = resolve(directory, "compose.env");
if (existsSync(envPath)) {
  const saved = readFileSync(envPath, "utf8");
  if (!saved.includes(`APP_ORIGIN=${origin.origin}\n`))
    throw new Error(
      "Existing container configuration has a different origin. Edit the ignored .local/deploy/compose.env deliberately; credentials and database volumes were preserved.",
    );
  if (!/^RUNTIME_DATABASE_URL=/m.test(saved)) {
    const ownerLine = saved.match(/^DATABASE_URL=(.+)$/m)?.[1];
    let runtimeUrl;
    try {
      runtimeUrl = new URL(ownerLine);
      if (!["postgres:", "postgresql:"].includes(runtimeUrl.protocol))
        throw new Error();
    } catch {
      throw new Error(
        "Existing deployment DATABASE_URL is invalid; its value was not logged.",
      );
    }
    runtimeUrl.username = "fundicate_app";
    runtimeUrl.password = randomBytes(32).toString("hex");
    writeFileSync(
      envPath,
      `${saved.endsWith("\n") ? "" : "\n"}RUNTIME_DATABASE_URL=${runtimeUrl.href}\n`,
      { flag: "a", mode: 0o600 },
    );
  }
} else {
  const password = randomBytes(32).toString("hex");
  const runtimePassword = randomBytes(32).toString("hex");
  writeFileSync(
    envPath,
    `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://fundicate:${password}@db:5432/fundicate\nRUNTIME_DATABASE_URL=postgresql://fundicate_app:${runtimePassword}@db:5432/fundicate\nAPP_ORIGIN=${origin.origin}\nFUNDICATE_MODE=standalone\nDATABASE_ALLOW_INSECURE_INTERNAL=true\nALLOW_DEMO_SEED=false\n`,
    { mode: 0o600, flag: "wx" },
  );
  if (process.platform !== "win32") chmodSync(envPath, 0o600);
}
if (args.includes("--prepare-only")) {
  console.log(
    "Prepared ignored .local/deploy/compose.env. Credentials were generated locally and were not printed. No container or database was started.",
  );
  process.exit(0);
}
const result = spawnSync(
  "docker",
  ["compose", "--env-file", envPath, "up", "--build", "-d", "--wait"],
  { stdio: "inherit", windowsHide: true },
);
if (result.error?.code === "ENOENT")
  throw new Error(
    "Docker is unavailable. Install/start Docker Engine with Compose v2, then rerun; the prepared configuration was preserved.",
  );
process.exitCode = result.status ?? 1;
if (!process.exitCode)
  console.log(
    `Fundicate is ready on loopback port3000. Configured origin: ${origin.origin}. Public HTTPS origins require your TLS reverse proxy. No demo accounts or live provider were enabled.`,
  );
