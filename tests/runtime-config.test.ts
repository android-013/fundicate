import { describe, expect, it } from "vitest";
import { assertRuntimeReady, runtimeSummary, validateRuntimeConfig } from "../src/lib/runtime-config";

const base = { APP_ORIGIN: "http://127.0.0.1:3000", DATABASE_URL: "postgresql://app:secret@127.0.0.1:5432/fundicate" };
describe("portable runtime boundary", () => {
  it("runs standalone without any wallet, RPC or signing credentials", () => {
    const config = validateRuntimeConfig(base);
    expect(config.mode).toBe("standalone");
    expect(config.near).toBeNull();
    expect(JSON.stringify(runtimeSummary(config))).not.toMatch(/secret|postgresql|5432/);
    expect(() => validateRuntimeConfig({ ...base, NEXT_PUBLIC_PRIVATE_KEY: "do-not-log" })).toThrow("public environment");
  });
  it("rejects public plaintext origins, seeded production and remote database downgrade", () => {
    expect(() => validateRuntimeConfig({ ...base, NODE_ENV: "production", APP_ORIGIN: "http://fundicate.example" })).toThrow("HTTPS");
    expect(() => validateRuntimeConfig({ ...base, NODE_ENV: "production", ALLOW_DEMO_SEED: "true" })).toThrow("ALLOW_DEMO_SEED");
    expect(() => validateRuntimeConfig({ ...base, NODE_ENV: "production", DATABASE_URL: "postgresql://app:secret@db.example/fundicate?sslmode=require" })).toThrow("verified TLS");
    expect(validateRuntimeConfig({ ...base, NODE_ENV: "production", DATABASE_URL: "postgresql://app:secret@db/fundicate", DATABASE_ALLOW_INSECURE_INTERNAL: "true" }).production).toBe(true);
  });
  it("accepts verified database transport and rejects malformed origin paths", () => {
    expect(validateRuntimeConfig({ ...base, NODE_ENV: "production", APP_ORIGIN: "https://fundicate.example", DATABASE_URL: "postgresql://app:secret@db.example/fundicate?sslmode=verify-full" }).origin).toBe("https://fundicate.example");
    for (const APP_ORIGIN of ["https://a.example/path", "https://user:secret@a.example", "https://a.example?q=1", "file:///tmp/a"]) expect(() => validateRuntimeConfig({ ...base, APP_ORIGIN })).toThrow("APP_ORIGIN");
  });
  it("only enables complete explicit testnet configuration and rejects mainnet", () => {
    const live = { ...base, FUNDICATE_MODE: "near-testnet", NEAR_NETWORK: "testnet", NEAR_RPC_URL: "https://rpc.testnet.near.org", NEAR_CONTRACT_ID: "fundicate.testnet", NEAR_CONTRACT_CODE_HASH: "J1AHEHzFoneKY8VU77h55ZMSdvbD9U6ZcQYc6CcrRTCU" };
    expect(validateRuntimeConfig(live).near?.network).toBe("testnet");
    expect(() => validateRuntimeConfig({ ...live, NEAR_NETWORK: "mainnet" })).toThrow("mainnet");
    expect(() => validateRuntimeConfig({ ...live, NEAR_CONTRACT_CODE_HASH: undefined })).toThrow("reviewed deployed WASM");
    expect(() => validateRuntimeConfig({ ...live, NEAR_CONTRACT_ID: "fundicate.near" })).toThrow("testnet");
    expect(() => validateRuntimeConfig({ ...live, NEAR_RPC_URL: "http://rpc.testnet.near.org" })).toThrow("HTTPS");
    expect(() => validateRuntimeConfig({ ...live, NEAR_PRIVATE_KEY: "do-not-log" })).toThrow("signing keys");
    expect(() => validateRuntimeConfig({ ...live, NEXT_PUBLIC_NEAR_PRIVATE_KEY: "do-not-log" })).toThrow("public environment");
  });
  it("does not report healthy when the database cannot be reached", async () => {
    await expect(assertRuntimeReady(async () => { throw new Error("database down"); }, base)).rejects.toThrow("database down");
    await expect(assertRuntimeReady(async () => 1, base)).resolves.toMatchObject({ mode: "standalone" });
  });
});
