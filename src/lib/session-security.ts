import { z } from "zod";
import { db } from "./db";
import { ensure } from "./errors";
import { hashToken, verifyPassword } from "./auth";

export async function requireRecentAuthentication(
  userId: string,
  token: string,
  now = new Date(),
) {
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  ensure(
    session?.userId === userId &&
      !session.revokedAt &&
      session.expiresAt > now &&
      session.reauthenticatedAt &&
      session.reauthenticatedAt.getTime() > now.getTime() - 5 * 60000,
    "Confirm your identity in Security before this sensitive action (valid for five minutes).",
    428,
  );
  return session;
}
export async function reauthenticate(
  userId: string,
  token: string,
  input: unknown,
) {
  const { password } = z
    .object({ password: z.string().min(1).max(200) })
    .strict()
    .parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  ensure(
    user.passwordHash && (await verifyPassword(password, user.passwordHash)),
    "Password confirmation failed.",
    401,
  );
  const updated = await db.session.updateMany({
    where: {
      userId,
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { reauthenticatedAt: new Date() },
  });
  ensure(updated.count === 1, "Sign in again to confirm your password.", 401);
}
