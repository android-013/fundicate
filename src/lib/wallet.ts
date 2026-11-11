import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { atomic } from "./service";
import { ensure } from "./errors";
import { hashToken } from "./auth";
import { requireRecentAuthentication } from "./session-security";
import { validateRuntimeConfig } from "./runtime-config";
import { uuid } from "./validation";
import { accountIdSchema } from "./chain-core";
import { NearRpc } from "./near-rpc";
import { verifyWalletSignature } from "./wallet-core";

export async function createWalletChallenge(
  userId: string,
  token: string,
  input: unknown,
  now = new Date(),
) {
  await requireRecentAuthentication(userId, token, now);
  const { accountId } = z
    .object({ accountId: accountIdSchema })
    .strict()
    .parse(input);
  const origin = new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000")
    .origin;
  const nonce = randomBytes(32).toString("base64");
  const expiresAt = new Date(now.getTime() + 5 * 60000);
  const message = `Fundicate wallet ownership\nNetwork: testnet\nAccount: ${accountId}\nOrigin: ${origin}\nUser: ${userId}\nExpires: ${expiresAt.toISOString()}\nThis signature links this wallet. It authorizes no transfer.`;
  const challenge = await db.walletChallenge.create({
    data: {
      userId,
      sessionHash: hashToken(token),
      accountId,
      network: "testnet",
      origin,
      nonce,
      message,
      expiresAt,
      createdAt: now,
    },
  });
  return {
    id: challenge.id,
    message,
    nonce,
    recipient: new URL(origin).host,
    expiresAt: expiresAt.toISOString(),
    accountId,
    network: "testnet",
  };
}
export async function verifyWalletChallenge(
  userId: string,
  token: string,
  input: unknown,
  now = new Date(),
  clock: () => Date = () => new Date(),
) {
  const { near } = validateRuntimeConfig();
  ensure(near, "The NEAR testnet integration is disabled.", 404);
  const rpc = new NearRpc(near.rpcUrl);
  await requireRecentAuthentication(userId, token, now);
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
      challenge.userId === userId &&
      challenge.sessionHash === hashToken(token) &&
      challenge.accountId === data.accountId &&
      challenge.origin === origin &&
      challenge.network === "testnet" &&
      !challenge.consumedAt &&
      challenge.expiresAt > now,
    "Wallet challenge expired or unavailable.",
    409,
  );
  ensure(
    verifyWalletSignature({
      message: challenge.message,
      nonce: challenge.nonce,
      recipient: new URL(origin).host,
      publicKey: data.publicKey,
      signature: data.signature,
    }),
    "The wallet signature is invalid.",
    403,
  );
  // An arbitrary key signature does not prove it controls the claimed account.
  // NEP-413 requires a currently authorized full-access key at finality.
  await rpc.assertTestnet();
  const key = await rpc.call<{ permission: unknown }>("query", {
    request_type: "view_access_key",
    finality: "final",
    account_id: data.accountId,
    public_key: data.publicKey,
  });
  ensure(
    key.permission === "FullAccess",
    "Wallet ownership requires an authorized full-access key.",
    403,
  );
  return atomic(async (tx) => {
    const commitNow = clock();
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    ensure(
      session?.userId === userId &&
        !session.revokedAt &&
        session.expiresAt > commitNow &&
        session.reauthenticatedAt &&
        session.reauthenticatedAt.getTime() > commitNow.getTime() - 5 * 60000,
      "Confirm your password again before completing this wallet link.",
      428,
    );
    const consumed = await tx.walletChallenge.updateMany({
      where: {
        id: challenge.id,
        userId,
        sessionHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: commitNow },
      },
      data: { consumedAt: commitNow },
    });
    ensure(
      consumed.count === 1,
      "This wallet challenge has already been used.",
      409,
    );
    const previous = await tx.walletLink.findUnique({
      where: {
        network_accountId: { network: "testnet", accountId: data.accountId },
      },
    });
    ensure(
      !previous || previous.userId === userId,
      "This wallet is already linked to another account.",
      409,
    );
    return tx.walletLink.upsert({
      where: {
        network_accountId: { network: "testnet", accountId: data.accountId },
      },
      create: {
        userId,
        network: "testnet",
        accountId: data.accountId,
        publicKey: data.publicKey,
        verifiedAt: commitNow,
      },
      update: {
        publicKey: data.publicKey,
        verifiedAt: commitNow,
        revokedAt: null,
      },
    });
  });
}
export async function revokeWalletLink(
  userId: string,
  token: string,
  input: unknown,
) {
  await requireRecentAuthentication(userId, token);
  const { id } = z.object({ id: uuid }).strict().parse(input);
  const updated = await db.walletLink.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  ensure(updated.count === 1, "Wallet link not found.", 404);
}
