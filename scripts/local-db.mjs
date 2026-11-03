import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
import "dotenv/config";

const root = resolve(".local");
const data = join(root, "postgres");
const bin =
  process.env.PG_BIN ||
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/18/bin"
    : "/usr/lib/postgresql/18/bin");
const exe = (name) =>
  join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const run = (name, args, options = {}) =>
  execFileSync(exe(name), args, {
    windowsHide: true,
    encoding: "utf8",
    ...options,
  });
mkdirSync(root, { recursive: true });
if (process.argv[2] === "stop") {
  if (existsSync(join(data, "postmaster.pid"))) {
    try {
      run("pg_ctl", ["-D", data, "stop", "-m", "fast"]);
    } catch {
      console.error(
        "PostgreSQL could not be signalled. A Codex sandbox may not control a process started by another execution session. Run npm run db:stop from your normal terminal. The database files are preserved.",
      );
      process.exit(1);
    }
  }
  console.log("Project-local PostgreSQL stopped.");
  process.exit(0);
}
if (!existsSync(exe("initdb")))
  throw new Error(
    "PostgreSQL binaries not found. Set PG_BIN, or configure DATABASE_URL and run db:migrate with an existing PostgreSQL instance.",
  );
if (existsSync(".env") && !existsSync(join(data, "PG_VERSION")))
  throw new Error(
    "An .env already exists. Use its external database, or explicitly move it before creating a local cluster.",
  );
let password;
if (!existsSync(join(data, "PG_VERSION"))) {
  password = randomBytes(24).toString("hex");
  const pwfile = join(root, "init-password");
  writeFileSync(pwfile, password);
  try {
    run("initdb", [
      "-D",
      data,
      "-U",
      "fundicate",
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
      `--pwfile=${pwfile}`,
    ]);
  } finally {
    unlinkSync(pwfile);
  }
  writeFileSync(
    ".env",
    `DATABASE_URL="postgresql://fundicate:${password}@127.0.0.1:54329/fundicate"\nAPP_ORIGIN="http://127.0.0.1:3000"\nALLOW_DEMO_SEED="true"\n`,
  );
} else {
  password = new URL(
    readFileSync(".env", "utf8").match(/DATABASE_URL="([^"]+)"/)[1],
  ).password;
}
const config = {
  host: "127.0.0.1",
  port: 54329,
  user: "fundicate",
  password,
  database: "postgres",
  connectionTimeoutMillis: 5000,
};
let client = new pg.Client(config);
let startedHere = false;
try {
  await client.connect();
} catch {
  await client.end();
  run(
    "pg_ctl",
    [
      "-D",
      data,
      "-l",
      join(root, "postgres.log"),
      "-o",
      "-h 127.0.0.1 -p 54329",
      "-w",
      "start",
    ],
    { stdio: "ignore" },
  );
  startedHere = true;
  client = new pg.Client(config);
  await client.connect();
}
try {
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname='fundicate'",
  );
  if (!exists.rowCount) await client.query("CREATE DATABASE fundicate");
} finally {
  await client.end();
}
console.log(
  "PostgreSQL ready at 127.0.0.1:54329. Credentials are stored only in ignored .env.",
);
if (process.argv.includes("--keep-alive")) {
  console.log(
    "Database keeper active. Keep this terminal/session open; type stop or press Ctrl+C to finish.",
  );
  const keeper = setInterval(() => {}, 30000);
  let stopping = false;
  const finish = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(keeper);
    if (startedHere) {
      try {
        run("pg_ctl", ["-D", data, "stop", "-m", "fast"], { stdio: "ignore" });
      } catch {
        console.error("The database could not be signalled by its keeper.");
        process.exit(1);
      }
    }
    console.log(
      startedHere
        ? "PostgreSQL stopped cleanly."
        : "Database keeper finished; the existing external process was preserved.",
    );
    process.exit(0);
  };
  process.on("SIGINT", finish);
  process.on("SIGTERM", finish);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    if (chunk.trim() === "stop") finish();
  });
  process.stdin.resume();
}
