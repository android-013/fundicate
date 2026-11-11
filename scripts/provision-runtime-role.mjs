import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { postgresUrl } from "../src/lib/postgres-url.mjs";

class UnsafeRuntimeRoleError extends Error {
  constructor() {
    super(
      "Runtime database identity has unsafe existing authority; review it before provisioning. No role privileges were changed.",
    );
  }
}
const unsafeIdentity = () => new UnsafeRuntimeRoleError();
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';

/**
 * Read-only preflight. A dedicated runtime identity must not acquire authority
 * from ownership, memberships or undeclared ACLs. PUBLIC CREATE on public is
 * allowed only before the explicitly documented baseline revocation below.
 * @param {import('pg').Client} client
 * @param {string} roleName
 * @param {{configured?: boolean}} options
 */
export async function assertSafeRuntimeRole(
  client,
  roleName,
  { configured = false } = {},
) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(roleName)) throw unsafeIdentity();
  const result = await client.query(
    "SELECT oid,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1",
    [roleName],
  );
  const role = result.rows[0];
  if (
    (configured && !role) ||
    (role &&
      [
        role.rolsuper,
        role.rolcreatedb,
        role.rolcreaterole,
        role.rolreplication,
        role.rolbypassrls,
      ].some(Boolean))
  )
    throw unsafeIdentity();
  const oid = role?.oid ?? null;
  // PostgreSQL 18 reserves initdb object OIDs below FirstNormalObjectId (16384).
  // A system-schema name or missing initial ACL alone does not establish origin.
  const authority = await client.query(
    `SELECT
      EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid=$1::oid OR member=$1::oid) AS membership,
      (EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datdba=$1::oid)
       OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner=$1::oid)
       OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relowner=$1::oid)
       OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=$1::oid)
       OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typowner=$1::oid)
       OR EXISTS(SELECT 1 FROM pg_catalog.pg_shdepend WHERE refclassid='pg_catalog.pg_authid'::regclass AND refobjid=$1::oid AND deptype='o')) AS ownership,
      EXISTS(SELECT 1 FROM pg_catalog.pg_shdepend
        WHERE refclassid='pg_catalog.pg_authid'::regclass AND refobjid=$1::oid AND dbid<>0
        AND dbid<>(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())) AS other_database,
      EXISTS(SELECT 1 FROM pg_catalog.pg_database d,
        LATERAL pg_catalog.aclexplode(COALESCE(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
        WHERE d.datname=current_database() AND a.grantee IN (0,$1::oid)
        AND (a.privilege_type='CREATE' OR a.is_grantable)) AS database_authority,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n,
        LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
        WHERE a.grantee IN (0,$1::oid) AND
          (a.is_grantable OR (a.privilege_type='CREATE' AND
            (a.grantee<>0 OR $2::boolean OR n.nspname<>'public')))) AS schema_authority,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c,
        LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
        WHERE c.relkind IN ('r','p','v','m','f','S') AND a.grantee IN (0,$1::oid)
        AND (a.is_grantable OR a.privilege_type IN ('TRUNCATE','TRIGGER','MAINTAIN','REFERENCES')
          OR (c.relkind='S' AND a.privilege_type='UPDATE'))) AS table_authority,
      EXISTS(SELECT 1 FROM pg_catalog.pg_attribute c,
        LATERAL pg_catalog.aclexplode(c.attacl) a WHERE a.grantee IN (0,$1::oid)
        AND (a.is_grantable OR a.privilege_type='REFERENCES')) AS column_authority,
      EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.prosecdef
        AND (($1::oid IS NOT NULL AND pg_catalog.has_function_privilege($1::oid,p.oid,'EXECUTE'))
          OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))) AS definer_authority,
      EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_catalog.pg_language l ON l.oid=p.prolang
        LEFT JOIN pg_catalog.pg_init_privs i ON i.classoid='pg_catalog.pg_proc'::regclass
          AND i.objoid=p.oid AND i.objsubid=0
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE (a.grantee=$1::oid AND (a.privilege_type='EXECUTE' OR a.is_grantable))
          OR (a.grantee=0 AND a.is_grantable)
          OR (l.lanname IN ('c','internal') AND a.grantee IN (0,$1::oid)
            AND a.privilege_type='EXECUTE'
            AND NOT (n.nspname='pg_catalog' AND p.oid<16384))
          OR (n.nspname='pg_catalog' AND a.grantee=0 AND a.privilege_type='EXECUTE'
            AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(i.initprivs,pg_catalog.acldefault('f',p.proowner))) baseline
              WHERE baseline.grantee=0 AND baseline.privilege_type='EXECUTE'))) AS routine_authority`,
    [oid, configured],
  );
  if (Object.values(authority.rows[0]).some(Boolean)) throw unsafeIdentity();
  if (configured) {
    const metadata = await client.query(
      `SELECT COALESCE(bool_or(pg_catalog.has_table_privilege($1::oid,c.oid,'INSERT,UPDATE,DELETE')),false) AS writable
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='_prisma_migrations'`,
      [oid],
    );
    if (metadata.rows[0].writable) throw unsafeIdentity();
  }
  return Boolean(role);
}

