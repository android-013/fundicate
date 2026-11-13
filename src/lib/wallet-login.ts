import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { hashToken } from "./auth";
import { atomic } from "./service";
import { ensure } from "./errors";
import { accountIdSchema } from "./chain-core";
import { uuid } from "./validation";
import { NearRpc } from "./near-rpc";
import { verifyWalletSignature } from "./wallet-core";
import { walletLoginEnabled, walletLoginRpcUrl } from "./wallet-auth-config";

export const walletLoginCookie = "fundicate_wallet_login";
const binding = (token: string) => `login:${hashToken(token)}`;

export async function createWalletLoginChallenge(
  input: unknown,
  token: string,
) {
  ensure(walletLoginEnabled(), "Action not found.", 404);
  const { accountId } = z
    .object({ accountId: accountIdSchema })
    .strict()
    .parse(input);
  const link = await db.walletLink.findUnique({
    where: { network_accountId: { network: "testnet", accountId } },
  });
  const origin = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000")
    .origin;
  const expiresAt = new Date(Date.now() + 5 * 60000);
  const challenge = await db.walletChallenge.create({
    data: {
      userId: link?.userId ?? null,
      sessionHash: binding(token),
      accountId,
      network: "testnet",
      origin,
      nonce: randomBytes(32).toString("base64"),
      expiresAt,
      message: `Sign in or create your Fundicate account\nNetwork: testnet\nAccount: ${accountId}\nOrigin: ${origin}\nExpires: ${expiresAt.toISOString()}\nThis signature signs you in, or creates an account if this wallet is new. It authorizes no transfer.`,
    },
  });
  return {
    id: challenge.id,
    message: challenge.message,
    nonce: challenge.nonce,
    recipient: new URL(origin).host,
  };
}

export async function verifyWalletLogin(input: unknown, token: string) {
  ensure(walletLoginEnabled(), "Action not found.", 404);
  ensure(/^[a-f0-9]{64}$/.test(token), "Start wallet sign-in again.", 401);
  const data = z
    .object({
      challengeId: uuid,
      accountId: accountIdSchema,
      publicKey: z.string().max(100),
      signature: z.string().max(100),
    })
    .strict()
    .parse(input);
  const challenge = await db.walletChallenge.findUnique({
    where: { id: data.challengeId },
  });
  const origin = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000")
    .origin;
  ensure(
    challenge &&
      challenge.sessionHash === binding(token) &&
      challenge.accountId === data.accountId &&
      challenge.network === "testnet" &&
      challenge.origin === origin &&
      !challenge.consumedAt &&
      challenge.expiresAt > new Date(),
    "Wallet sign-in expired or unavailable.",
    401,
  );
  ensure(
    verifyWalletSignature({
      message: challenge.message,
      nonce: challenge.nonce,
      recipient: new URL(origin).host,
      publicKey: data.publicKey,
      signature: data.signature,
    }),
    "Invalid wallet signature.",
    403,
  );
  const rpc = new NearRpc(walletLoginRpcUrl());
  await rpc.assertTestnet();
  const key = await rpc.call<{ permission: unknown }>("query", {
    request_type: "view_access_key",
    finality: "final",
    account_id: data.accountId,
    public_key: data.publicKey,
  });
  ensure(
    key.permission === "FullAccess",
    "Wallet sign-in requires a full-access key.",
    403,
  );
  // Consume once and create the session together; a concurrent revoke/verification
  // is serialized. A fresh wallet signature confirms identity for sensitive actions.
  return atomic(async (tx) => {
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${data.accountId}, 413))`;
    const now = new Date();
    let link = await tx.walletLink.findUnique({
      where: {
        network_accountId: { network: "testnet", accountId: data.accountId },
      },
    });
    if (link) {
      ensure(
        !link.revokedAt &&
          (!challenge.userId || link.userId === challenge.userId) &&
          link.publicKey === data.publicKey,
        "Wallet link is unavailable. Use your existing account recovery method.",
        401,
      );
    } else {
      ensure(!challenge.userId, "Wallet link is unavailable.", 401);
    }
    const used = await tx.walletChallenge.updateMany({
      where: {
        id: challenge.id,
        sessionHash: binding(token),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    ensure(used.count === 1, "Wallet sign-in expired or already used.", 409);
    if (!link) {
      const user = await tx.user.create({
        data: {
          username: `near_${randomBytes(12).toString("hex")}`,
          displayName: data.accountId,
          email: null,
          passwordHash: null,
        },
      });
      link = await tx.walletLink.create({
        data: {
          userId: user.id,
          network: "testnet",
          accountId: data.accountId,
          publicKey: data.publicKey,
          verifiedAt: now,
        },
      });
    }
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + 7 * 86400000);
    await tx.session.create({
      data: {
        userId: link.userId,
        tokenHash: hashToken(sessionToken),
        expiresAt,
        reauthenticatedAt: now,
      },
    });
    return { token: sessionToken, expiresAt };
  });
}
