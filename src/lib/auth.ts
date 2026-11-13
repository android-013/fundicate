import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { AppError, ensure } from "./errors";
import { loginSchema, registerSchema } from "./validation";
const derive = promisify(scrypt);
export const sessionCookie = "fundicate_session";
export const hashToken = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const keyHash = hashToken(key);
  const rows = await db.$queryRaw<
    { count: number; retryAfter: number }[]
  >`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${keyHash},1,NOW() + ${seconds} * INTERVAL '1 second') ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."expiresAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END, "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE "RateLimit"."expiresAt" END RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - NOW()))))::integer AS "retryAfter"`;
  if (rows[0].count > limit)
    throw new AppError(
      "Too many attempts. Please try again later.",
      429,
      rows[0].retryAfter,
    );
}
export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  return db.user.create({
    data: {
      email: data.email,
      username: data.username,
      displayName: data.displayName,
      passwordHash: await hashPassword(data.password),
    },
  });
}
export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await db.user.findUnique({ where: { email: data.email } });
  // Always perform the expensive derivation to reduce account enumeration timing differences.
  const dummy = "scrypt:00000000000000000000000000000000:" + "00".repeat(64);
  const valid = await verifyPassword(
    data.password,
    user?.passwordHash ?? dummy,
  );
  ensure(user && valid, "Email or password is incorrect.", 401);
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      reauthenticatedAt: new Date(),
    },
  });
  return { token, expiresAt };
}
export async function userForToken(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  return session && !session.revokedAt && session.expiresAt > new Date()
    ? session.user
    : null;
}
export async function currentUser() {
  return userForToken((await cookies()).get(sessionCookie)?.value);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
