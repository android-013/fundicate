import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeBase58, nep413Hash, verifyWalletSignature } from "../src/lib/wallet-core";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Buffer) {
  let value = BigInt("0x" + bytes.toString("hex"));
  let encoded = "";
  while (value > 0n) { encoded = alphabet[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = "1" + encoded; }
  return encoded;
}
function signedFixture(callbackUrl?: string) {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = "ed25519:" + base58(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  const nonce = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  const message = "Fundicate wallet ownership\nNetwork: testnet\nOrigin: https://fundicate.example\nThis signature authorizes no transfer.";
  const recipient = "fundicate.example";
  const signature = sign(null, nep413Hash(message, nonce, recipient, callbackUrl), pair.privateKey).toString("base64");
  // Generated test keys remain in memory. No real account, wallet approval or chain operation occurs.
  return { message, recipient, nonce: nonce.toString("base64"), publicKey, signature, ...(callbackUrl ? { callbackUrl } : {}) };
}

describe("NEP-413 ownership signature conformance", () => {
  it("matches the official NEP-413 hi/[0..31]/myapp.com/callback example's independent Borsh bytes", () => {
    // https://github.com/near/NEPs/blob/master/neps/nep-0413.md#example
    // Independent literal: u32 tag, message length/UTF8, fixed nonce, recipient,
    // Option::Some byte, callback length/UTF8. The standard does not publish a digest;
    // this golden digest is computed from those independently specified bytes.
    const bytes = Buffer.from("9d010080020000006869000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f090000006d796170702e636f6d01120000006d796170702e636f6d2f63616c6c6261636b", "hex");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("c9ce5de288f7de6d83e2303e56c7615949da83867ea33c0747ed45c47ef50148");
    expect(nep413Hash("hi", Buffer.from(Array.from({ length: 32 }, (_, i) => i)), "myapp.com", "myapp.com/callback").toString("hex")).toBe("c9ce5de288f7de6d83e2303e56c7615949da83867ea33c0747ed45c47ef50148");
    expect(bytes.readUInt32LE(0)).toBe(2 ** 31 + 413);
  });
  it("verifies a generated genuine Ed25519 signature of the tagged payload hash", () => {
    expect(verifyWalletSignature(signedFixture())).toBe(true);
  });
  it("includes the optional callback URL in the signed payload", () => {
    const fixture = signedFixture("https://fundicate.example/settings/security");
    expect(verifyWalletSignature(fixture)).toBe(true);
    expect(verifyWalletSignature({ ...fixture, callbackUrl: undefined })).toBe(false);
    expect(verifyWalletSignature({ ...fixture, callbackUrl: "https://attacker.invalid/return" })).toBe(false);
  });
  it("rejects a changed domain recipient and modified nonce", () => {
    const fixture = signedFixture();
    expect(verifyWalletSignature({ ...fixture, recipient: "attacker.invalid" })).toBe(false);
    expect(verifyWalletSignature({ ...fixture, nonce: Buffer.alloc(32, 7).toString("base64") })).toBe(false);
  });
  it("rejects a changed account/network/origin statement", () => {
    const fixture = signedFixture();
    for (const message of [fixture.message.replace("testnet", "mainnet"), fixture.message.replace("fundicate.example", "foreign.invalid"), fixture.message + "\nAccount: attacker.testnet"])
      expect(verifyWalletSignature({ ...fixture, message })).toBe(false);
  });
  it("rejects a different signing key even when both key formats are valid", () => {
    const fixture = signedFixture();
    expect(verifyWalletSignature({ ...fixture, publicKey: signedFixture().publicKey })).toBe(false);
  });
  it("requires a fixed 32-byte nonce and does not throw on malformed submitted signatures", () => {
    const fixture = signedFixture();
    expect(() => nep413Hash("message", Buffer.alloc(31), "fundicate.example")).toThrow("32 bytes");
    for (const nonce of ["!", Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64")]) expect(verifyWalletSignature({ ...fixture, nonce })).toBe(false);
    for (const signature of ["", "not-base64", Buffer.alloc(64).toString("base64")]) expect(verifyWalletSignature({ ...fixture, signature })).toBe(false);
  });
  it("does not accept a plain untagged message signature as ownership proof", () => {
    const pair = generateKeyPairSync("ed25519");
    const fixture = signedFixture();
    const publicKey = "ed25519:" + base58(pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32));
    const signature = sign(null, Buffer.from(fixture.message), pair.privateKey).toString("base64");
    expect(verifyWalletSignature({ ...fixture, publicKey, signature })).toBe(false);
  });
  it("round-trips leading zero bytes and rejects invalid base58 key alphabets", () => {
    const bytes = Buffer.concat([Buffer.alloc(3), Buffer.from(Array.from({ length: 29 }, (_, i) => i + 1))]);
    expect(decodeBase58(base58(bytes))).toEqual(bytes);
    for (const invalid of ["", "0", "O", "I", "l", "1".repeat(101)]) expect(() => decodeBase58(invalid)).toThrow();
    const fixture = signedFixture();
    for (const publicKey of ["secp256k1:" + fixture.publicKey.slice(8), "ed25519:O0Il", "ed25519:" + "1".repeat(32)]) expect(verifyWalletSignature({ ...fixture, publicKey })).toBe(false);
  });
});
