import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import {
  sanitizeStandaloneEnvironment,
  standaloneEnvironmentFiles,
} from "../scripts/build-artifacts.mjs";

describe("standalone secret packaging boundary", () => {
  it("removes copied env files while preserving source secrets and server code", () => {
    const fixture = mkdtempSync(resolve(".local/artifact-test-"));
    const output = join(fixture, ".next", "standalone");
    mkdirSync(join(output, "nested"), { recursive: true });
    writeFileSync(join(fixture, ".env"), "PRIVATE_FIXTURE=source-value");
    writeFileSync(join(output, ".env"), "PRIVATE_FIXTURE=source-value");
    writeFileSync(
      join(output, "nested", ".env.production"),
      "PRIVATE_FIXTURE=source-value",
    );
    writeFileSync(join(output, "server.js"), "// server code");
    try {
      expect(standaloneEnvironmentFiles(output)).toHaveLength(2);
      expect(sanitizeStandaloneEnvironment(output)).toBe(2);
      expect(standaloneEnvironmentFiles(output)).toHaveLength(0);
      expect(readFileSync(join(fixture, ".env"), "utf8")).toBe(
        "PRIVATE_FIXTURE=source-value",
      );
      expect(existsSync(join(output, "server.js"))).toBe(true);
      expect(() => sanitizeStandaloneEnvironment(fixture)).toThrow(
        "Unsafe standalone",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
