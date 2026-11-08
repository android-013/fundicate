import { existsSync, readdirSync, lstatSync, unlinkSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";

/** Only generated standalone output is eligible. Never follow directory symlinks. */
export function standaloneEnvironmentFiles(root = ".next/standalone") {
  const target = resolve(root);
  if (
    basename(target) !== "standalone" ||
    basename(dirname(target)) !== ".next" ||
    (existsSync(target) && lstatSync(target).isSymbolicLink())
  )
    throw new Error("Unsafe standalone artifact path.");
  const files = [];
  function visit(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (/^\.env(?:\.|$)/.test(item.name) && !item.isDirectory())
        files.push(path);
      else if (item.isDirectory() && !item.isSymbolicLink()) visit(path);
    }
  }
  if (existsSync(target)) visit(target);
  return files;
}
export function sanitizeStandaloneEnvironment(root = ".next/standalone") {
  const files = standaloneEnvironmentFiles(root);
  for (const path of files) unlinkSync(path); // Removes copied file/link, never its source/target.
  return files.length;
}
