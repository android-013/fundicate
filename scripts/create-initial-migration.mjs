import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const folder = "prisma/migrations/20261102000000_initial";
if (existsSync(folder + "/migration.sql"))
  throw new Error(
    "Initial migration already exists; refusing to overwrite it.",
  );
const sql = execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ],
  { encoding: "utf8", windowsHide: true },
);
mkdirSync(folder, { recursive: true });
writeFileSync(
  folder + "/migration.sql",
  sql + "\n" + readFileSync("prisma/integrity.sql", "utf8"),
);
writeFileSync(
  "prisma/migrations/migration_lock.toml",
  'provider = "postgresql"\n',
);
console.log("Initial schema and integrity constraints written.");
