import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { db } from "../src/lib/db";
import {
  rateLimit,
  hashToken,
  register,
  createSession,
  sessionCookie,
} from "../src/lib/auth";
import { AppError } from "../src/lib/errors";

const origin = process.env.APP_ORIGIN!;
let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`PASS ${++checks}: ${name}`);
}
function post(
  operation: string,
  body: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(`${origin}/api/${operation}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
}
async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL!).pathname,
    /^\/fundicate_test_/,
  );
  await check(
    "all retired chain and wallet APIs fail closed without credentials or network",
    async () => {
      for (const op of [
        "wallet-challenge",
        "wallet-verify",
        "wallet-revoke",
        "chain-create",
        "chain-prepare",
        "chain-authorize",
        "chain-submitted",
        "chain-reconcile",
      ])
        assert.equal((await post(op, {})).status, 404, op);
      assert.equal(
        (await fetch(origin + "/settings/wallet", { redirect: "manual" }))
          .status,
        307,
      );
    },
  );
  await check(
    "CSRF, JSON shape/media and hostile nesting rejected before mutations",
    async () => {
      assert.equal(
        (await post("register", {}, { Origin: "https://attacker.invalid" }))
          .status,
        403,
      );
      assert.equal(
        (await post("register", {}, { "Content-Type": "application/jsonp" }))
          .status,
        415,
      );
      for (const value of [
        "null",
        "[]",
        "{",
        '{"__proto__":{}}',
        JSON.stringify({
          nested: JSON.parse("[".repeat(20) + "0" + "]".repeat(20)),
        }),
      ])
        assert.equal((await post("register", value)).status, 400);
      assert.equal(
        (await post("register", JSON.stringify({ text: "€".repeat(90_000) })))
          .status,
        413,
      );
    },
  );
  await check(
    "SQL-looking identities cannot escape schemas or disclose SQL/server detail",
    async () => {
      for (const body of [
        { email: "' OR 1=1 --", password: "x" },
        { email: "safe@example.invalid", password: "x", admin: true },
      ]) {
        const response = await post("login", body);
        assert.equal(response.status, 400);
        assert.doesNotMatch(
          await response.text(),
          /Prisma|SELECT|INSERT|passwordHash|stack|D:\\|postgresql:/i,
        );
        assert.ok(response.headers.get("cache-control")?.includes("no-store"));
        assert.match(response.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
      }
      assert.equal(
        (await db.$queryRaw<{ ok: number }[]>`SELECT 1::integer AS ok`)[0].ok,
        1,
      );
    },
  );
  await check(
    "limiter thresholds remain atomic under concurrency, expire and return retry time",
    async () => {
      const key = `security:${randomUUID()}`;
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () => rateLimit(key, 3, 60)),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
      for (const r of results)
        if (r.status === "rejected") {
          assert.ok(r.reason instanceof AppError);
          assert.equal(r.reason.status, 429);
          assert.ok(
            (r.reason.retryAfter ?? 0) >= 1 && (r.reason.retryAfter ?? 0) <= 60,
          );
        }
      await db.rateLimit.update({
        where: { key: hashToken(key) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await rateLimit(key, 3, 60);
      assert.equal(
        (
          await db.rateLimit.findUniqueOrThrow({
            where: { key: hashToken(key) },
          })
        ).count,
        1,
      );
    },
  );
  await check(
    "case-cycling the same email cannot bypass auth quota; 429 contains Retry-After",
    async () => {
      const email = `security-${randomUUID()}@example.invalid`;
      for (let i = 0; i < 10; i++)
        assert.equal(
          (
            await post("login", {
              email: i % 2 ? email.toUpperCase() : email,
              password: "wrong",
            })
          ).status,
          401,
        );
      const limited = await post("login", { email, password: "wrong" });
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
    },
  );
  await check(
    "expired/revoked sessions and cross-user session revocations fail safely",
    async () => {
      const id = randomUUID().replaceAll("-", "").slice(0, 10);
      const user = await register({
        email: `s${id}@example.invalid`,
        username: `s${id}`,
        displayName: "Security User",
        password: "LongSecurePassword!2026",
      });
      const session = await createSession(user.id);
      await db.session.update({
        where: { tokenHash: hashToken(session.token) },
        data: { revokedAt: new Date() },
      });
      assert.equal(
        (
          await post(
            "profile",
            { displayName: "Attacker", avatarUrl: "" },
            { Cookie: `${sessionCookie}=${session.token}` },
          )
        ).status,
        401,
      );
      const expired = await createSession(user.id);
      await db.session.update({
        where: { tokenHash: hashToken(expired.token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.equal(
        (
          await post(
            "profile",
            { displayName: "Expired", avatarUrl: "" },
            { Cookie: `${sessionCookie}=${expired.token}` },
          )
        ).status,
        401,
      );
      const attacker = await register({
        email: `a${id}@example.invalid`,
        username: `a${id}`,
        displayName: "Other User",
        password: "LongSecurePassword!2026",
      });
      const attackerSession = await createSession(attacker.id);
      const victimSession = await createSession(user.id);
      const victim = await db.session.findUniqueOrThrow({
        where: { tokenHash: hashToken(victimSession.token) },
      });
      const cookie = { Cookie: `${sessionCookie}=${attackerSession.token}` };
      assert.equal(
        (await post("revoke-session", { sessionId: victim.id }, cookie)).status,
        200,
      );
      assert.equal(
        (await db.session.findUniqueOrThrow({ where: { id: victim.id } }))
          .revokedAt,
        null,
      );
      await db.session.update({
        where: { tokenHash: hashToken(attackerSession.token) },
        data: { reauthenticatedAt: new Date(Date.now() - 6 * 60000) },
      });
      assert.equal(
        (await post("revoke-session", { sessionId: victim.id }, cookie)).status,
        428,
      );
    },
  );
  await check(
    "unexpected database failures expose a generic response and opaque request ID",
    async () => {
      const user = await db.user.findFirstOrThrow();
      const session = await createSession(user.id);
      await db.$executeRaw`ALTER TABLE "SavedAnalyticsView" RENAME TO "SecurityUnavailableView"`;
      try {
        const response = await post(
          "analytics-delete-view",
          { id: randomUUID() },
          { Cookie: `${sessionCookie}=${session.token}` },
        );
        assert.equal(response.status, 500);
        assert.doesNotMatch(
          await response.text(),
          /Prisma|SavedAnalyticsView|SecurityUnavailable|DELETE|postgresql:|stack|password/i,
        );
        assert.match(response.headers.get("x-request-id")!, /^[a-f0-9-]{36}$/);
        assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      } finally {
        await db.$executeRaw`ALTER TABLE "SecurityUnavailableView" RENAME TO "SavedAnalyticsView"`;
      }
    },
  );
  await check(
    "deployment runtime role cannot change schema or migration evidence",
    async () => {
      assert.equal(
        (
          await db.$queryRaw<
            { exists: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fundicate_app') AS exists`
        )[0].exists,
        false,
        "Role exercise requires its own unused local test role.",
      );
      const runtimeUrl = new URL(process.env.DATABASE_URL!);
      runtimeUrl.username = "fundicate_app";
      runtimeUrl.password = randomUUID().replaceAll("-", "");
      const result = spawnSync(
        process.execPath,
        ["scripts/provision-runtime-role.mjs"],
        {
          env: { ...process.env, RUNTIME_DATABASE_URL: runtimeUrl.href },
          stdio: "pipe",
          windowsHide: true,
        },
      );
      assert.equal(
        result.status,
        0,
        "Operator provisioning must succeed without exposing its private output.",
      );
      const app = new pg.Client({ connectionString: runtimeUrl.href });
      await app.connect();
      try {
        const role = await app.query(
          "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        );
        assert.deepEqual(role.rows[0], {
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
        });
        await app.query('SELECT id FROM "User" LIMIT 1');
        await app.query(
          "SELECT migration_name FROM _prisma_migrations LIMIT 1",
        );
        await assert.rejects(
          app.query('CREATE TABLE "SecurityForbiddenTable" (id integer)'),
          /permission denied/i,
        );
        await assert.rejects(
          app.query('TRUNCATE "ExternalPaymentRecord"'),
          /permission denied/i,
        );
        await assert.rejects(
          app.query('ALTER TABLE "ExternalPaymentRecord" DISABLE TRIGGER USER'),
          /owner/i,
        );
        await assert.rejects(
          app.query("UPDATE _prisma_migrations SET logs='forged'"),
          /permission denied/i,
        );
      } finally {
        await app.end();
        await db.$executeRaw`DROP OWNED BY fundicate_app`;
        await db.$executeRaw`DROP ROLE fundicate_app`;
      }
    },
  );
  console.log(`${checks} security groups passed; isolated database only.`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
