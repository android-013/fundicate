import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { resolve, join, dirname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  helper = join(project, "scripts/progress.mjs");
const base = join(project, ".local/progress-tests");
mkdirSync(base, { recursive: true });
const fixtures = [];
function put(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(
    join(root, path),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
}
function fixture() {
  const root = mkdtempSync(join(base, "fixture-"));
  fixtures.push(root);
  put(root, "workflow/plan.json", {
    schemaVersion: 1,
    totalParts: 5,
    parts: [1, 2, 3, 4, 5].map((number) => ({
      number,
      title: `Fixture part ${number}`,
      requirements: [`Q${number}`],
      checks: number === 1 ? [] : ["unit"],
      handoff: `docs/parts/part-0${number}.md`,
    })),
  });
  put(root, "workflow/requirements.json", {
    schemaVersion: 1,
    requirements: [1, 2, 3, 4, 5].map((part) => ({
      id: `Q${part}`,
      title: `Fixture requirement ${part}`,
      part,
      mandatory: true,
      initialStatus: part === 1 ? "verified" : "pending",
      acceptance: ["A real fixture check must execute before acceptance."],
      ...(part === 1
        ? { baselineEvidence: "historical fixture baseline" }
        : {}),
    })),
  });
  put(root, "docs/parts/part-01.md", "Accepted historical fixture baseline.");
  put(
    root,
    "progress.md",
    "History before\n<!-- delivery-status:start -->\nPending\n<!-- delivery-status:end -->\nHistory after\n",
  );
  put(
    root,
    "scripts/unit-tests.mjs",
    "console.log('isolated workflow fixture: actual execution');\n",
  );
  put(root, "src/example.txt", "source version one");
  return root;
}
function cli(root, ...args) {
  return spawnSync(process.execPath, [helper, ...args, "--root", root], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
}
function ok(root, ...args) {
  const r = cli(root, ...args);
  assert.equal(r.status, 0, r.stderr + "\n" + r.stdout);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}
function fails(root, pattern, ...args) {
  const r = cli(root, ...args);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr + "\n" + r.stdout, pattern);
  return r;
}
function status(root) {
  return ok(root, "status");
}
function begin(root, part = 2, runId = randomUUID()) {
  const s = status(root);
  ok(
    root,
    "begin",
    "--part",
    String(part),
    "--run-id",
    runId,
    "--expect-revision",
    String(s.revision),
  );
  return runId;
}
function accept(root, run, part = 2) {
  ok(
    root,
    "accept",
    "--run-id",
    run,
    "--requirement",
    `Q${part}`,
    "--criteria",
    "all",
    "--checks",
    "unit",
    "--note",
    "Actual isolated fixture check demonstrates the workflow acceptance gate.",
  );
}
function handoff(root, part = 2) {
  put(
    root,
    `docs/parts/part-0${part}.md`,
    `# Part ${part} — isolated fixture\n\n## Verification evidence\nThe fixture check ran through the progress helper and its exit/log hash was captured.\n\n## Independent review\nThe separate fixture reviewer report binds the final source, receipts and handoff.\n\n## Remaining work and next action\nStop at this part and wait for a fresh user next request before another part.\n`,
  );
}
function reviewReport(root, run, part = 2) {
  const s = status(root);
  return {
    part,
    runId: run,
    reviewer: "/fixture/independent-reviewer",
    independent: true,
    verdict: "pass",
    sourceFingerprint: s.sourceFingerprint,
    receiptSetHash: s.receiptSetHash,
    handoffHash: s.handoffHash,
    requirementsReviewed: [`Q${part}`],
    preservation: {
      legacyFeatures: true,
      historyPreserved: true,
      heldFundsIsolated: true,
      privacyPreserved: true,
    },
    findings: [],
  };
}
function ready(root, run, part = 2) {
  ok(root, "check", "--run-id", run, "--id", "unit");
  accept(root, run, part);
  handoff(root, part);
  put(root, "workflow/reviews/current.json", reviewReport(root, run, part));
  ok(
    root,
    "review",
    "--run-id",
    run,
    "--file",
    "workflow/reviews/current.json",
  );
}
function complete(root, run, part = 2) {
  const s = status(root);
  return ok(
    root,
    "complete",
    "--part",
    String(part),
    "--run-id",
    run,
    "--expect-revision",
    String(s.revision),
  );
}
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    const target = resolve(root);
    assert.equal(dirname(target), base);
    assert.ok(target.startsWith(base + sep) && target.includes("fixture-"));
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
});

