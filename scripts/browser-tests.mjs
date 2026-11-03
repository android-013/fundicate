import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const temp = resolve(".local/browser-temp");
mkdirSync(temp, { recursive: true });
const file =
  process.argv[2] === "accessibility"
    ? "tests/accessibility.ts"
    : "tests/browser-qa.ts";
const result = spawnSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", file],
  {
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: temp,
      TMP: temp,
      PLAYWRIGHT_BROWSERS_PATH:
        process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(".local/browsers"),
      FUNDICATE_BROWSER:
        process.env.FUNDICATE_BROWSER ??
        (existsSync(resolve(".local/browsers")) ? "chromium" : "msedge"),
    },
  },
);
process.exitCode = result.status ?? 1;
