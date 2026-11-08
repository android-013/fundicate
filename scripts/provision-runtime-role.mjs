import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";

// Operator-only migration/provisioning command, never an HTTP capability.
async function main() {
  const runtime = new URL(process.env.RUNTIME_DATABASE_URL ?? "");
  const owner = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(runtime.protocol) ||
    !["postgres:", "postgresql:"].includes(owner.protocol) ||
    runtime.username !== "fundicate_app" ||
    !runtime.password ||
    runtime.host !== owner.host ||
    runtime.pathname !== owner.pathname
  )
    throw new Error(
      "RUNTIME_DATABASE_URL must use fundicate_app on the same deployment database.",
    );
  const migrated = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "inherit", windowsHide: true },
  );
  if (migrated.status !== 0) process.exit(migrated.status ?? 1);
  const client = new pg.Client({ connectionString: owner.href });
  await client.connect();
  try {
    // format(%L) quotes the password as a PostgreSQL literal; never shell interpolate.
    const exists = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='fundicate_app'",
    );
    const verb = exists.rowCount ? "ALTER" : "CREATE";
    const command = await client.query(
      `SELECT format('${verb} ROLE fundicate_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text) AS sql`,
      [decodeURIComponent(runtime.password)],
    );
    await client.query(command.rows[0].sql);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA public TO fundicate_app");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fundicate_app",
    );
    await client.query(
      "REVOKE INSERT, UPDATE, DELETE ON public._prisma_migrations FROM fundicate_app",
    );
    await client.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fundicate_app",
    );
    console.log(
      "Migrations applied and runtime DML role provisioned; credentials were not printed.",
    );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    "Runtime role provisioning failed. Check operator/runtime configuration and database permissions; private diagnostics were withheld.",
  );
  process.exitCode = 1;
});
