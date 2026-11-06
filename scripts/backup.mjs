import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const quoteIdentifier = (value) => '"' + value.replaceAll('"', '""') + '"';
export function databaseUrl(raw = process.env.DATABASE_URL) {
  try {
    const value = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(value.protocol) || !value.pathname.slice(1)) throw new Error();
    return value;
  } catch { throw new Error("A valid PostgreSQL DATABASE_URL is required; its value was not logged."); }
}
export function pgEnvironment(url) {
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: url.searchParams.get("sslmode") ?? process.env.PGSSLMODE ?? "prefer",
    ...(url.searchParams.has("sslrootcert") ? { PGSSLROOTCERT: url.searchParams.get("sslrootcert") } : {}),
  };
}
export function pgTool(name, args, url) {
  const command = process.env.PG_BIN ? join(process.env.PG_BIN, name + (process.platform === "win32" ? ".exe" : "")) : name;
  const result = spawnSync(command, args, { env: pgEnvironment(url), windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${name} failed. Check PostgreSQL client/server versions, file permissions and database access. Private diagnostics were withheld.`);
  return result.stdout;
}
export async function databaseManifest(client) {
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const manifest = [];
  for (const { tablename } of tables.rows) {
    const rows = await client.query(`SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),'')) AS hash FROM (SELECT md5(to_jsonb(t)::text) AS row_hash FROM ${quoteIdentifier(tablename)} AS t) AS contents`);
    manifest.push({ table: tablename, rows: rows.rows[0].count, contentHash: rows.rows[0].hash });
  }
  return manifest;
}
export async function financialIntegrity(client) {
  const available = new Set((await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map((row) => row.tablename));
  const results = [];
  for (const [label, sql, tables] of [
    ["legacy-postings-balanced", 'SELECT COUNT(*)::int AS violations FROM (SELECT "transactionId" FROM "LedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0) AS bad', ["LedgerEntry"]],
    ["round-postings-balanced", 'SELECT COUNT(*)::int AS violations FROM (SELECT "transactionId" FROM "RoundLedgerEntry" GROUP BY "transactionId" HAVING SUM(amount)<>0) AS bad', ["RoundLedgerEntry"]],
    ["round-account-reconciliation", 'SELECT COUNT(*)::int AS violations FROM "RoundAccount" AS a LEFT JOIN (SELECT "accountId",SUM(amount) AS total FROM "RoundLedgerEntry" GROUP BY "accountId") AS e ON e."accountId"=a.id WHERE a.balance<>COALESCE(e.total,0)', ["RoundAccount", "RoundLedgerEntry"]],
    ["legacy-account-reconciliation", 'SELECT COUNT(*)::int AS violations FROM "TreasuryAccount" AS a LEFT JOIN (SELECT "accountId",SUM(amount) AS total FROM "LedgerEntry" GROUP BY "accountId") AS e ON e."accountId"=a.id WHERE a.balance<>COALESCE(e.total,0)', ["TreasuryAccount", "LedgerEntry"]],
    ["round-principal-conservation", 'SELECT COUNT(*)::int AS violations FROM "RoundSettlement" AS s WHERE s.received<>s.paid+s.refunded+COALESCE((SELECT SUM(a.balance) FROM "RoundAccount" a WHERE a."roundId"=s."roundId" AND a.key IN (\'HELD\',\'RESERVED\')),0)', ["RoundSettlement", "RoundAccount"]],
  ]) {
    if (!tables.every((table) => available.has(table))) continue;
    const { rows } = await client.query(sql);
    if (rows[0].violations !== 0) throw new Error(`Financial integrity failed: ${label}.`);
    results.push(label);
  }
  return results;
}
export async function createBackup(raw, output) {
  const url = databaseUrl(raw);
  const file = resolve(output ?? `.local/backups/fundicate-${Date.now()}-${process.pid}.dump`);
  if (existsSync(file) || existsSync(file + ".manifest.json")) throw new Error("Backup target already exists; no file was overwritten.");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query("SELECT pg_export_snapshot() AS snapshot");
    const manifest = await databaseManifest(client);
    const financialChecks = await financialIntegrity(client);
    pgTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--snapshot=${rows[0].snapshot}`, "--file", file], url);
    if (process.platform !== "win32") chmodSync(file, 0o600);
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    const record = { version: 1, createdAt: new Date().toISOString(), format: "postgresql-custom", sha256: hash, tables: manifest, financialChecks };
    writeFileSync(file + ".manifest.json", JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await client.query("COMMIT");
    return { file, manifest: record };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { await client.end(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length && (args[0] !== "--output" || args.length !== 2)) throw new Error("Use node scripts/backup.mjs [--output PATH].");
  try {
    const result = await createBackup(process.env.DATABASE_URL, args[1]);
    console.log(JSON.stringify({ status: "ok", file: result.file, sha256: result.manifest.sha256, tables: result.manifest.tables.length, financialChecks: result.manifest.financialChecks }));
  } catch { console.error("Backup failed; no existing file or database was overwritten. Check configuration, PostgreSQL tools and database integrity. Partial output, if any, was retained for inspection."); process.exitCode = 1; }
}
