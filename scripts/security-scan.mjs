import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { standaloneEnvironmentFiles } from "./build-artifacts.mjs";

const output = ".local/security-check";
if (!existsSync(".next/standalone/server.js"))
  throw new Error(
    "A complete standalone server build is required for the artifact audit.",
  );
if (
  !existsSync(".next/standalone/.next/static") ||
  !existsSync(".next/standalone/public/rules/fundicate-methods-v1.txt")
)
  throw new Error(
    "Native standalone distribution is missing static assets or its published rules.",
  );
if (standaloneEnvironmentFiles().length)
  throw new Error(
    "Copied environment files remain in the standalone server distribution.",
  );
mkdirSync(output, { recursive: true });
for (const scope of [
  "src",
  "scripts",
  "tests",
  "prisma",
  ".github",
  ".next/static",
]) {
  if (!existsSync(scope))
    throw new Error(`Required scan scope is missing: ${scope}`);
  const report = join(output, scope.replaceAll(/[./]/g, "_") + ".json");
  const result = spawnSync(
    "gitleaks",
    [
      "dir",
      scope,
      "--redact",
      "--no-banner",
      "--report-format",
      "json",
      "--report-path",
      report,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (result.error || ![0, 1].includes(result.status) || !existsSync(report))
    throw new Error(
      `Secret scanner could not inspect ${scope}. Install Gitleaks; no absence-of-results pass is permitted.`,
    );
  const findings = JSON.parse(readFileSync(report, "utf8"));
  console.log(
    JSON.stringify({
      scope,
      findings: findings.length,
      locations: findings.map((f) => ({
        file: f.File,
        line: f.StartLine,
        rule: f.RuleID,
      })),
    }),
  );
  if (findings.length) process.exitCode = 1;
}
// Check actual configured values without printing or persisting them in reports.
const values = [
  process.env.DATABASE_URL,
  process.env.RUNTIME_DATABASE_URL,
  process.env.POSTGRES_PASSWORD,
];
try {
  for (const url of [
    process.env.DATABASE_URL,
    process.env.RUNTIME_DATABASE_URL,
  ])
    if (url) values.push(decodeURIComponent(new URL(url).password));
} catch {
  throw new Error(
    "Database configuration is malformed; its value was not logged.",
  );
}
let files = 0;
function scan(path, browser) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isSymbolicLink()) {
      if (browser) throw new Error("Unexpected browser artifact symlink.");
      continue;
    }
    if (entry.isDirectory()) scan(file, browser);
    else if (/\.(js|map|html|txt|json)$/.test(file)) {
      files++;
      const data = readFileSync(file, "utf8");
      if (values.some((v) => v && v.length >= 8 && data.includes(v)))
        throw new Error(
          `Private configuration found in distribution artifact: ${file}`,
        );
      if (
        browser &&
        /@hot-labs\/near-connect|test\.rpc\.fastnear\.com/.test(data)
      )
        throw new Error(
          `Retired wallet integration found in browser artifact: ${file}`,
        );
    }
  }
}
scan(".next/static", true);
const browserFiles = files;
scan(".next/standalone", false);
console.log(
  JSON.stringify({
    browserArtifactFiles: browserFiles,
    serverArtifactFiles: files - browserFiles,
    configuredSecretMatches: 0,
    retiredWalletSdkMatches: 0,
  }),
);
