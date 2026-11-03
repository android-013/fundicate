import {
  mkdirSync,
  readdirSync,
  rmSync,
  existsSync,
  lstatSync,
  copyFileSync,
} from "node:fs";
import { resolve, relative, dirname, basename, join } from "node:path";
import { spawnSync } from "node:child_process";
const buildTemp = resolve(".local/build-temp");
mkdirSync(buildTemp, { recursive: true });
const projectRoot = resolve(".");
const buildOutput = resolve(projectRoot, ".next");
if (
  dirname(buildOutput) !== projectRoot ||
  basename(buildOutput) !== ".next" ||
  (existsSync(buildOutput) && lstatSync(buildOutput).isSymbolicLink())
)
  throw new Error("Unsafe build output path");
// This directory contains generated build output only; source and .local are outside it.
rmSync(buildOutput, { recursive: true, force: true });
function prepare(source) {
  const subpath = relative(resolve("src/app"), source);
  for (const prefix of ["server/app", "static/chunks/app"])
    mkdirSync(join(buildOutput, prefix, subpath), { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true }))
    if (entry.isDirectory()) prepare(join(source, entry.name));
}
prepare(resolve("src/app"));
for (const subpath of [
  "server/chunks",
  "server/vendor-chunks",
  "static/chunks",
  "static/css",
  "diagnostics",
  "cache",
])
  mkdirSync(join(buildOutput, subpath), { recursive: true });
const run = (mode) =>
  spawnSync(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "build",
      "--webpack",
      ...(mode ? ["--experimental-build-mode", mode] : []),
    ],
    {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, TEMP: buildTemp, TMP: buildTemp },
    },
  ).status ?? 1;
if (process.platform !== "win32") process.exitCode = run();
else {
  // Next's supported compile/generate split lets us create nested RSC output
  // directories synchronously before Windows prerender workers write to them.
  // Both phases run: this does not skip static generation or production output.
  const compiled = run("compile");
  if (compiled !== 0) process.exitCode = compiled;
  else {
    for (const page of [
      "index",
      "login",
      "register",
      "_not-found",
      "_global-error",
    ]) {
      const base = resolve(".next/server/app", page + ".segments");
      for (const segment of [
        "_not-found",
        "_global-error",
        "login",
        "register",
        "(auth)/login",
        "(auth)/register",
      ])
        mkdirSync(resolve(base, segment), { recursive: true });
    }
    // Next 16.4 renames proxy artifacts during both split phases. Restore the
    // compiled name for generate; it will finalize the same artifacts again.
    for (const suffix of ["js", "js.nft.json"]) {
      const proxy = join(buildOutput, "server", `proxy.${suffix}`);
      const middleware = join(buildOutput, "server", `middleware.${suffix}`);
      if (!existsSync(proxy) && existsSync(middleware))
        copyFileSync(middleware, proxy);
    }
    process.exitCode = run("generate");
  }
}
