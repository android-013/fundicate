import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { databaseUrl, quoteIdentifier } from "./backup.mjs";

if (!process.argv.includes("--isolated") || process.env.NODE_ENV === "production") throw new Error("The fictional large demo requires --isolated and refuses production. It never seeds or resets DATABASE_URL.");
const original = databaseUrl();
const adminUrl = new URL(original); adminUrl.pathname = "/postgres";
const name = `fundicate_demo_large_${Date.now()}_${process.pid}`;
const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
await admin.connect();
try { await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`); }
finally { await admin.end(); }
const demoUrl = new URL(original); demoUrl.pathname = "/" + name;
const env = { ...process.env, DATABASE_URL: demoUrl.href, ALLOW_LARGE_ISOLATED_DEMO: "true", NODE_ENV: "development", FUNDICATE_MODE: "standalone" };
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["node_modules/tsx/dist/cli.mjs", "scripts/demo-large.ts"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) {
    console.error(`Large demo failed; isolated database ${name} was retained for inspection. The original database was not modified.`);
    process.exitCode = result.status ?? 1;
    break;
  }
}
if (!process.exitCode) console.log(JSON.stringify({ status: "ok", database: name, originalDatabasePreserved: true, connection: "Use the same host/port/user as your local DATABASE_URL and change only its database name. Keep credentials in your ignored environment file.", start: "Use a separate APP_ORIGIN/port when previewing this database. Never overwrite an existing .env." }));
