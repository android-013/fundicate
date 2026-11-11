import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  assertSafeRuntimeRole,
  provisionRuntimeRole,
} from "../scripts/provision-runtime-role.mjs";
import { db } from "../src/lib/db";
import {
  rateLimit,
  hashToken,
  register,
  createSession,
  sessionCookie,
} from "../src/lib/auth";
import { AppError } from "../src/lib/errors";
import { createCommunity } from "../src/lib/service";

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
    "legacy suspension requires recent authentication and strict governance remains member-controlled",
    async () => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const actors = await Promise.all(
        ["staff", "target", "member"].map((kind) =>
          register({
            email: `${kind}${suffix}@security.invalid`,
            username: `${kind}${suffix}`,
            displayName: `Authority ${kind}`,
            password: "AuthorityPassword!2026",
          }),
        ),
      );
      const [admin, target, ordinary] = actors;
      const input = {
        name: "Authority regression community",
        slug: `authority-${suffix}`,
        description:
          "An isolated fixture proving sensitive membership actions stay protected.",
        purpose:
          "Verify current-session authority without changing existing communities.",
        currency: "USD",
        minimumContribution: "0",
        questions: "",
      };
      const legacy = await createCommunity(admin.id, input);
      const strict = await createCommunity(admin.id, {
        ...input,
        slug: `strict-${suffix}`,
        governanceProfile: "STRICT",
        founderContribution: "0",
        founderIntroduction:
          "The fictional founder participates under the same published governance rules.",
      });
      await db.communityMembership.createMany({
        data: [legacy, strict].flatMap((community) =>
          [target, ordinary].map((user) => ({
            communityId: community.id,
            userId: user.id,
            declaredContribution: 0n,
            declaredAt: new Date(),
          })),
        ),
      });
      const staffSession = await createSession(admin.id);
      const memberSession = await createSession(ordinary.id);
      const cookie = { Cookie: `${sessionCookie}=${staffSession.token}` };
      const command = {
        communityId: legacy.id,
        userId: target.id,
        action: "suspend",
        reason:
          "A detailed fictional safety concern for the authority regression test.",
      };
      await db.session.update({
        where: { tokenHash: hashToken(staffSession.token) },
        data: { reauthenticatedAt: new Date(Date.now() - 6 * 60000) },
      });
      const before = {
        proposals: await db.proposal.count({
          where: { communityId: legacy.id },
        }),
        audit: await db.auditEvent.count({ where: { communityId: legacy.id } }),
      };
      assert.equal((await post("member", command, cookie)).status, 428);
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: legacy.id, userId: target.id },
            },
          })
        ).status,
        "ACTIVE",
      );
      assert.equal(
        await db.proposal.count({ where: { communityId: legacy.id } }),
        before.proposals,
      );
      assert.equal(
        await db.auditEvent.count({ where: { communityId: legacy.id } }),
        before.audit,
      );
      assert.equal(
        (
          await post("member", command, {
            Cookie: `${sessionCookie}=${memberSession.token}`,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            "reauthenticate",
            { password: "AuthorityPassword!2026" },
            cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await post("member", { ...command, communityId: strict.id }, cookie))
          .status,
        403,
      );
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: strict.id, userId: target.id },
            },
          })
        ).status,
        "ACTIVE",
      );
      assert.equal((await post("member", command, cookie)).status, 200);
      assert.equal(
        (
          await db.communityMembership.findUniqueOrThrow({
            where: {
              communityId_userId: { communityId: legacy.id, userId: target.id },
            },
          })
        ).status,
        "SUSPENDED",
      );
      assert.equal(
        await db.proposal.count({
          where: {
            communityId: legacy.id,
            type: "SUSPENSION_REVIEW",
            targetUserId: target.id,
          },
        }),
        1,
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
    "runtime preflight refuses unsafe reused identities before migrations or role changes",
    async () => {
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      await client.connect();
      const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
      try {
        const database = (
          await client.query("SELECT current_database() AS name")
        ).rows[0].name;
        const version = Number(
          (await client.query("SHOW server_version_num")).rows[0]
            .server_version_num,
        );
        const cases: [
          string,
          (role: string, object: string) => Promise<unknown>,
        ][] = [
          ...[
            "SUPERUSER",
            "CREATEDB",
            "CREATEROLE",
            "REPLICATION",
            "BYPASSRLS",
          ].map((flag): [string, (role: string) => Promise<unknown>] => [
            flag,
            (role) => client.query(`ALTER ROLE ${quote(role)} ${flag}`),
          ]),
          [
            "outgoing membership",
            async (role, object) => {
              await client.query(`CREATE ROLE ${quote(object)}`);
              await client.query(`GRANT ${quote(object)} TO ${quote(role)}`);
            },
          ],
          [
            "incoming membership",
            async (role, object) => {
              await client.query(`CREATE ROLE ${quote(object)}`);
              await client.query(`GRANT ${quote(role)} TO ${quote(object)}`);
            },
          ],
          [
            "database ownership",
            (role) =>
              client.query(
                `ALTER DATABASE ${quote(database)} OWNER TO ${quote(role)}`,
              ),
          ],
          [
            "schema ownership",
            (role, object) =>
              client.query(
                `CREATE SCHEMA ${quote(object)} AUTHORIZATION ${quote(role)}`,
              ),
          ],
          [
            "table ownership",
            async (role, object) => {
              await client.query(
                `CREATE TABLE public.${quote(object)}(id integer)`,
              );
              await client.query(
                `ALTER TABLE public.${quote(object)} OWNER TO ${quote(role)}`,
              );
            },
          ],
          [
            "function ownership",
            async (role, object) => {
              await client.query(
                `CREATE FUNCTION public.${quote(object)}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
              );
              await client.query(
                `ALTER FUNCTION public.${quote(object)}() OWNER TO ${quote(role)}`,
              );
            },
          ],
          [
            "direct SECURITY DEFINER execution",
            async (role, object) => {
              await client.query(
                `CREATE FUNCTION public.${quote(object)}() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text'`,
              );
              await client.query(
                `REVOKE ALL ON FUNCTION public.${quote(object)}() FROM PUBLIC`,
              );
              await client.query(
                `GRANT EXECUTE ON FUNCTION public.${quote(object)}() TO ${quote(role)}`,
              );
            },
          ],
          [
            "PUBLIC SECURITY DEFINER execution",
            async (_role, object) => {
              await client.query(
                `CREATE FUNCTION public.${quote(object)}() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text'`,
              );
              await client.query(
                `GRANT EXECUTE ON FUNCTION public.${quote(object)}() TO PUBLIC`,
              );
            },
          ],
          ...["pg_catalog", "information_schema"].map(
            (
              schema,
            ): [string, (role: string, object: string) => Promise<unknown>] => [
              `custom ${schema} SECURITY DEFINER execution`,
              async (_role, object) =>
                client.query(
                  `CREATE FUNCTION ${quote(schema)}.${quote(object)}() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text'`,
                ),
            ],
          ),
          ...["pg_catalog", "public"].map(
            (
              schema,
            ): [string, (role: string, object: string) => Promise<unknown>] => [
              `custom ${schema} native routine execution`,
              async (_role, object) => {
                const source = (
                  await client.query(
                    "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid='pg_catalog.lo_export(oid,text)'::regprocedure",
                  )
                ).rows[0].prosrc as string;
                assert.match(source, /^[a-zA-Z_][a-zA-Z_0-9]*$/);
                await client.query(
                  `CREATE FUNCTION ${quote(schema)}.${quote(object)}(oid,text) RETURNS integer LANGUAGE internal AS '${source}'`,
                );
              },
            ],
          ),
          [
            "direct restricted native-function execution",
            (role) =>
              client.query(
                `GRANT EXECUTE ON FUNCTION pg_catalog.lo_export(oid,text) TO ${quote(role)}`,
              ),
          ],
          [
            "type ownership",
            async (role, object) => {
              await client.query(
                `CREATE TYPE public.${quote(object)} AS ENUM ('probe')`,
              );
              await client.query(
                `ALTER TYPE public.${quote(object)} OWNER TO ${quote(role)}`,
              );
            },
          ],
          [
            "schema CREATE",
            (role) =>
              client.query(`GRANT CREATE ON SCHEMA public TO ${quote(role)}`),
          ],
          [
            "database CREATE",
            (role) =>
              client.query(
                `GRANT CREATE ON DATABASE ${quote(database)} TO ${quote(role)}`,
              ),
          ],
          [
            "PUBLIC restricted native-function execution",
            () =>
              client.query(
                "GRANT EXECUTE ON FUNCTION pg_catalog.lo_export(oid,text) TO PUBLIC",
              ),
          ],
          ...[
            "TRUNCATE",
            "TRIGGER",
            "REFERENCES",
            ...(version >= 170000 ? ["MAINTAIN"] : []),
          ].map((privilege): [string, (role: string) => Promise<unknown>] => [
            privilege,
            (role) =>
              client.query(
                `GRANT ${privilege} ON "ExternalPaymentRecord" TO ${quote(role)}`,
              ),
          ]),
          [
            "grant option",
            (role) =>
              client.query(
                `GRANT SELECT ON "ExternalPaymentRecord" TO ${quote(role)} WITH GRANT OPTION`,
              ),
          ],
        ];
        for (const [name, setup] of cases) {
          const suffix = randomUUID().replaceAll("-", "");
          const role = `fundicate_test_role_${suffix}`;
          const object = `fundicate_probe_${suffix}`;
          await client.query("BEGIN");
          try {
            await client.query(`CREATE ROLE ${quote(role)} NOLOGIN`);
            await setup(role, object);
            const snapshot = async () => ({
              role: (
                await client.query(
                  "SELECT md5(row_to_json(r)::text) AS fingerprint FROM pg_authid r WHERE rolname=$1",
                  [role],
                )
              ).rows,
              memberships: (
                await client.query(
                  "SELECT to_jsonb(m) AS membership FROM pg_auth_members m WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=$1) OR member=(SELECT oid FROM pg_roles WHERE rolname=$1) ORDER BY roleid,member,grantor",
                  [role],
                )
              ).rows,
              dependencies: (
                await client.query(
                  "SELECT dbid,classid,objid,objsubid,deptype FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1) ORDER BY dbid,classid,objid,objsubid,deptype",
                  [role],
                )
              ).rows,
              migrations: (
                await client.query(
                  "SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS fingerprint FROM _prisma_migrations t",
                )
              ).rows,
              schemas: (
                await client.query(
                  "SELECT oid,nspowner,nspacl::text FROM pg_namespace ORDER BY oid",
                )
              ).rows,
              tables: (
                await client.query(
                  "SELECT oid,relowner,relacl::text FROM pg_class ORDER BY oid",
                )
              ).rows,
              functions: (
                await client.query(
                  "SELECT md5(COALESCE(string_agg(md5(row_to_json(p)::text),'' ORDER BY oid),'')) AS fingerprint FROM (SELECT oid,proowner,prosecdef,proacl::text FROM pg_proc) p",
                )
              ).rows,
            });
            const before = await snapshot();
            let migrations = 0;
            await assert.rejects(
              provisionRuntimeRole(client, {
                roleName: role,
                password: randomUUID(),
                migrate: async () => {
                  migrations++;
                },
              }),
              /unsafe existing authority/,
            );
            assert.equal(migrations, 0, name);
            assert.deepEqual(await snapshot(), before, name);
          } finally {
            await client.query("ROLLBACK");
          }
          assert.equal(
            (
              await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
                role,
              ])
            ).rowCount,
            0,
          );
          console.log(
            `PASS runtime preflight refuses ${name} without mutation`,
          );
        }
        const missingSuffix = randomUUID().replaceAll("-", "");
        const missingRole = `fundicate_test_role_${missingSuffix}`;
        const definer = `fundicate_probe_${missingSuffix}`;
        await client.query("BEGIN");
        try {
          await client.query(
            `CREATE FUNCTION public.${quote(definer)}() RETURNS text LANGUAGE sql SECURITY DEFINER AS 'SELECT current_user::text'`,
          );
          let migrations = 0;
          await assert.rejects(
            assertSafeRuntimeRole(client, missingRole),
            /unsafe existing authority/,
          );
          await assert.rejects(
            provisionRuntimeRole(client, {
              roleName: missingRole,
              password: randomUUID(),
              migrate: async () => {
                migrations++;
              },
            }),
            /unsafe existing authority/,
          );
          assert.equal(migrations, 0);
          assert.equal(
            (
              await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
                missingRole,
              ])
            ).rowCount,
            0,
            "Unsafe default PUBLIC execution must be refused before role creation",
          );
        } finally {
          await client.query("ROLLBACK");
        }
        console.log(
          "PASS runtime preflight refuses inherited PUBLIC definer execution before creating a missing role",
        );
      } finally {
        await client.end();
      }
    },
  );
  await check(
    "runtime preflight protects an identity used by another disposable database",
    async () => {
      const suffix = randomUUID().replaceAll("-", "");
      const role = `fundicate_test_role_${suffix}`;
      const database = `fundicate_test_role_${suffix}`;
      const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      const otherUrl = new URL(process.env.DATABASE_URL!);
      otherUrl.pathname = "/" + database;
      let other: pg.Client | undefined;
      let roleOid: number | undefined;
      let databaseOid: number | undefined;
      await client.connect();
      try {
        assert.equal(
          (
            await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
              role,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [
              database,
            ])
          ).rowCount,
          0,
        );
        await client.query(`CREATE ROLE ${quote(role)} NOLOGIN`);
        roleOid = (
          await client.query("SELECT oid FROM pg_roles WHERE rolname=$1", [
            role,
          ])
        ).rows[0].oid;
        await client.query(`CREATE DATABASE ${quote(database)}`);
        databaseOid = (
          await client.query("SELECT oid FROM pg_database WHERE datname=$1", [
            database,
          ])
        ).rows[0].oid;
        other = new pg.Client({ connectionString: otherUrl.href });
        await other.connect();
        await other.query(
          'CREATE TABLE "CrossDatabaseAuthorityProbe" (id integer)',
        );
        await other.query(
          `GRANT SELECT ON "CrossDatabaseAuthorityProbe" TO ${quote(role)}`,
        );
        const roleFingerprint = async () =>
          (
            await client.query(
              "SELECT md5(row_to_json(r)::text) AS fingerprint FROM pg_authid r WHERE rolname=$1",
              [role],
            )
          ).rows[0].fingerprint;
        const before = await roleFingerprint();
        const beforeAcl = (
          await other.query(
            "SELECT relacl::text FROM pg_class WHERE oid='\"CrossDatabaseAuthorityProbe\"'::regclass",
          )
        ).rows;
        let migrations = 0;
        const options = {
          roleName: role,
          password: randomUUID(),
          migrate: async () => {
            migrations++;
          },
        };
        await client.query("BEGIN");
        try {
          await assert.rejects(
            provisionRuntimeRole(client, options),
            /unsafe existing authority/,
          );
          assert.equal(migrations, 0);
          assert.equal(await roleFingerprint(), before);
          assert.deepEqual(
            (
              await other.query(
                "SELECT relacl::text FROM pg_class WHERE oid='\"CrossDatabaseAuthorityProbe\"'::regclass",
              )
            ).rows,
            beforeAcl,
          );
        } finally {
          await client.query("ROLLBACK");
        }
        await other.query('DROP TABLE "CrossDatabaseAuthorityProbe"');
        await client.query(
          `ALTER DATABASE ${quote(database)} OWNER TO ${quote(role)}`,
        );
        await client.query("BEGIN");
        try {
          await assert.rejects(
            provisionRuntimeRole(client, options),
            /unsafe existing authority/,
          );
          assert.equal(migrations, 0);
          assert.equal(await roleFingerprint(), before);
          assert.equal(
            (
              await client.query(
                "SELECT datdba FROM pg_database WHERE oid=$1",
                [databaseOid],
              )
            ).rows[0].datdba,
            roleOid,
          );
        } finally {
          await client.query("ROLLBACK");
        }
      } finally {
        if (other) await other.end();
        try {
          if (databaseOid !== undefined) {
            const actual = (
              await client.query(
                "SELECT oid FROM pg_database WHERE datname=$1",
                [database],
              )
            ).rows[0];
            assert.equal(
              actual?.oid,
              databaseOid,
              "Refuse cleanup of a replaced database identity.",
            );
            assert.match(database, /^fundicate_test_role_[a-f0-9]{32}$/);
            await client.query(`DROP DATABASE ${quote(database)}`);
          }
          if (roleOid !== undefined) {
            const actual = (
              await client.query("SELECT oid FROM pg_roles WHERE rolname=$1", [
                role,
              ])
            ).rows[0];
            assert.equal(
              actual?.oid,
              roleOid,
              "Refuse cleanup of a replaced role identity.",
            );
            assert.match(role, /^fundicate_test_role_[a-f0-9]{32}$/);
            await client.query(`DROP ROLE ${quote(role)}`);
          }
        } finally {
          await client.end();
        }
      }
    },
  );
  await check(
    "fresh and safe reused runtime roles retain only intended table privileges and read-only migration evidence",
    async () => {
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      const role = `fundicate_test_role_${randomUUID().replaceAll("-", "")}`;
      const quoted = '"' + role + '"';
      await client.connect();
      try {
        await client.query("BEGIN");
        let migrations = 0;
        const options = {
          roleName: role,
          password: randomUUID(),
          migrate: async () => {
            migrations++;
          },
        };
        await provisionRuntimeRole(client, options);
        await provisionRuntimeRole(client, options);
        assert.equal(migrations, 2);
        assert.equal(
          await assertSafeRuntimeRole(client, role, { configured: true }),
          true,
        );
        await client.query(`SET LOCAL ROLE ${quoted}`);
        const flags = (
          await client.query(
            "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        assert.ok(Object.values(flags).every((value) => value === false));
        await client.query('SELECT id FROM "User" LIMIT 1');
        await client.query(
          "SELECT migration_name FROM _prisma_migrations LIMIT 1",
        );
        for (const sql of [
          'CREATE TABLE public."SecurityForbiddenTable" (id integer)',
          'TRUNCATE "ExternalPaymentRecord"',
          'ALTER TABLE "ExternalPaymentRecord" DISABLE TRIGGER USER',
          "UPDATE _prisma_migrations SET logs='forged'",
        ]) {
          await client.query("SAVEPOINT denied_runtime_command");
          try {
            await assert.rejects(client.query(sql), /permission denied|owner/i);
          } finally {
            await client.query("ROLLBACK TO SAVEPOINT denied_runtime_command");
            await client.query("RELEASE SAVEPOINT denied_runtime_command");
          }
        }
      } finally {
        await client.query("ROLLBACK").catch(() => {});
        await client.end();
      }
      assert.equal(
        (
          await db.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_roles WHERE rolname=${role}`
        )[0].count,
        0n,
      );
    },
  );
  await check(
    "health fails closed when the payment clock migration is incomplete",
    async () => {
      const migration = "20261109010000_payment_record_clock";
      assert.equal(
        await db.$executeRaw`UPDATE _prisma_migrations SET rolled_back_at=CURRENT_TIMESTAMP WHERE migration_name=${migration} AND rolled_back_at IS NULL`,
        1,
      );
      try {
        const response = await fetch(origin + "/api/health");
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { status: "unavailable" });
      } finally {
        await db.$executeRaw`UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE migration_name=${migration}`;
      }
      assert.equal((await fetch(origin + "/api/health")).status, 200);
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
