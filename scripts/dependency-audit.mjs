import { spawnSync } from "node:child_process";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["audit", "--json"], { encoding: "utf8", windowsHide: true, shell: process.platform === "win32" });
if (result.error) throw new Error("Dependency audit could not run.");
let audit;
try { audit = JSON.parse(result.stdout); } catch { throw new Error("Dependency audit did not return a usable registry observation."); }
if (audit.error || !audit.metadata?.vulnerabilities) throw new Error("Registry audit is unavailable; absence of results is not a pass.");
console.log(JSON.stringify({checkedAt:new Date().toISOString(),registry:"https://registry.npmjs.org",vulnerabilities:audit.metadata.vulnerabilities,dependencies:audit.metadata.dependencies}));
if (audit.metadata.vulnerabilities.total !== 0 || result.status !== 0) process.exitCode=1;
