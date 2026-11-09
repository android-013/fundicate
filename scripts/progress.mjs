import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
  fsyncSync,
  writeSync,
} from "node:fs";
import { resolve, relative, dirname, join, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const CHECKS = {
  "workflow-tests": [["--test", "tests/progress-workflow.test.mjs"]],
  typecheck: [["node_modules/typescript/bin/tsc", "--noEmit"]],
  lint: [["node_modules/eslint/bin/eslint.js", "."]],
  unit: [["scripts/unit-tests.mjs"]],
  integration: [["scripts/test-db.mjs", "integration"]],
  build: [
    ["node_modules/prisma/build/index.js", "generate"],
    ["node_modules/typescript/bin/tsc", "--noEmit"],
    ["scripts/build.mjs"],
  ],
  http: [["scripts/test-db.mjs", "e2e"]],
  browser: [["scripts/browser-tests.mjs"]],
  rounds: [["scripts/test-db.mjs", "rounds"]],
  accessibility: [["scripts/browser-tests.mjs", "accessibility"]],
  funds: [["scripts/test-db.mjs", "funds"]],
  elections: [["scripts/test-db.mjs", "elections"]],
  reputation: [["scripts/test-db.mjs", "reputation"]],
  release: [["scripts/test-db.mjs", "release"]],
  chain: [["scripts/test-db.mjs", "chain"]],
  "payment-records": [["scripts/test-db.mjs", "payment-records"]],
  security: [["scripts/test-db.mjs", "security"]],
  "secret-scan": [["scripts/security-scan.mjs"]],
  recovery: [["scripts/recovery-exercise.mjs", "--isolated"]],
  "large-demo": [["scripts/demo-large.mjs", "--isolated"]],
  contract: [["contracts/near-treasury/check.mjs"]],
  "dependency-audit": [["scripts/dependency-audit.mjs"]],
  "near-testnet": [["scripts/verify-near-testnet.mjs"]],
};
const START = "<!-- delivery-status:start -->",
  END = "<!-- delivery-status:end -->";
const canonical = (v) =>
  JSON.stringify(v, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      : value,
  );
const digest = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
function need(value, message) {
  if (!value) throw new Error(message);
}
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const hashFile = (path) => digest(readFileSync(path));
function options(args) {
  const flags = {};
  let command = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      need(
        i + 1 < args.length && !args[i + 1].startsWith("--"),
        `Missing value for ${args[i]}`,
      );
      need(!(args[i].slice(2) in flags), "Duplicate flag");
      flags[args[i].slice(2)] = args[++i];
    } else {
      need(!command, "Unexpected positional argument");
      command = args[i];
    }
  }
  return { command: command ?? "status", flags };
}
function inside(root, path) {
  need(
    typeof path === "string" &&
      path.length &&
      !isAbsolute(path) &&
      !/^[a-z]:/i.test(path) &&
      !path.split(/[\\/]/).includes(".."),
    "Use a project-relative evidence path",
  );
  const full = resolve(root, path),
    rel = relative(root, full);
  need(
    rel && !rel.startsWith(".." + sep) && !isAbsolute(rel),
    "Path escapes project",
  );
  if (existsSync(full)) {
    const real = relative(realpathSync(root), realpathSync(full));
    need(
      real && !real.startsWith(".." + sep) && !isAbsolute(real),
      "Evidence symlink escapes project",
    );
  } else {
    let parent = dirname(full);
    while (!existsSync(parent)) parent = dirname(parent);
    const real = relative(realpathSync(root), realpathSync(parent));
    need(
      !real.startsWith(".." + sep) && !isAbsolute(real),
      "Evidence parent symlink escapes project",
    );
  }
  return full;
}
function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp-" + randomUUID();
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(tmp, path);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}
function config(root) {
  const plan = json(join(root, "workflow/plan.json")),
    register = json(join(root, "workflow/requirements.json"));
  need(
    plan.schemaVersion === 1 &&
      plan.totalParts === 5 &&
      plan.parts?.length === 5,
    "Expected canonical five-part plan",
  );
  const requirements = new Map(register.requirements.map((r) => [r.id, r]));
  need(
    requirements.size === register.requirements.length,
    "Duplicate requirement IDs",
  );
  plan.parts.forEach((p, i) => {
    need(
      p.number === i + 1 &&
        p.title &&
        Array.isArray(p.requirements) &&
        Array.isArray(p.checks),
      "Invalid part definition",
    );
    inside(root, p.handoff);
    for (const id of p.requirements)
      need(
        requirements.has(id) && requirements.get(id).part === p.number,
        `Wrong requirement assignment: ${id}`,
      );
    for (const id of p.checks) need(CHECKS[id], `Unknown check: ${id}`);
    if (p.number > 1)
      need(p.checks.length > 0, "Implementation parts need actual checks");
  });
  for (const r of requirements.values()) {
    need(
      Number.isInteger(r.part) &&
        r.part >= 1 &&
        r.part <= 5 &&
        r.acceptance?.length,
      "Invalid requirement",
    );
    need(
      r.mandatory === false ||
        plan.parts[r.part - 1].requirements.includes(r.id),
      `Unassigned mandatory requirement: ${r.id}`,
    );
  }
  const matrixPath = join(root, "workflow/method-matrix.json");
  if (existsSync(matrixPath)) {
    const matrix = json(matrixPath),
      keys = new Set(matrix.cells.map((c) => c.id));
    need(
      matrix.requiredCells === 36 &&
        matrix.cells.length === 36 &&
        keys.size === 36 &&
        matrix.cells.every((c) => c.required === true),
      "The required method matrix must retain all 36 cells",
    );
    for (const m of [
      "FPTP",
      "IRV",
      "STV",
      "ELO",
      "GLICKO_2",
      "FORCED_PAIRWISE",
    ])
      for (const w of ["EQUAL", "CONTRIBUTION"])
        for (const a of ["WINNER_ALL", "PROPORTIONAL", "RANKED_CUTS"])
          need(
            matrix.cells.some(
              (c) => c.method === m && c.weight === w && c.allocation === a,
            ),
            "Missing required matrix combination",
          );
  }
  return { plan, requirements };
}
export function fingerprint(root) {
  const files = [];
  function walk(path) {
    if (!existsSync(path)) return;
    for (const e of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(path, e.name);
      if (e.isSymbolicLink())
        throw new Error("Source symlinks require explicit review");
      if (
        e.isDirectory() &&
        !["target", "node_modules", ".git"].includes(e.name)
      )
        walk(p);
      else if (e.isFile()) files.push(p);
    }
  }
  for (const dir of [
    "src",
    "prisma",
    "scripts",
    "tests",
    "docs/algorithms",
    "public/rules",
    ".github",
    "contracts",
  ])
    walk(join(root, dir));
  for (const name of [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
    "eslint.config.mjs",
    "vitest.config.ts",
    "prisma.config.ts",
    "AGENTS.md",
    "docs/MASTER-PLAN.md",
    "workflow/plan.json",
    "workflow/requirements.json",
    "workflow/method-matrix.json",
    "workflow/DECISIONS.md",
    "Dockerfile",
    "Dockerfile.database",
    "compose.yaml",
    ".dockerignore",
    ".env.example",
    "docs/PRODUCTION.md",
    "docs/STANDALONE.md",
    "docs/OPERATIONS.md",
    "docs/NEAR-CONTRACT.md",
    "docs/INTEGRATIONS.md",
  ])
    if (existsSync(join(root, name))) files.push(join(root, name));
  const h = createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    h.update(relative(root, file).replaceAll("\\", "/"));
    h.update("\0");
    h.update(readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}
function journal(root) {
  const path = join(root, "workflow/history.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean),
    events = [];
  let prev = null;
  for (const line of lines) {
    const e = JSON.parse(line),
      { hash, ...body } = e;
    need(
      e.revision === events.length + 1 &&
        e.previousHash === prev &&
        e.state.revision === e.revision &&
        digest(canonical(e.state)) === e.stateHash &&
        digest(canonical(body)) === hash,
      "Progress journal is malformed or altered; do not reset it",
    );
    events.push(e);
    prev = e.hash;
  }
  return events;
}
function read(root, allowStale = false) {
  const events = journal(root);
  need(
    events.length,
    "Progress is not initialized. Use init only for the accepted baseline.",
  );
  const state = events.at(-1).state;
  if (!allowStale)
    need(
      existsSync(join(root, "workflow/state.json")) &&
        canonical(json(join(root, "workflow/state.json"))) === canonical(state),
      "State projection is stale or altered; inspect then use repair --reason",
    );
  return { state, events };
}
async function readStable(root) {
  for (let i = 0; ; i++) {
    try {
      return read(root);
    } catch (error) {
      if (i >= 50 || !existsSync(join(root, "workflow/.progress.lock")))
        throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
  }
}
function render(root, state) {
  const path = join(root, "progress.md");
  need(existsSync(path), "progress.md is required");
  const text = readFileSync(path, "utf8"),
    a = text.indexOf(START),
    b = text.indexOf(END);
  need(a >= 0 && b > a, "progress.md needs delivery status markers");
  const rows = Object.values(state.parts)
    .map((p) => `| ${p.number}/5 | ${p.title} | ${p.status} |`)
    .join("\n");
  const block = `${START}\nCurrent delivery: ${state.completedParts.length}/5 parts complete. This is milestone count, not PDF feature coverage.\n\nState: ${state.status}. Next eligible part: ${state.nextPart ?? "none"}. Revision: ${state.revision}.\n\n| Part | Scope | Status |\n| --- | --- | --- |\n${rows}\n\n${state.activeRun ? `Active run: ${state.activeRun.id}; part ${state.activeRun.part}. Resume it before advancing.` : "Waiting for a fresh user next request; planning does not start the next part."}\n${END}`;
  writeFileSync(path, text.slice(0, a) + block + text.slice(b + END.length));
}
function commit(root, state, events, type, detail = {}) {
  const next = structuredClone(state);
  next.revision = (events.at(-1)?.revision ?? 0) + 1;
  next.updatedAt = now();
  const body = {
    revision: next.revision,
    at: next.updatedAt,
    type,
    detail,
    previousHash: events.at(-1)?.hash ?? null,
    stateHash: digest(canonical(next)),
    state: next,
  };
  const entry = { ...body, hash: digest(canonical(body)) },
    fd = openSync(join(root, "workflow/history.jsonl"), "a", 0o600);
  try {
    writeSync(fd, JSON.stringify(entry) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  atomicWrite(join(root, "workflow/state.json"), next);
  render(root, next);
  return next;
}
function locked(root, fn) {
  const path = join(root, "workflow/.progress.lock");
  mkdirSync(dirname(path), { recursive: true });
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error(
        "Progress lock exists. Inspect owner; never remove it solely because it is old.",
      );
    throw e;
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, at: now() }));
    return fn();
  } finally {
    closeSync(fd);
    unlinkSync(path);
  }
}
function mutate(root, fn, type, detail = {}, allowStale = false) {
  return locked(root, () => {
    const { state, events } = read(root, allowStale);
    fn(state);
    return commit(root, state, events, type, detail);
  });
}
function expected(state, flags) {
  need(
    flags["expect-revision"] !== undefined &&
      Number(flags["expect-revision"]) === state.revision,
    "Stale or missing --expect-revision; read status again",
  );
}
function runFor(state, flags) {
  need(
    state.activeRun && flags["run-id"] === state.activeRun.id,
    "Missing/mismatched active --run-id",
  );
  return state.activeRun;
}
function partFor(cfg, n) {
  return cfg.plan.parts[n - 1];
}
function checkReceipt(root, run, id, source) {
  const ref = run.checks[id];
  need(ref, `Missing check: ${id}`);
  const path = inside(root, ref.path);
  need(hashFile(path) === ref.hash, `Altered check receipt: ${id}`);
  const r = json(path);
  need(
    r.runId === run.id &&
      r.part === run.part &&
      r.check === id &&
      r.exitCode === 0 &&
      r.sourceUnchanged &&
      r.sourceFingerprint === source,
    `Failed or stale check: ${id}`,
  );
  need(
    hashFile(inside(root, r.logPath)) === r.logHash,
    `Missing/altered check log: ${id}`,
  );
  return r;
}
function receiptSetHash(run) {
  return digest(canonical(run.checks));
}
function handoffHash(root, cfg, run) {
  const path = inside(root, partFor(cfg, run.part).handoff);
  need(existsSync(path), "Required part handoff is missing");
  const content = readFileSync(path, "utf8");
  need(
    content.length >= 200 &&
      content.includes(`# Part ${run.part}`) &&
      content.includes("## Verification evidence") &&
      content.includes("## Independent review") &&
      content.includes("## Remaining work and next action"),
    "Handoff must follow docs/parts/TEMPLATE.md",
  );
  return hashFile(path);
}
function gates(root, cfg, state, includeReview = true) {
  const run = state.activeRun;
  need(run, "No active part");
  need(!run.activeCheck, "A check is still active");
  need(
    !Object.values(run.blockers).some((b) => !b.resolvedAt),
    "Unresolved blocker keeps this part active",
  );
  const source = fingerprint(root),
    part = partFor(cfg, run.part);
  for (const id of part.checks) checkReceipt(root, run, id, source);
  for (const id of part.requirements) {
    const r = cfg.requirements.get(id);
    if (r.mandatory === false) continue;
    for (let i = 1; i <= r.acceptance.length; i++) {
      const a = run.acceptance[id]?.[i];
      need(
        a && a.sourceFingerprint === source,
        `Missing/stale criterion ${id}.${i}`,
      );
      need(
        a.checks?.length,
        `Criterion ${id}.${i} lacks executed check evidence`,
      );
      for (const check of a.checks) checkReceipt(root, run, check, source);
    }
  }
  const handoff = handoffHash(root, cfg, run);
  if (includeReview) {
    need(run.review, "Independent review is missing");
    const path = inside(root, run.review.path);
    need(hashFile(path) === run.review.hash, "Review report was altered");
    validateReview(json(path), run, part, source, handoff);
  }
  return {
    sourceFingerprint: source,
    receiptSetHash: receiptSetHash(run),
    handoffHash: handoff,
  };
}
function validateReview(report, run, part, source, handoff) {
  need(
    report.part === run.part &&
      report.runId === run.id &&
      report.sourceFingerprint === source &&
      report.receiptSetHash === receiptSetHash(run) &&
      report.handoffHash === handoff,
    "Review does not bind the current source/checks/handoff",
  );
  need(
    report.independent === true &&
      typeof report.reviewer === "string" &&
      report.reviewer.length >= 3 &&
      report.reviewer.toLowerCase() !== "coordinator" &&
      report.verdict === "pass",
    "Independent passing review is required",
  );
  need(
    Array.isArray(report.requirementsReviewed) &&
      part.requirements.every((id) => report.requirementsReviewed.includes(id)),
    "Review omits part requirements",
  );
  need(
    [
      "legacyFeatures",
      "historyPreserved",
      "heldFundsIsolated",
      "privacyPreserved",
    ].every((k) => report.preservation?.[k] === true),
    "Preservation attestation is incomplete",
  );
  need(
    Array.isArray(report.findings) &&
      report.findings.every(
        (f) =>
          f.status === "resolved" ||
          (f.status === "accepted" &&
            f.severity === "low" &&
            typeof f.reason === "string" &&
            f.reason.length >= 8),
      ),
    "Unresolved/material findings block completion",
  );
}
function alive(pid) {
  need(
    Number.isInteger(pid) && pid > 0,
    "Invalid process identity; inspect before recovery",
  );
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    throw new Error(
      "Cannot prove process has stopped; inspect it before recovery",
    );
  }
}
async function executeCheck(root, cfg, flags) {
  const id = flags.id;
  need(CHECKS[id], "Unknown predefined check ID");
  const token = randomUUID(),
    source = fingerprint(root);
  let runId, part;
  mutate(
    root,
    (state) => {
      const run = runFor(state, flags);
      need(
        partFor(cfg, run.part).checks.includes(id),
        "Check is not assigned to this part",
      );
      need(!run.activeCheck, "A check is already running; serialize checks");
      runId = run.id;
      part = run.part;
      run.activeCheck = {
        id,
        token,
        pid: process.pid,
        startedAt: now(),
        sourceFingerprint: source,
      };
    },
    "check-start",
    { check: id, token },
  );
  const prefix = `workflow/evidence/part-${String(part).padStart(2, "0")}/${id}-${token}`,
    logPath = prefix + ".log",
    fullLog = inside(root, logPath);
  mkdirSync(dirname(fullLog), { recursive: true });
  writeFileSync(fullLog, "", { mode: 0o600 });
  const startedAt = now();
  let code = 0,
    interrupted = false;
  try {
    for (const args of CHECKS[id]) {
      appendFileSync(
        fullLog,
        `COMMAND ${JSON.stringify([process.execPath, ...args])}\n`,
      );
      code = await new Promise((resolveResult) => {
        const child = spawn(process.execPath, args, {
          cwd: root,
          windowsHide: true,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const output = (data) => {
          appendFileSync(fullLog, data);
          process.stdout.write(data);
        };
        child.stdout.on("data", output);
        child.stderr.on("data", output);
        const stop = () => {
          interrupted = true;
          child.kill();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        child.on("error", (e) => {
          appendFileSync(fullLog, String(e) + "\n");
        });
        child.on("close", (exit) => {
          process.removeListener("SIGINT", stop);
          process.removeListener("SIGTERM", stop);
          resolveResult(interrupted ? 130 : (exit ?? 1));
        });
      });
      if (code !== 0) break;
    }
  } catch (e) {
    code = 1;
    appendFileSync(fullLog, String(e) + "\n");
  }
  const receipt = {
    schemaVersion: 1,
    part,
    runId,
    check: id,
    token,
    commands: CHECKS[id].map((args) => [process.execPath, ...args]),
    startedAt,
    finishedAt: now(),
    exitCode: code,
    sourceFingerprint: source,
    sourceUnchanged: fingerprint(root) === source,
    logPath,
    logHash: hashFile(fullLog),
  };
  const receiptPath = prefix + ".json";
  writeFileSync(
    inside(root, receiptPath),
    JSON.stringify(receipt, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  mutate(
    root,
    (state) => {
      const run = runFor(state, flags);
      need(
        run.activeCheck?.token === token,
        "Active check token changed; preserve receipt and investigate",
      );
      run.checks[id] = {
        path: receiptPath,
        hash: hashFile(inside(root, receiptPath)),
      };
      run.activeCheck = null;
    },
    "check-finish",
    { check: id, exitCode: code, receipt: receiptPath },
  );
  process.stdout.write(
    "\n" +
      JSON.stringify({
        check: id,
        exitCode: code,
        sourceUnchanged: receipt.sourceUnchanged,
        receipt: receiptPath,
      }) +
      "\n",
  );
  if (code !== 0 || !receipt.sourceUnchanged) process.exitCode = 1;
}
export async function main(args = process.argv.slice(2)) {
  const { command, flags } = options(args),
    root = realpathSync(
      resolve(
        flags.root ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
      ),
    ),
    cfg = config(root);
  need(
    [
      "init",
      "status",
      "validate",
      "begin",
      "check",
      "checkpoint",
      "accept",
      "review",
      "block",
      "resolve",
      "complete",
      "repair",
      "recover-lock",
      "recover-check",
    ].includes(command),
    "Unknown command. There is no auto-next command; see workflow/FORMAT.md.",
  );
  let result;
  if (command === "init") {
    result = locked(root, () => {
      need(
        !existsSync(join(root, "workflow/state.json")) &&
          !existsSync(join(root, "workflow/history.jsonl")),
        "Progress already exists; never reset it",
      );
      const baseline = partFor(cfg, 1);
      need(
        existsSync(inside(root, baseline.handoff)),
        "Baseline handoff is required",
      );
      for (const id of baseline.requirements)
        need(
          cfg.requirements.get(id).initialStatus === "verified" &&
            cfg.requirements.get(id).baselineEvidence,
          "Baseline needs historical evidence",
        );
      const state = {
        schemaVersion: 1,
        revision: 0,
        totalParts: 5,
        completedParts: [1],
        nextPart: 2,
        status: "waiting_for_next",
        activeRun: null,
        parts: Object.fromEntries(
          cfg.plan.parts.map((p) => [
            p.number,
            {
              number: p.number,
              title: p.title,
              status: p.number === 1 ? "complete" : "pending",
              ...(p.number === 1
                ? { historical: true, handoff: p.handoff }
                : {}),
            },
          ]),
        ),
        requirements: Object.fromEntries(
          [...cfg.requirements.values()].map((r) => [
            r.id,
            {
              status: r.initialStatus,
              ...(r.baselineEvidence
                ? { historicalEvidence: r.baselineEvidence }
                : {}),
            },
          ]),
        ),
      };
      return commit(root, state, [], "init", {
        basis:
          "User accepted all existing work as historical Part 1; no product checks run by init",
      });
    });
  } else if (command === "status") {
    const { state } = await readStable(root);
    const source = fingerprint(root);
    result = {
      ...state,
      sourceFingerprint: source,
      receiptSetHash: state.activeRun ? receiptSetHash(state.activeRun) : null,
      handoffHash:
        state.activeRun &&
        existsSync(inside(root, partFor(cfg, state.activeRun.part).handoff))
          ? hashFile(inside(root, partFor(cfg, state.activeRun.part).handoff))
          : null,
      checkIds: state.activeRun
        ? partFor(cfg, state.activeRun.part).checks
        : [],
    };
  } else if (command === "validate") {
    const { state } = await readStable(root);
    if (flags["run-id"]) {
      runFor(state, flags);
      result = { valid: true, ...gates(root, cfg, state) };
    } else
      result = {
        valid: true,
        revision: state.revision,
        completedParts: state.completedParts,
        nextPart: state.nextPart,
        status: state.status,
      };
  } else if (command === "check") {
    await executeCheck(root, cfg, flags);
    return;
  } else if (command === "repair") {
    need(flags.reason?.length >= 8, "Explain recovery with --reason");
    result = mutate(
      root,
      () => {},
      "projection-repair",
      { reason: flags.reason },
      true,
    );
  } else if (command === "recover-lock") {
    const path = join(root, "workflow/.progress.lock");
    need(
      existsSync(path) && flags.reason?.length >= 8,
      "Existing lock and --reason required",
    );
    const bytes = readFileSync(path, "utf8"),
      owner = JSON.parse(bytes);
    need(!alive(owner.pid), "Lock owner is still alive; do not steal it");
    need(readFileSync(path, "utf8") === bytes, "Lock changed; stop recovery");
    unlinkSync(path);
    result = mutate(root, () => {}, "lock-recovery", {
      reason: flags.reason,
      owner,
    });
  } else {
    result = mutate(
      root,
      (state) => {
        if (command === "begin") {
          expected(state, flags);
          const part = Number(flags.part);
          need(
            Number.isInteger(part) && part >= 2 && part <= 5,
            "Use an explicit implementation --part 2..5",
          );
          need(
            flags["run-id"]?.match(/^[a-f0-9-]{36}$/i),
            "Use a UUID --run-id",
          );
          if (state.activeRun) {
            need(
              state.activeRun.part === part &&
                state.activeRun.id === flags["run-id"],
              "Resume the active part/run; do not replace or queue it",
            );
            return;
          }
          need(
            state.nextPart === part && state.completedParts.length === part - 1,
            "Cannot skip a part or invent Part 6",
          );
          state.status = "in_progress";
          state.parts[part].status = "in_progress";
          state.activeRun = {
            id: flags["run-id"],
            part,
            startedAt: now(),
            checks: {},
            acceptance: {},
            blockers: {},
            checkpoints: [],
            review: null,
            activeCheck: null,
          };
          return;
        }
        const run = runFor(state, flags);
        if (command === "checkpoint") {
          need(flags.note?.length >= 8, "Supply a meaningful --note");
          run.checkpoints.push({ at: now(), note: flags.note });
        } else if (command === "block") {
          need(
            flags.id && flags.reason?.length >= 8,
            "Supply blocker --id and --reason",
          );
          run.blockers[flags.id] = {
            reason: flags.reason,
            openedAt: now(),
            resolvedAt: null,
          };
          state.status = "needs_input";
          state.parts[run.part].status = "needs_input";
        } else if (command === "resolve") {
          need(
            run.blockers[flags.id] &&
              !run.blockers[flags.id].resolvedAt &&
              flags.note?.length >= 8,
            "Name an open blocker and give actual resolution --note",
          );
          run.blockers[flags.id].resolvedAt = now();
          run.blockers[flags.id].resolution = flags.note;
          if (!Object.values(run.blockers).some((b) => !b.resolvedAt)) {
            state.status = "in_progress";
            state.parts[run.part].status = "in_progress";
          }
        } else if (command === "recover-check") {
          need(
            run.activeCheck && flags.reason?.length >= 8,
            "Active check and --reason required",
          );
          need(!alive(run.activeCheck.pid), "Check owner is still alive");
          delete run.checks[run.activeCheck.id];
          run.checkpoints.push({
            at: now(),
            note: `Interrupted check ${run.activeCheck.id}: ${flags.reason}`,
          });
          run.activeCheck = null;
        } else if (command === "accept") {
          const r = cfg.requirements.get(flags.requirement);
          need(
            r && r.part === run.part,
            "Requirement does not belong to active part",
          );
          need(
            flags.note?.length >= 8,
            "Explain how evidence proves this criterion",
          );
          const checks = flags.checks?.split(",").filter(Boolean);
          need(checks?.length, "Executed --checks are required");
          const source = fingerprint(root);
          for (const id of checks) checkReceipt(root, run, id, source);
          const criteria =
            flags.criteria === "all"
              ? r.acceptance.map((_, i) => i + 1)
              : flags.criteria?.split(",").map(Number);
          need(
            criteria?.length &&
              criteria.every(
                (i) =>
                  Number.isInteger(i) && i >= 1 && i <= r.acceptance.length,
              ),
            "Use valid 1-based --criteria or all",
          );
          run.acceptance[r.id] ??= {};
          for (const i of criteria)
            run.acceptance[r.id][i] = {
              at: now(),
              sourceFingerprint: source,
              checks,
              note: flags.note,
            };
          state.requirements[r.id].status = "acceptance_recorded";
        } else if (command === "review") {
          const hashes = gates(root, cfg, state, false);
          need(
            flags.file?.replaceAll("\\", "/").startsWith("workflow/reviews/"),
            "Store review under workflow/reviews/",
          );
          const path = inside(root, flags.file);
          validateReview(
            json(path),
            run,
            partFor(cfg, run.part),
            hashes.sourceFingerprint,
            hashes.handoffHash,
          );
          run.review = { path: flags.file, hash: hashFile(path), at: now() };
        } else if (command === "complete") {
          expected(state, flags);
          need(
            Number(flags.part) === run.part,
            "Explicit --part must match active run",
          );
          const hashes = gates(root, cfg, state),
            part = run.part;
          state.parts[part] = {
            ...state.parts[part],
            status: "complete",
            completedAt: now(),
            run: structuredClone(run),
            handoff: partFor(cfg, part).handoff,
            ...hashes,
          };
          for (const id of Object.keys(run.acceptance)) {
            const r = cfg.requirements.get(id);
            if (r.acceptance.every((_, i) => run.acceptance[id][i + 1]))
              state.requirements[id].status = "verified";
          }
          state.completedParts.push(part);
          state.nextPart = part < 5 ? part + 1 : null;
          state.status = part < 5 ? "waiting_for_next" : "complete";
          state.activeRun = null;
        } else
          throw new Error(
            "Unknown command. See workflow/FORMAT.md; there is no auto-next command.",
          );
      },
      command,
      {
        part: flags.part ?? null,
        runId: flags["run-id"] ?? null,
        id: flags.id ?? flags.requirement ?? null,
      },
    );
  }
  process.stdout.write(JSON.stringify(result) + "\n");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    process.stderr.write(JSON.stringify({ error: e.message }) + "\n");
    process.exitCode = 1;
  });
