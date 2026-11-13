import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nep413Hash } from "../src/lib/wallet-core";

const fixture = vi.hoisted(() => ({
  link: {} as Record<string, unknown>,
  challenge: {} as Record<string, unknown>,
  permission: "FullAccess",
  network: "testnet",
  sessions: [] as unknown[],
  newWallet: false,
  walletOnly: false,
  newUsers: [] as unknown[],
}));
vi.mock("../src/lib/auth", () => ({
  hashToken: (s: string) => createHash("sha256").update(s).digest("hex"),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    $queryRaw: async () => [],
    user: {
      findUniqueOrThrow: async () => ({
        passwordHash: fixture.walletOnly ? null : "existing-password-hash",
      }),
      create: async (input: unknown) => {
        fixture.newUsers.push(input);
        return { id: "new-user" };
      },
    },
    walletLink: {
      findUnique: async () => (fixture.newWallet ? null : fixture.link),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        fixture.link = data;
        fixture.newWallet = false;
        return data;
      },
    },
    walletChallenge: {
      create: async ({ data }: { data: object }) =>
        (fixture.challenge = {
          id: "827747dc-c50c-4bbf-85c9-d95b921315ce",
          consumedAt: null,
          ...data,
        }),
      findUnique: async () => fixture.challenge,
      updateMany: async () => {
        if (
          fixture.challenge.consumedAt ||
          (fixture.challenge.expiresAt as Date) <= new Date()
        )
          return { count: 0 };
        fixture.challenge.consumedAt = new Date();
        return { count: 1 };
      },
    },
    session: { create: async (s: unknown) => fixture.sessions.push(s) },
  },
}));
vi.mock("../src/lib/service", async () => {
  const { db } = await import("../src/lib/db");
  return { atomic: (fn: (tx: typeof db) => unknown) => fn(db) };
});
vi.mock("../src/lib/near-rpc", () => ({
  NearRpc: class {
    async assertTestnet() {
      if (fixture.network !== "testnet") throw new Error("Wrong network");
    }
    async call() {
      return { permission: fixture.permission };
    }
  },
}));

import {
  createWalletLoginChallenge,
  verifyWalletLogin,
} from "../src/lib/wallet-login";
const pair = generateKeyPairSync("ed25519");
const raw = pair.publicKey
  .export({ type: "spki", format: "der" })
  .subarray(-32);
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let n = BigInt(`0x${raw.toString("hex")}`),
  encoded = "";
while (n) {
  encoded = alphabet[Number(n % 58n)] + encoded;
  n /= 58n;
}
for (const byte of raw) {
  if (byte) break;
  encoded = "1" + encoded;
}
const publicKey = `ed25519:${encoded}`;
const token = "a".repeat(64);
async function proof() {
  const c = await createWalletLoginChallenge(
    { accountId: "alice.testnet" },
    token,
  );
  return {
    challengeId: c.id,
    accountId: "alice.testnet",
    publicKey,
    signature: sign(
      null,
      nep413Hash(c.message, Buffer.from(c.nonce, "base64"), c.recipient),
      pair.privateKey,
    ).toString("base64"),
  };
}
beforeEach(() => {
  vi.stubEnv("NEAR_WALLET_LOGIN", "true");
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  fixture.link = { userId: "user", revokedAt: null, publicKey };
  fixture.newWallet = false;
  fixture.walletOnly = false;
  fixture.newUsers = [];
  fixture.challenge = {};
  fixture.sessions = [];
  fixture.permission = "FullAccess";
  fixture.network = "testnet";
});
describe("testnet wallet authentication", () => {
  it("creates a wallet-only user only after a valid ownership proof", async () => {
    fixture.newWallet = true;
    fixture.walletOnly = true;
    const p = await proof();
    expect(fixture.newUsers).toHaveLength(0);
    await verifyWalletLogin(p, token);
    expect(fixture.newUsers).toHaveLength(1);
    expect(fixture.newUsers[0]).toMatchObject({
      data: { email: null, passwordHash: null },
    });
    expect(fixture.sessions[0]).toMatchObject({
      data: { userId: "new-user", reauthenticatedAt: expect.any(Date) },
    });
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
    expect(fixture.newUsers).toHaveLength(1);
  });
  it("does not create users for invalid signup signatures", async () => {
    fixture.newWallet = true;
    const p = await proof();
    await expect(
      verifyWalletLogin({ ...p, signature: "invalid" }, token),
    ).rejects.toThrow();
    expect(fixture.newUsers).toHaveLength(0);
  });
  it("issues a session after a real signed proof, without password reauthentication", async () => {
    const session = await verifyWalletLogin(await proof(), token);
    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.sessions).toHaveLength(1);
    expect(fixture.sessions[0]).toMatchObject({
      data: { reauthenticatedAt: expect.any(Date) },
    });
  });
  it("rejects replay", async () => {
    const p = await proof();
    await verifyWalletLogin(p, token);
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
    expect(fixture.sessions).toHaveLength(1);
  });
  it("binds challenges to the requesting browser", async () => {
    await expect(
      verifyWalletLogin(await proof(), "b".repeat(64)),
    ).rejects.toThrow();
  });
  it("rejects expired challenges", async () => {
    const p = await proof();
    fixture.challenge.expiresAt = new Date(0);
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
  });
  it("rejects tampered signatures", async () => {
    const p = await proof();
    await expect(
      verifyWalletLogin({ ...p, signature: "A".repeat(86) + "==" }, token),
    ).rejects.toThrow();
  });
  it("rejects function-call keys", async () => {
    const p = await proof();
    fixture.permission = "FunctionCall";
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
  });
  it("rejects the wrong chain", async () => {
    const p = await proof();
    fixture.network = "mainnet";
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
  });
  it("rechecks revocation before creating a session", async () => {
    const p = await proof();
    fixture.link.revokedAt = new Date();
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
    expect(fixture.sessions).toHaveLength(0);
  });
  it("rejects changes to the linked key", async () => {
    const p = await proof();
    fixture.link.publicKey = "different";
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
  });
  it("rejects linking challenges as login proofs", async () => {
    const p = await proof();
    fixture.challenge.sessionHash = createHash("sha256")
      .update(token)
      .digest("hex");
    await expect(verifyWalletLogin(p, token)).rejects.toThrow();
  });
  it("can be disabled independently", async () => {
    vi.stubEnv("NEAR_WALLET_LOGIN", "false");
    await expect(proof()).rejects.toThrow();
  });
});
