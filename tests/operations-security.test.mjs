import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  statSync,
  lstatSync,
  renameSync,
  rmSync,
  writeSync,
  fstatSync,
} from "node:fs";
import { postgresUrl } from "../src/lib/postgres-url.mjs";
import { createBackup, pgEnvironment } from "../scripts/backup.mjs";
import { restoreBackup } from "../scripts/restore.mjs";

const require = createRequire(import.meta.url),
  pg = require("pg");
const root = resolve(import.meta.dirname, "..");
const fixtureUrl = "postgresql://fixture:placeholder@127.0.0.1:1/unused";
const archive = Buffer.from("PGDMP-private-fixture-bytes");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
  const parent = resolve(tmpdir()),
    dir = mkdtempSync(join(parent, "fundicate-ops-"));
  t.after(() => {
    assert.equal(dirname(dir), parent);
    assert.ok(basename(dir).startsWith("fundicate-ops-"));
    assert.equal(lstatSync(dir).isSymbolicLink(), false);
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
function moveOwned(dir, from, to) {
  for (const path of [from, to]) assert.ok(resolve(path).startsWith(dir + sep));
  renameSync(from, to);
}
async function mockedOperations(action) {
  const originalClient = pg.Client,
    originalSpawn = childProcess.spawnSync;
  const context = {
    connects: 0,
    creates: 0,
    dumpCalls: 0,
    restoreCalls: 0,
    failDump: false,
  };
  pg.Client = class {
    async connect() {
      context.connects++;
      await context.onConnect?.();
    }
    async end() {}
    async query(sql) {
      if (sql.startsWith("CREATE DATABASE")) context.creates++;
      if (sql === "SELECT pg_export_snapshot() AS snapshot") {
        await context.onSnapshot?.();
        return { rows: [{ snapshot: "fixture" }] };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  childProcess.spawnSync = (command, args, options) => {
    const name = basename(command).toLowerCase();
    if (name.startsWith("pg_dump")) {
      context.dumpCalls++;
      context.outputFd = options.stdio?.[1];
      context.onDump?.();
      if (Number.isInteger(context.outputFd))
        writeSync(context.outputFd, archive);
      else writeFileSync(args[args.indexOf("--file") + 1], archive);
      return {
        status: context.failDump ? 1 : 0,
        stdout: "",
        stderr: "private fixture diagnostics",
      };
    }
    if (name.startsWith("pg_restore")) {
      context.restoreCalls++;
      context.inputFd = options.stdio?.[0];
      context.onRestore?.();
      context.restoredBytes = Number.isInteger(context.inputFd)
        ? readFileSync(context.inputFd)
        : readFileSync(args.at(-1));
      return { status: 0, stdout: "", stderr: "" };
    }
    throw new Error("Unexpected child in bounded operations fixture");
  };
  syncBuiltinESMExports();
  try {
    await action(context);
  } finally {
    pg.Client = originalClient;
    childProcess.spawnSync = originalSpawn;
    syncBuiltinESMExports();
  }
}

test("connection parsing rejects authority overrides and duplicate TLS query values", () => {
  for (const query of [
    "host=remote",
    "user=owner",
    "password=secret",
    "port=1",
    "hostaddr=192.0.2.1",
    "database=other",
    "dbname=other",
    "service=other",
    "connectionString=other",
    "%75ser=owner",
    "HOST=remote",
    "sslmode=verify-full&sslmode=no-verify",
  ]) {
    assert.throws(() => postgresUrl(`${fixtureUrl}?${query}`), /DATABASE_URL/);
  }
  const url = postgresUrl(
    `${fixtureUrl}?sslmode=verify-full&schema=public&application_name=fundicate`,
  );
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.get("schema"), "public");
  assert.equal(
    pgEnvironment(new URL("postgresql://fixture:placeholder@[::1]:1/unused"))
      .PGHOST,
    "::1",
  );
});

test("bootstrap refuses unsafe legacy query credentials without changing the saved configuration", (t) => {
  const dir = fixture(t),
    deploy = join(dir, ".local/deploy");
  mkdirSync(deploy, { recursive: true });
  const file = join(deploy, "compose.env");
  for (const value of [
    `DATABASE_URL=${fixtureUrl}?user=owner&password=secret\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
    `DATABASE_URL=${fixtureUrl}\nRUNTIME_DATABASE_URL=${fixtureUrl}?user=owner\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
    `DATABASE_URL=${fixtureUrl}\nRUNTIME_DATABASE_URL=\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
    `DATABASE_URL=${fixtureUrl}\nDATABASE_URL=${fixtureUrl}\nAPP_ORIGIN=http://127.0.0.1:3000\n`,
  ]) {
    writeFileSync(file, value, { mode: 0o600 });
    const result = childProcess.spawnSync(
      process.execPath,
      [join(root, "scripts/bootstrap.mjs"), "--docker", "--prepare-only"],
      { cwd: dir, encoding: "utf8", windowsHide: true },
    );
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(file, "utf8"), value);
    assert.ok(!result.stderr.includes("?user=owner&password=secret"));
  }
});

test("bootstrap preserves valid quoted legacy credentials and transport parameters", (t) => {
  const dir = fixture(t),
    deploy = join(dir, ".local/deploy");
  mkdirSync(deploy, { recursive: true });
  const file = join(deploy, "compose.env"),
    original = `DATABASE_URL="postgresql://owner:placeholder@db/fundicate?sslmode=verify-full&schema=public"\r\nAPP_ORIGIN='http://127.0.0.1:3000'\r\n`;
  writeFileSync(file, original, { mode: 0o600 });
  const result = childProcess.spawnSync(
    process.execPath,
    [join(root, "scripts/bootstrap.mjs"), "--docker", "--prepare-only"],
    { cwd: dir, encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
  const saved = readFileSync(file, "utf8");
  assert.ok(saved.startsWith(original));
  const runtime = postgresUrl(
    saved.match(/^RUNTIME_DATABASE_URL=(.+)$/m)[1],
    "RUNTIME_DATABASE_URL",
  );
  assert.equal(runtime.username, "fundicate_app");
  assert.equal(runtime.searchParams.get("sslmode"), "verify-full");
  assert.equal(runtime.searchParams.get("schema"), "public");
  assert.equal(runtime.host, "db");
});

test("backup exclusively reserves private archive and manifest before database work", async (t) => {
  const dir = fixture(t),
    file = join(dir, "archive.dump");
  await mockedOperations(async (context) => {
    context.onConnect = () => {
      for (const output of [file, file + ".manifest.json"]) {
        assert.throws(
          () => writeFileSync(output, "concurrent overwrite", { flag: "wx" }),
          { code: "EEXIST" },
        );
        if (process.platform !== "win32")
          assert.equal(statSync(output).mode & 0o777, 0o600);
      }
    };
    const result = await createBackup(fixtureUrl, file);
    assert.deepEqual(readFileSync(file), archive);
    assert.equal(result.manifest.sha256, digest(archive));
    assert.equal(
      JSON.parse(readFileSync(file + ".manifest.json")).sha256,
      digest(archive),
    );
    assert.equal(context.dumpCalls, 1);
    assert.throws(() => fstatSync(context.outputFd), { code: "EBADF" });
  });
});

test("existing archive or manifest is preserved before any connection", async (t) => {
  const dir = fixture(t);
  for (const suffix of ["", ".manifest.json"]) {
    const file = join(dir, "existing" + (suffix ? "-manifest" : "") + ".dump"),
      existing = file + suffix;
    writeFileSync(existing, "preserve me");
    await mockedOperations(async (context) => {
      await assert.rejects(createBackup(fixtureUrl, file), /already exists/);
      assert.equal(context.connects, 0);
      assert.equal(readFileSync(existing, "utf8"), "preserve me");
    });
  }
});

test("archive path replacement cannot redirect dump writes or publish a false success", async (t) => {
  const dir = fixture(t),
    file = join(dir, "archive.dump"),
    moved = join(dir, "owned-original.dump");
  await mockedOperations(async (context) => {
    context.onSnapshot = () => {
      moveOwned(dir, file, moved);
      writeFileSync(file, "replacement must survive", { flag: "wx" });
    };
    await assert.rejects(createBackup(fixtureUrl, file), /identity changed/);
    assert.equal(readFileSync(file, "utf8"), "replacement must survive");
    assert.deepEqual(readFileSync(moved), archive);
  });
});

test("failed dumps retain private partial files without a valid success manifest", async (t) => {
  const dir = fixture(t),
    file = join(dir, "failed.dump");
  await mockedOperations(async (context) => {
    context.failDump = true;
    await assert.rejects(
      createBackup(fixtureUrl, file),
      /Private diagnostics were withheld/,
    );
    assert.deepEqual(readFileSync(file), archive);
    assert.equal(readFileSync(file + ".manifest.json").length, 0);
    if (process.platform !== "win32")
      assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.throws(() => fstatSync(context.outputFd), { code: "EBADF" });
  });
});

test("restore consumes the same opened archive bytes that passed checksum verification", async (t) => {
  const dir = fixture(t),
    file = join(dir, "trusted.dump"),
    moved = join(dir, "original.dump");
  writeFileSync(file, archive);
  writeFileSync(
    file + ".manifest.json",
    JSON.stringify({
      version: 1,
      format: "postgresql-custom",
      sha256: digest(archive),
      tables: [],
    }),
  );
  await mockedOperations(async (context) => {
    context.onRestore = () => {
      moveOwned(dir, file, moved);
      writeFileSync(file, "tampered archive path", { flag: "wx" });
    };
    const result = await restoreBackup(
      fixtureUrl,
      file,
      `fundicate_restore_${Date.now()}_${process.pid}`,
    );
    assert.equal(result.matchedSnapshot, true);
    assert.deepEqual(context.restoredBytes, archive);
    assert.equal(readFileSync(file, "utf8"), "tampered archive path");
    assert.throws(() => fstatSync(context.inputFd), { code: "EBADF" });
  });
});

test("restore rejects checksum mismatch before creating or connecting to a recovery database", async (t) => {
  const dir = fixture(t),
    file = join(dir, "untrusted.dump");
  writeFileSync(file, archive);
  writeFileSync(
    file + ".manifest.json",
    JSON.stringify({
      version: 1,
      format: "postgresql-custom",
      sha256: "0".repeat(64),
      tables: [],
    }),
  );
  await mockedOperations(async (context) => {
    await assert.rejects(
      restoreBackup(
        fixtureUrl,
        file,
        `fundicate_restore_${Date.now()}_${process.pid}`,
      ),
      /checksum mismatch/,
    );
    assert.equal(context.connects, 0);
    assert.equal(context.creates, 0);
    assert.equal(context.restoreCalls, 0);
  });
});