test("init accepts only historical Part 1 and leaves Part 2 waiting", () => {
  const root = fixture(),
    s = ok(root, "init");
  assert.deepEqual(s.completedParts, [1]);
  assert.equal(s.nextPart, 2);
  assert.equal(s.activeRun, null);
  assert.equal(s.status, "waiting_for_next");
  assert.ok(
    readFileSync(join(root, "progress.md"), "utf8").endsWith("History after\n"),
  );
  fails(root, /already exists/, "init");
});
test("explicit next part, revision and run ID prevent skips or replacement", () => {
  const root = fixture();
  ok(root, "init");
  const id = randomUUID();
  fails(
    root,
    /skip/,
    "begin",
    "--part",
    "3",
    "--run-id",
    id,
    "--expect-revision",
    "1",
  );
  fails(
    root,
    /revision/,
    "begin",
    "--part",
    "2",
    "--run-id",
    id,
    "--expect-revision",
    "0",
  );
  const run = begin(root);
  let s = status(root);
  ok(
    root,
    "begin",
    "--part",
    "2",
    "--run-id",
    run,
    "--expect-revision",
    String(s.revision),
  );
  s = status(root);
  assert.equal(s.activeRun.id, run);
  assert.deepEqual(s.completedParts, [1]);
  assert.equal(s.nextPart, 2);
  fails(
    root,
    /Resume/,
    "begin",
    "--part",
    "2",
    "--run-id",
    randomUUID(),
    "--expect-revision",
    String(s.revision),
  );
  fails(root, /Unknown command/, "next");
});
test("completion and criterion acceptance cannot invent missing check results", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  fails(
    root,
    /Missing check/,
    "accept",
    "--run-id",
    run,
    "--requirement",
    "Q2",
    "--criteria",
    "all",
    "--checks",
    "unit",
    "--note",
    "A handwritten passing claim is insufficient.",
  );
  fails(
    root,
    /Missing check/,
    "complete",
    "--part",
    "2",
    "--run-id",
    run,
    "--expect-revision",
    String(status(root).revision),
  );
});
test("checks execute predefined Node argument arrays and retain actual failing exits", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  put(
    root,
    "scripts/unit-tests.mjs",
    "console.error('fixture failure');process.exitCode=7;\n",
  );
  const r = cli(root, "check", "--run-id", run, "--id", "unit");
  assert.equal(r.status, 1);
  const ref = status(root).activeRun.checks.unit,
    receipt = JSON.parse(readFileSync(join(root, ref.path), "utf8"));
  assert.equal(receipt.exitCode, 7);
  assert.equal(receipt.commands[0][0], process.execPath);
  assert.match(
    readFileSync(join(root, receipt.logPath), "utf8"),
    /fixture failure/,
  );
  fails(
    root,
    /Failed or stale/,
    "accept",
    "--run-id",
    run,
    "--requirement",
    "Q2",
    "--criteria",
    "all",
    "--checks",
    "unit",
    "--note",
    "This failed command cannot satisfy a requirement.",
  );
  fails(
    root,
    /Unknown predefined/,
    "check",
    "--run-id",
    run,
    "--id",
    "echo passed",
  );
});
test("source edits invalidate previously executed checks and review", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  ready(root, run);
  put(root, "src/example.txt", "source changed after verification");
  fails(root, /Failed or stale/, "validate", "--run-id", run);
  fails(
    root,
    /Failed or stale/,
    "complete",
    "--part",
    "2",
    "--run-id",
    run,
    "--expect-revision",
    String(status(root).revision),
  );
});
test("no completion without criterion evidence, handoff and independent review", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  ok(root, "check", "--run-id", run, "--id", "unit");
  fails(root, /criterion/, "validate", "--run-id", run);
  accept(root, run);
  fails(root, /handoff/, "validate", "--run-id", run);
  handoff(root);
  fails(root, /review is missing/, "validate", "--run-id", run);
  const report = reviewReport(root, run);
  put(root, "workflow/reviews/invalid.json", {
    ...report,
    reviewer: "coordinator",
  });
  fails(
    root,
    /Independent passing/,
    "review",
    "--run-id",
    run,
    "--file",
    "workflow/reviews/invalid.json",
  );
  put(root, "workflow/reviews/invalid.json", {
    ...report,
    findings: [
      {
        severity: "high",
        status: "open",
        reason: "Unresolved substantive issue",
      },
    ],
  });
  fails(
    root,
    /findings/,
    "review",
    "--run-id",
    run,
    "--file",
    "workflow/reviews/invalid.json",
  );
});
test("review binds the handoff and actual receipt set, not just a passed flag", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  ready(root, run);
  put(
    root,
    "docs/parts/part-02.md",
    readFileSync(join(root, "docs/parts/part-02.md"), "utf8") +
      "Changed after review.\n",
  );
  fails(root, /Review does not bind/, "validate", "--run-id", run);
});
test("unresolved input blocks completion and resolves within the same active part", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  ready(root, run);
  ok(
    root,
    "block",
    "--run-id",
    run,
    "--id",
    "wallet",
    "--reason",
    "The actual wallet signature is still required.",
  );
  assert.equal(status(root).status, "needs_input");
  assert.equal(status(root).nextPart, 2);
  fails(root, /Unresolved blocker/, "validate", "--run-id", run);
  ok(
    root,
    "resolve",
    "--run-id",
    run,
    "--id",
    "wallet",
    "--note",
    "Fixture external prerequisite was actually supplied.",
  );
  assert.equal(status(root).activeRun.id, run);
  ok(root, "validate", "--run-id", run);
});
test("short exclusive lock refuses competing mutation without changing state", () => {
  const root = fixture();
  ok(root, "init");
  put(root, "workflow/.progress.lock", {
    pid: process.pid,
    at: new Date().toISOString(),
  });
  fails(
    root,
    /lock exists/,
    "begin",
    "--part",
    "2",
    "--run-id",
    randomUUID(),
    "--expect-revision",
    "1",
  );
  assert.equal(status(root).revision, 1);
  fails(
    root,
    /still alive/,
    "recover-lock",
    "--reason",
    "An active owner must never be displaced.",
  );
});
test("journal detects tampering and can explicitly repair a stale projection", () => {
  const root = fixture();
  ok(root, "init");
  const s = status(root);
  put(root, "workflow/state.json", { ...s, nextPart: 5 });
  fails(root, /projection/, "status");
  ok(
    root,
    "repair",
    "--reason",
    "Restore the state projection from the validated journal.",
  );
  assert.equal(status(root).nextPart, 2);
  const history = join(root, "workflow/history.jsonl");
  writeFileSync(
    history,
    readFileSync(history, "utf8").replace('"type":"init"', '"type":"forged"'),
  );
  fails(
    root,
    /journal/,
    "repair",
    "--reason",
    "Malformed evidence must fail closed instead of resetting.",
  );
});
test("evidence paths cannot escape the project", () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  ok(root, "check", "--run-id", run, "--id", "unit");
  accept(root, run);
  handoff(root);
  fails(
    root,
    /workflow\/reviews/,
    "review",
    "--run-id",
    run,
    "--file",
    "../forged.json",
  );
});
test("each explicit completion advances once and Part 5 never creates Part 6", () => {
  const root = fixture();
  ok(root, "init");
  for (const part of [2, 3, 4, 5]) {
    const run = begin(root, part);
    ready(root, run, part);
    const s = complete(root, run, part);
    assert.equal(s.activeRun, null);
    assert.equal(s.nextPart, part === 5 ? null : part + 1);
    assert.equal(s.status, part === 5 ? "complete" : "waiting_for_next");
  }
  assert.deepEqual(status(root).completedParts, [1, 2, 3, 4, 5]);
  fails(
    root,
    /2\.\.5/,
    "begin",
    "--part",
    "6",
    "--run-id",
    randomUUID(),
    "--expect-revision",
    String(status(root).revision),
  );
});
test("concurrent checks serialize while actual execution runs outside the write lock", async () => {
  const root = fixture();
  ok(root, "init");
  const run = begin(root);
  put(
    root,
    "scripts/unit-tests.mjs",
    "setTimeout(()=>console.log('slow fixture completed'),1200);\n",
  );
  const child = spawn(
    process.execPath,
    [helper, "check", "--run-id", run, "--id", "unit", "--root", root],
    { windowsHide: true, stdio: "ignore" },
  );
  const finished = new Promise((resolveChild) =>
    child.once("exit", resolveChild),
  );
  try {
    let active = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 25));
      if (status(root).activeRun.activeCheck) {
        active = true;
        break;
      }
    }
    assert.ok(active);
    assert.equal(existsSync(join(root, "workflow/.progress.lock")), false);
    fails(root, /already running/, "check", "--run-id", run, "--id", "unit");
    assert.equal(await finished, 0);
    assert.equal(status(root).activeRun.activeCheck, null);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await finished;
    }
  }
});
