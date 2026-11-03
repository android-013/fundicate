import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const tempDirectory = resolve(".local/test-temp");
mkdirSync(tempDirectory, { recursive: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, TEMP: tempDirectory, TMP: tempDirectory },
  },
);
process.exitCode = result.status ?? 1;
