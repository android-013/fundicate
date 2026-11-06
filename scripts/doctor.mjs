import "dotenv/config";
import pg from "pg";
import { tsImport } from "tsx/esm/api";
const { validateRuntimeConfig, runtimeSummary } = await tsImport("../src/lib/runtime-config.ts", import.meta.url);
let client;
try {
  const config = validateRuntimeConfig();
  if (process.argv.includes("--deployment") && !config.origin.startsWith("https://"))
    throw new Error("Public deployment requires an HTTPS origin and a TLS reverse proxy.");
  client = new pg.Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  await client.connect();
  await client.query("SELECT 1");
  const migrations = await client.query('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  const {readdirSync}=await import("node:fs");
  const expected=readdirSync(new URL("../prisma/migrations/",import.meta.url),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
  const applied=await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  if(expected.some(name=>!applied.rows.some(row=>row.migration_name===name)))throw new Error("Database migrations are incomplete.");
  await client.query('SELECT id,"templateRevisionId" FROM "FundingRound" LIMIT 0');
  console.log(JSON.stringify({ status: "ok", ...runtimeSummary(config), appliedMigrations: migrations.rows[0].count, hostedPublication: false }));
} catch (error) {
  // Validator messages never interpolate values. Database diagnostics stay private.
  console.error(JSON.stringify({ status: "unavailable", action: "Check environment settings, migration deployment and PostgreSQL connectivity. No credentials are included in diagnostics.", detail: error instanceof Error && /^(FUNDICATE_MODE|APP_ORIGIN|Production APP_ORIGIN|DATABASE_URL|ALLOW_DEMO_SEED|Production PostgreSQL|NEAR_|Private keys|The web service|Public deployment)/.test(error.message) ? error.message : "Database readiness check failed." }));
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
