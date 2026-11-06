import "dotenv/config";
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/maintenance.ts", ...process.argv.slice(2)], { env: process.env, stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
