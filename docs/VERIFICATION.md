# Verification results

Validated on **2 November 2026**, with Node.js 22.12.0, PostgreSQL 18.4, Next.js 16.4.3, Prisma 7.10.1 and the generated dependency lockfile.

| Command                                   | Final result                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run db:local`                        | PASS — project-local SCRAM-authenticated PostgreSQL starts/connects on 127.0.0.1:54329 |
| `npx prisma generate`                     | PASS — client generated                                                                |
| `npm run db:migrate`                      | PASS — both migrations applied; repeat reports no pending migrations                   |
| `npm run db:seed`                         | PASS — complete demo created; repeat preserves existing data                           |
| `npm run typecheck`                       | PASS — zero TypeScript errors; also included in production build                       |
| `npm run lint`                            | PASS — zero errors or warnings                                                         |
| `npm test`                                | PASS — 13 unit tests                                                                   |
| `npm run test:integration`                | PASS — 23 real PostgreSQL integrity/security checks                                    |
| `npm run build`                           | PASS — compilation, TypeScript and complete static generation                          |
| `npm start`                               | PASS — production app served locally                                                   |
| `npm run test:e2e`                        | PASS — 43 HTTP end-to-end checks against a separate temporary database                 |
| `npm run test:browser`                    | PASS — 40 browser layout/interaction checks; no browser runtime errors                 |
| `npm run test:accessibility`              | PASS — 20 desktop/mobile route scans; no axe WCAG A/AA violations reported             |
| `npm audit --omit=dev --audit-level=high` | PASS — zero reported production dependency vulnerabilities                             |
| `git diff --check`                        | PASS — no whitespace errors; Git notes the repository's LF-to-CRLF policy for README   |

## What the checks establish

Database lifecycle check: `node scripts/local-db.mjs start --keep-alive` in an interactive session passed. Restart preserved both communities, all eight users and reconciled ledger balances; sending `stop` completed a clean PostgreSQL shutdown.

- Unit tests cover strict majority, rounded quorum, abstentions, empty/invalid electorates, exact two-thirds removal, custom approval thresholds, exact minor-unit parsing, unsafe links, large-balance display and negative fractional display.
- PostgreSQL checks cover password hashing/authentication, session expiry/revocation, persistent rate limits, admission, scoped permissions, staff/admin separation, no duplicate or late votes, no partial early finalization, frozen electorate, immutable votes/audits, administrator transfer/deletion protection, idempotent contributions/executions, balanced and reconciled ledgers, database rejection of financial drift, competing treasury executions, retained removal history, mandatory suspension review and governed policy changes.
- HTTP tests reproduce registration → community creation → applying elsewhere → admission ballot → member proposal draft → staff opening → contribution → funding vote → approval → simulated payout → treasury/audit → logout. They check authorization, origin rejection, replay protection and every required route.
- Browser QA uses fresh Playwright contexts with project-local Chromium, at 1440×1000 and 390×844. It checks real login, proposal-type form switching, representative public/community/settings pages, horizontal overflow, and uncaught browser errors. Screenshots are saved under `test-results/`.
- Accessibility scans cover all 16 required routes on desktop, plus landing/dashboard/explore/treasury mobile variants. Fixes include measured text contrast, account-link naming, keyboard-focusable scrolling tables and mobile decorative layout.

Integration and HTTP test databases are uniquely named `fundicate_test_*` and removed after testing. The demo database is preserved. Browser checks create normal sessions for the fictional demo administrator and do not execute real payments.

## Environment-specific configuration

Turbopack cannot create required junctions in this Windows sandbox. Webpack is used instead. Build scripts use project-local temporary directories, prepare generated output directories synchronously and run both Next.js compile and generate phases. They also preserve the compiled proxy artifact between those phases because Next 16.4 renames it in each phase. The build command never stops after compile-only output.

Microsoft Edge's headless launcher fails under the sandbox's process/pipe restrictions. Playwright's project-local Chromium headless shell runs successfully and was used for the final browser and accessibility results. The in-app preview opening also timed out; screenshots came from the verified Chromium renderer.

Codex can terminate background child processes when their launching execution cell ends, and one sandbox session may not signal a PostgreSQL process started by another. Database-backed work therefore uses the documented `--keep-alive` mode in a retained interactive/TTY session. Its own `stop` input was verified to request a fast shutdown and complete a clean PostgreSQL checkpoint. Normal native terminal daemon usage remains available. Preview servers were stopped after verification; the database files are preserved.

The PostgreSQL adapter emits a non-failing pg 8 deprecation warning about concurrent client queries during nested transactional operations. All transaction, concurrency and database invariant checks pass. Recheck adapter compatibility before a future pg 9 upgrade.

## Verification limits

These are local MVP checks, not a production security audit or a complete manual WCAG audit. Physical-device testing, deployment/load testing, backup/restore exercises, real payment processing, wallets, NEAR contracts, testnet transactions and blockchain finality/reconciliation were not performed. See `NEAR-INTEGRATION.md` and the README's limits section.

No infrastructure, transaction hashes or blockchain confirmations were fabricated. All financial activity in this app remains explicitly simulated.
