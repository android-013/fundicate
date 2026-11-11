import { describe, expect, it } from "vitest";
import {
  assertRuntimeReady,
  runtimeSummary,
  validateRuntimeConfig,
} from "../src/lib/runtime-config";

const base = {
  TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
  APP_ORIGIN: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://app:secret@127.0.0.1:5432/fundicate",
};
describe("portable runtime boundary", () => {
  it("runs standalone without any wallet, RPC or signing credentials", () => {
    const config = validateRuntimeConfig(base);
    expect(config.mode).toBe("standalone");
    expect(config.near).toBeNull();
    expect(JSON.stringify(runtimeSummary(config))).not.toMatch(
      /secret|postgresql|5432/,
    );
    expect(() =>
      validateRuntimeConfig({ ...base, NEXT_PUBLIC_PRIVATE_KEY: "do-not-log" }),
    ).toThrow("public environment");
  });
  it("rejects public plaintext origins, seeded production and remote database downgrade", () => {
    expect(() =>
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        APP_ORIGIN: "http://fundicate.example",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        ALLOW_DEMO_SEED: "true",
      }),
    ).toThrow("ALLOW_DEMO_SEED");
    expect(() =>
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://app:secret@db.example/fundicate?sslmode=require",
      }),
    ).toThrow("verified TLS");
    expect(
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://app:secret@db/fundicate",
        DATABASE_ALLOW_INSECURE_INTERNAL: "true",
      }).production,
    ).toBe(true);
  });
  it("accepts verified database transport and rejects malformed origin paths", () => {
    expect(
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        APP_ORIGIN: "https://fundicate.example",
        DATABASE_URL:
          "postgresql://app:secret@db.example/fundicate?sslmode=verify-full",
      }).origin,
    ).toBe("https://fundicate.example");
    for (const APP_ORIGIN of [
      "https://a.example/path",
      "https://user:secret@a.example",
      "https://a.example?q=1",
      "file:///tmp/a",
    ])
      expect(() => validateRuntimeConfig({ ...base, APP_ORIGIN })).toThrow(
        "APP_ORIGIN",
      );
  });
  it("accepts only an explicitly configured testnet treasury", () => {
    const testnet = {
      ...base,
      FUNDICATE_MODE: "near-testnet",
      NEAR_CONTRACT_ID: "fundicate.testnet",
      NEAR_CONTRACT_CODE_HASH: "A".repeat(43),
    };
    expect(validateRuntimeConfig(testnet).near).toMatchObject({
      network: "testnet",
      contractId: "fundicate.testnet",
      codeHash: testnet.NEAR_CONTRACT_CODE_HASH,
    });
    expect(() =>
      validateRuntimeConfig({ ...testnet, NEAR_CONTRACT_ID: "fundicate.near" }),
    ).toThrow("NEAR_CONTRACT_ID");
    expect(() =>
      validateRuntimeConfig({ ...testnet, NEAR_CONTRACT_CODE_HASH: "" }),
    ).toThrow("NEAR_CONTRACT_CODE_HASH");
    expect(() =>
      validateRuntimeConfig({
        ...testnet,
        NEAR_RPC_URL: "http://untrusted.test",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      validateRuntimeConfig({
        ...testnet,
        NEAR_SIGNER_PRIVATE_KEY: "not-an-app-secret",
      }),
    ).toThrow("does not accept signing keys");
    for (const FUNDICATE_MODE of ["mainnet", "other"])
      expect(() => validateRuntimeConfig({ ...base, FUNDICATE_MODE })).toThrow(
        "standalone or near-testnet",
      );
  });
  it("rejects connection-identity query overrides and duplicate TLS parameters", () => {
    for (const query of [
      "host=remote.example",
      "hostaddr=192.0.2.1",
      "user=owner",
      "password=not-a-secret",
      "port=6543",
      "dbname=other",
      "sslmode=verify-full&sslmode=no-verify",
      "%75ser=owner",
      "HOST=remote.example",
    ]) {
      expect(() =>
        validateRuntimeConfig({
          ...base,
          NODE_ENV: "production",
          DATABASE_URL: `postgresql://app:placeholder@127.0.0.1/fundicate?${query}`,
        }),
      ).toThrow("DATABASE_URL");
    }
    expect(
      validateRuntimeConfig({
        ...base,
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://app:placeholder@db.example/fundicate?sslmode=verify-full&schema=public&application_name=fundicate",
      }).production,
    ).toBe(true);
  });
  it("does not report healthy when the database cannot be reached", async () => {
    await expect(
      assertRuntimeReady(async () => {
        throw new Error("database down");
      }, base),
    ).rejects.toThrow("database down");
    await expect(
      assertRuntimeReady(async () => 1, base),
    ).resolves.toMatchObject({ mode: "standalone" });
  });
});
