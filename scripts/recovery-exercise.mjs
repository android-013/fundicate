import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { databaseUrl, databaseManifest, createBackup, quoteIdentifier, financialIntegrity } from "./backup.mjs";
import { restoreBackup } from "./restore.mjs";

if (!process.argv.includes("--isolated")) throw new Error("Use --isolated to create two unique throwaway recovery databases. Existing databases are never restored over.");
const source = databaseUrl();
const sourceName = `fundicate_recovery_${Date.now()}_${process.pid}`;
const restoreName = `fundicate_restore_${Date.now()}_${process.pid}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
await admin.connect();
let fixtureCreated = false;
let restoreCreated = false;
try {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(sourceName)}`); fixtureCreated = true;
  const fixtureUrl = new URL(source); fixtureUrl.pathname = "/" + sourceName;
  const migrate = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: fixtureUrl.href }, stdio: "inherit", windowsHide: true });
  if (migrate.status !== 0) throw new Error("Isolated recovery migration failed.");
  const fixture = new pg.Client({ connectionString: fixtureUrl.href });
  await fixture.connect();
  const actor = randomUUID(), community = randomUUID(), external = randomUUID(), treasury = randomUUID(), transaction = randomUUID();
  try {
    await fixture.query("BEGIN");
    await fixture.query('INSERT INTO "User" (id,email,username,"displayName","passwordHash") VALUES ($1,$2,$3,$4,$5)', [actor, "restore@fixture.invalid", "restorefixture", "Isolated recovery fixture", "not-a-login-password"]);
    await fixture.query('INSERT INTO "Community" (id,slug,name,description,purpose,"adminId",currency) VALUES ($1,$2,$3,$4,$5,$6,$7)', [community, "restore-fixture", "Recovery fixture", "Isolated backup exercise", "Verify preserved immutable monetary and user data", actor, "BDT"]);
    await fixture.query('INSERT INTO "CommunityMembership" (id,"communityId","userId") VALUES ($1,$2,$3)', [randomUUID(), community, actor]);
    await fixture.query('INSERT INTO "TreasuryAccount" (id,"communityId",kind,balance) VALUES ($1,$2,$3,$4),($5,$2,$6,$7)', [external, community, "EXTERNAL", -12345, treasury, "TREASURY", 12345]);
    await fixture.query('INSERT INTO "LedgerTransaction" (id,"communityId","initiatedById",type,amount,currency,status,"idempotencyKey","sourceAccount","destinationAccount") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [transaction, community, actor, "CONTRIBUTION", 12345, "BDT", "CONFIRMED", "recovery-fixture", external, treasury]);
    await fixture.query('INSERT INTO "LedgerEntry" (id,"transactionId","accountId",amount) VALUES ($1,$2,$3,$4),($5,$2,$6,$7)', [randomUUID(), transaction, external, -12345, randomUUID(), treasury, 12345]);
    await fixture.query("COMMIT");
    await financialIntegrity(fixture);
    const before = await databaseManifest(fixture);
    const backup = await createBackup(fixtureUrl.href);
    // Change only the throwaway source after the snapshot. Restore must retain the old snapshot.
    await fixture.query('UPDATE "User" SET "displayName"=$1 WHERE id=$2', ["Changed after backup", actor]);
    const result = await restoreBackup(source.href, backup.file, restoreName); restoreCreated = true;
    const after = await databaseManifest(fixture);
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("Recovery exercise failed to create a meaningful point-in-time difference.");
    console.log(JSON.stringify({ status: "ok", exercise: "isolated-real-pg-dump-pg-restore", ...result, snapshotSha256: backup.manifest.sha256, preservedSourceMutation: true, fixtureAmountMinor: "12345", fixtureCurrency: "BDT", sourceDatabaseUntouched: true }));
  } catch (error) { await fixture.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await fixture.end(); }
} catch (error) {
  console.error(error instanceof Error && /^Financial integrity|^Restored table|^Backup checksum|^Recovery exercise/.test(error.message) ? error.message : "Isolated recovery exercise failed. Check local PostgreSQL tools, migrations and fixture constraints; private connection diagnostics were withheld.");
  process.exitCode = 1;
} finally {
  // Names are fixed, newly created and separate from DATABASE_URL. Never drop caller-selected paths.
  if (!/^fundicate_recovery_\d+_\d+$/.test(sourceName) || !/^fundicate_restore_\d+_\d+$/.test(restoreName)) throw new Error("Unsafe cleanup target.");
  if (restoreCreated) await admin.query(`DROP DATABASE ${quoteIdentifier(restoreName)} WITH (FORCE)`);
  if (fixtureCreated) await admin.query(`DROP DATABASE ${quoteIdentifier(sourceName)} WITH (FORCE)`);
  await admin.end();
}