/**
 * The caller owns the transaction and commits only after this succeeds.
 * The migration callback is deliberately after a mutation-free preflight.
 * @param {import('pg').Client} client
 * @param {{roleName: string, password: string, migrate: () => Promise<void>}} options
 */
export async function provisionRuntimeRole(
  client,
  { roleName, password, migrate },
) {
  if (typeof password !== "string" || !password)
    throw new Error("Runtime credentials are required.");
  await assertSafeRuntimeRole(client, roleName);
  await migrate();
  const exists = await assertSafeRuntimeRole(client, roleName);
  const command = await client.query(
    `SELECT format('%s ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text, $2::text, $3::text) AS sql`,
    [exists ? "ALTER" : "CREATE", roleName, password],
  );
  await client.query(command.rows[0].sql);
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(roleName)}`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(roleName)}`,
  );
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE ON public._prisma_migrations FROM ${identifier(roleName)}`,
  );
  await client.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier(roleName)}`,
  );
  await assertSafeRuntimeRole(client, roleName, { configured: true });
}

// Operator-only migration/provisioning command, never an HTTP capability.
async function main() {
  const runtime = postgresUrl(
    process.env.RUNTIME_DATABASE_URL,
    "RUNTIME_DATABASE_URL",
  );
  const owner = postgresUrl(process.env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(runtime.protocol) ||
    !["postgres:", "postgresql:"].includes(owner.protocol) ||
    runtime.username !== "fundicate_app" ||
    !runtime.password ||
    runtime.host !== owner.host ||
    runtime.pathname !== owner.pathname
  )
    throw new Error(
      "RUNTIME_DATABASE_URL must use fundicate_app on the same deployment database.",
    );
  const client = new pg.Client({ connectionString: owner.href });
  await client.connect();
  try {
    await client.query("BEGIN");
    await provisionRuntimeRole(client, {
      roleName: "fundicate_app",
      password: decodeURIComponent(runtime.password),
      migrate: async () => {
        const migrated = spawnSync(
          process.execPath,
          ["node_modules/prisma/build/index.js", "migrate", "deploy"],
          { stdio: "inherit", windowsHide: true },
        );
        if (migrated.status !== 0)
          throw new Error("Migration deployment failed.");
      },
    });
    await client.query("COMMIT");
    console.log(
      "Migrations applied and runtime DML role provisioned; credentials were not printed.",
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch((error) => {
    console.error(
      error instanceof UnsafeRuntimeRoleError
        ? error.message
        : "Runtime role provisioning failed. Check operator/runtime configuration and database permissions; private diagnostics were withheld.",
    );
    process.exitCode = 1;
  });
