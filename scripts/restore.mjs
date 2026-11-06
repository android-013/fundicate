import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { databaseUrl, databaseManifest, financialIntegrity, pgTool, quoteIdentifier } from "./backup.mjs";

/** Creates a new, distinctly named recovery database. Never cleans/drops/replaces a database. */
export async function restoreBackup(raw, input, name) {
  if (!/^fundicate_restore_\d+_\d+$/.test(name)) throw new Error("Recovery targets must be new fundicate_restore_TIMESTAMP_PID databases.");
  const source = databaseUrl(raw);
  if (source.pathname === "/" + name) throw new Error("Recovery target cannot be the source database.");
  const file = resolve(input);
  const manifest = JSON.parse(readFileSync(file + ".manifest.json", "utf8"));
  if (manifest.version !== 1 || manifest.format !== "postgresql-custom" || !Array.isArray(manifest.tables)) throw new Error("Unsupported backup manifest.");
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== manifest.sha256) throw new Error("Backup checksum mismatch; restore refused.");
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    if ((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])).rowCount) throw new Error("Recovery target exists; refusing to overwrite it.");
    await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  } finally { await admin.end(); }
  const restoredUrl = new URL(source);
  restoredUrl.pathname = "/" + name;
  // Exit-on-error and a single transaction prevent partial data from appearing complete.
  pgTool("pg_restore", ["--no-owner", "--no-privileges", "--single-transaction", "--exit-on-error", "--dbname", name, file], restoredUrl);
  const client = new pg.Client({ connectionString: restoredUrl.href, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const actual = await databaseManifest(client);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.tables)) throw new Error("Restored table counts/content hashes differ from the exported snapshot.");
    const financialChecks = await financialIntegrity(client);
    return { database: name, tables: actual.length, financialChecks, matchedSnapshot: true, sourcePreserved: true };
  } finally { await client.end(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== "--input" || args[2] !== "--database" || args[4] !== "--trusted-backup") throw new Error("Use node scripts/restore.mjs --input PATH --database fundicate_restore_TIMESTAMP_PID --trusted-backup. Only restore backups from a source you trust.");
  try { console.log(JSON.stringify({ status: "ok", ...await restoreBackup(process.env.DATABASE_URL, args[1], args[3]) })); }
  catch { console.error("Recovery failed; the source and pre-existing databases were preserved. Inspect the newly created recovery database and trusted archive privately. No URL or credentials were logged."); process.exitCode = 1; }
}
