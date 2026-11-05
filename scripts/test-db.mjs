import "dotenv/config";
import pg from "pg";
import { spawn, spawnSync } from "node:child_process";
const mode = process.argv[2] || "integration";
if (!["integration", "e2e", "rounds"].includes(mode))
  throw new Error("Unknown test mode");
const databaseName = `fundicate_test_${Date.now()}_${process.pid}`;
if (!/^fundicate_test_\d+_\d+$/.test(databaseName))
  throw new Error("Unsafe test database name");
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = "/postgres";
const client = new pg.Client({
  connectionString: adminUrl.href,
  connectionTimeoutMillis: 5000,
});
await client.connect();
let server;
try {
  await client.query(`CREATE DATABASE "${databaseName}"`);
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = "/" + databaseName;
  const env = {
    ...process.env,
    DATABASE_URL: testUrl.href,
    APP_ORIGIN: "http://127.0.0.1:3001",
  };
  const migrate = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env, stdio: "inherit", windowsHide: true },
  );
  if (migrate.status !== 0) throw new Error("Test database migration failed");
  if (mode !== "integration") {
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3001",
      ],
      { env, stdio: "inherit", windowsHide: true },
    );
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(env.APP_ORIGIN + "/login");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready)
      throw new Error(
        "Test server did not become ready. Run npm run build before test:e2e.",
      );
  }
  const test = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", `tests/${mode}.ts`],
    { env, stdio: "inherit", windowsHide: true },
  );
  process.exitCode = test.status ?? 1;
} finally {
  if (server) {
    server.kill();
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Only the unique throwaway database created above is ever dropped.
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await client.end();
}
