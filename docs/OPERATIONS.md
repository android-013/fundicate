**Native packaging:** copied .env files are removed from .next/standalone by the build. Inject runtime configuration externally, for example `node --env-file=/private/path/fundicate.env .next/standalone/server.js`. Never distribute your source .env.

**Standalone branch, 7 November 2026:** This branch is community governance plus staff-recorded external-payment tracking. Blockchain execution is disabled; older NEAR instructions below are historical and cannot enable it. See [the standalone guide](STANDALONE.md). Existing treasury balances remain simulated.

# Operating Fundicate

Fundicate runs as a Node.js service backed by PostgreSQL. `FUNDICATE_MODE=standalone` is the default and requires no blockchain account, RPC or signing key. Its existing treasury and funded rounds use clearly labelled local simulation. Choosing `near-testnet` adds a separate native-NEAR provider; it does not reinterpret fiat balances or rewrite old receipts. Mainnet is disabled.

## First start

Native prerequisites: the pinned Node.js version accepted by the package, PostgreSQL, and the project lockfile. Copy `.env.example` to an ignored `.env`, configure `DATABASE_URL` and `APP_ORIGIN`, then:

```text
npm ci
npm run db:migrate
node scripts/doctor.mjs
npm run build
npm start
```

Do not run the demo seed in production. A fresh installation has no demo administrator or default production password; register through the normal flow and create a community. A local development database can be started with `node scripts/local-db.mjs start --keep-alive` in a retained terminal. Stop that keeper with `stop` on its stdin when finished.

For containers with Docker Engine and Compose v2:

```text
node scripts/bootstrap.mjs --docker
```

The helper generates a private ignored `.local/deploy/compose.env`, starts PostgreSQL, applies additive migrations in a separate one-shot tools container, and starts the unprivileged web image on `127.0.0.1:3000`. No demo seed, live provider, hosted publication or mainnet transaction is started. Repeating the same command preserves credentials and the named PostgreSQL volume. A changed origin requires deliberately editing that existing ignored configuration.

For a TLS reverse proxy use `node scripts/bootstrap.mjs --docker --origin https://your-domain.example`. The helper does not register that domain or configure TLS for you. Preserve the original `Origin` header and set proxy request/body/time limits; expose the proxy rather than the application or database. The private Compose database network uses an explicit `DATABASE_ALLOW_INSECURE_INTERNAL=true` exception. External PostgreSQL should use `sslmode=verify-full` with its trusted CA.

`node scripts/doctor.mjs --deployment` checks a public HTTPS origin, runtime configuration, connectivity and applied migrations without printing database URLs or secrets. `/api/health` is a small uncached readiness endpoint; its response is only `{"status":"ok"}` or `{"status":"unavailable"}`. Detailed environment and database diagnostics remain operator-only.

## Maintenance and recovery

```text
node scripts/maintenance.mjs --actor STAFF_USER_UUID --dry-run --once
node scripts/maintenance.mjs --actor STAFF_USER_UUID --apply --once --limit 100
```

The actor must be an active administrator or moderator for each selected community. Normal services recheck that authority before every action. The command never opens drafts, changes rules, picks a winner, skips a deadline or bypasses an enabled veto. It finalizes due proposal ballots, advances due published round stages, closes expired veto windows, and prepares/processes/reconciles local settlement through the existing central gate. Each invocation is bounded and logs IDs, action and status. Repeating it advances remaining due work and safely replays already recorded operations. A worker or cron scheduler may invoke this explicit command; the repository does not install an unattended scheduler.

Set `MAINTENANCE_ACTOR_ID` for the optional Compose `maintenance` profile. `docker compose --env-file .local/deploy/compose.env --profile maintenance run --rm maintenance node scripts/maintenance.mjs --apply --once` is an explicit operator invocation. Live NEAR submission and unknown external outcomes belong to the separate provider/outbox reconciliation process; this local maintenance script never treats an unknown chain operation as a local failure or releases its principal.

## Backup and restore

Use PostgreSQL client tools compatible with the server major version. On Windows the installed PostgreSQL `bin` directory may already be on PATH; otherwise set `PG_BIN` to that directory. Credentials reach `pg_dump`/`pg_restore` through subprocess environment variables rather than shell interpolation or command-line arguments.

```text
node scripts/backup.mjs
node scripts/restore.mjs --input PATH_TO_DUMP --database fundicate_restore_TIMESTAMP_PID --trusted-backup
node scripts/recovery-exercise.mjs --isolated
```

Backup obtains a consistent exported PostgreSQL snapshot, creates a custom-format archive, and records its SHA-256 plus table counts/content hashes and financial integrity checks in a sibling manifest. Existing output files are never overwritten. Treat both files as confidential: the archive contains users, password hashes, sessions, private reports and financial history. On Unix the helper uses owner-only file permissions. Use restricted NTFS permissions on Windows, encrypt offline copies and separate their encryption keys. `.local` and dump files are excluded from the container context and source control.

Restore only archives from trusted operators: PostgreSQL archives can contain executable database definitions. The restore command checks the checksum and creates a *new* `fundicate_restore_TIMESTAMP_PID` database on the configured server. It never cleans, drops or overwrites a pre-existing database, uses a single restore transaction, then compares every public table count/content hash and rechecks balanced postings, account totals and round-principal conservation. Failed/new recovery databases are retained for inspection. A verified restore is not automatically promoted to service.

The recovery exercise creates its own two uniquely named databases, applies current migrations, records a balanced fictional BDT contribution, exports/restores it with the actual PostgreSQL tools, changes only its throwaway source after the snapshot, and proves the restored copy matches the earlier snapshot. It drops only its verified, newly created throwaway databases; the configured application database is never modified. The archive/manifest remain under `.local/backups` for inspection.

For disaster recovery, stop or isolate writers, restore to a new server/database, run the full readiness/integrity checks and review pending/unknown external operations against the chain before switching application connections. Do not replay an external transfer simply because the restored database predates a callback. Back up source/version/lockfile and workflow evidence separately; keep environment secrets and signer custody backups out of the data archive. Define your required recovery point/time objectives and schedule physical backups plus WAL archiving or managed point-in-time recovery as appropriate; a logical dump alone is not a complete high-availability strategy.

## References

The packaging follows the installed Next.js self-hosting and standalone-output documentation. PostgreSQL custom archives and snapshot/restore semantics are described in [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) and [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html). Container concepts follow the [Docker Node.js guide](https://docs.docker.com/guides/nodejs/).
