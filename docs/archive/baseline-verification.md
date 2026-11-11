# Verification results

## Capability phases 1–2 — 5 November 2026

An additive fourth migration, `20261105000000_funding_rounds`, introduces funding rounds, competing schemes, frozen electorates and separate screening/selection ballots. Existing proposals, financial records and saved dashboard/analytics settings are retained. No reset or reseed was performed.

| Check                               | Result                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm test`                          | PASS — 31 unit tests                                                                     |
| `npm run test:integration`          | PASS — all 27 existing PostgreSQL checks with the new schema                             |
| `npm run test:e2e`                  | PASS — all 61 existing HTTP checks                                                       |
| `npm run test:browser`              | PASS — all 75 existing browser layout/interaction checks                                 |
| `npm run test:rounds`               | PASS — 20 new round authorization, integrity, privacy, HTTP and browser scenarios        |
| Round accessibility                 | PASS — 14 desktop/mobile axe WCAG A/AA scans, no violations                              |
| `npm run typecheck`, `npm run lint` | PASS — no errors or warnings                                                             |
| `npm run build`                     | PASS — Prisma generation, TypeScript, Webpack compilation and complete static generation |

The new round scenarios verify staff-only creation, authentication/origin protection, ignored forged ownership/clock fields, private drafts, submission deadlines, public/member submission policy, immutable rules and scheme content, submission caps, scoped identifiers, frozen voters, exclusion of suspended/late/non-members, duplicate ballots, PostgreSQL immutability, separate elections, stage-specific hidden results, ties, no quorum, empty rounds and rejected schemes. A recorded winner cannot be rewritten or executed through the legacy payout endpoint; round completion creates no ledger transaction or legacy proposal.

Browser checks create/open a round, submit a scheme, cast both screening and selection ballots, inspect published results, verify visitor privacy, and follow the existing proposal navigation. Layouts are checked at 1440, 390 and 320 pixels; accessibility scans cover the new creation, submission, screening, selection, list and result interfaces. No browser runtime errors or horizontal overflow were observed. Test databases are uniquely named and dropped by the isolated runner; the demo database is preserved.

Draft exclusion checks validate the not-found content and absence of draft fields as well as service-level authorization. Next.js can return HTTP 200 when a not-found boundary occurs after streaming begins; the bundled Next.js documentation describes this behavior.

This batch completes the first two phases of [UPGRADE-PHASES.md](early-upgrades.md). Round-specific fund commitments, reservations, settlement/refunds, allocation options, vetoes, advanced voting and ratings remain future phases. New round ballot privacy is enforced for application users until stage finalization; existing proposal ballots retain their earlier public behavior. These local checks are not a production security or complete manual accessibility audit.

## UI and analytics expansion — 3 November 2026

The blockchain-inspired redesign and analytics expansion were verified against the existing local application. The third migration, `20261103000000_analytics_preferences`, adds per-account dashboard preferences and saved analytics views; existing demo and financial records were preserved.

| Check                        | Result                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `npm test`                   | PASS — 25 unit tests                                                                     |
| `npm run test:integration`   | PASS — 27 real PostgreSQL checks                                                         |
| `npm run test:e2e`           | PASS — 61 HTTP workflow/access checks against an isolated temporary database             |
| `npm run test:browser`       | PASS — 75 layout/interaction checks, no runtime errors or horizontal overflow            |
| `npm run test:accessibility` | PASS — 30 desktop/mobile route scans, no axe WCAG A/AA violations                        |
| `npm run lint`               | PASS — zero warnings/errors                                                              |
| `npm run build`              | PASS — Prisma generation, TypeScript, Webpack compilation and complete static generation |

New unit coverage verifies UTC boundaries and impossible dates, duplicate/invalid filters, preserved drill-down filters, bigint contribution summaries, empty comparison baselines, daily/monthly trend reconciliation, CSV precision/formula escaping and dashboard widget validation.

New database coverage verifies ledger report reconciliation, forbidden community scopes and source inspection, private preference/saved-view ownership, separate USD/EUR calculations, and the difference between vote-event and proposal-created cohorts. New HTTP coverage checks all six analytics areas, unauthenticated redirects, mutation validation, forged ownership fields, private view deletion, CSV content/access, transaction inspection and invalid-date feedback.

Browser QA exercises persisted dashboard customization, saving/reopening/removing a filtered report, CSV downloads and source inspection. Desktop and mobile routes use 1440×1000 and 390×844 viewports; additional 320×740 checks verify landing, dashboard, overview, explorer and the customization panel. Screenshots were visually reviewed. Chart hydration errors and graph-label accessibility issues found during development were fixed before the passing runs.

Analytics are based on recorded application data, with explicit metric/cohort definitions and guardrails in [ANALYTICS.md](dashboard-baseline.md). This remains a local treasury simulation; no chain integration or production deployment was performed. The dependency audit and baseline repository checks below are the earlier 2 November results, not a newly claimed audit.

## Original local MVP — 2 November 2026

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

Turbopack cannot create required junctions in this Windows sandbox. Webpack is used instead. Build scripts use project-local temporary directories, prepare generated output directories synchronously and run both Next.js compile and generate phases. The 3 November expansion also precreates the route-specific generated type directories after a repeat build exposed the same Windows directory-creation issue there. The scripts preserve the compiled proxy artifact between phases because Next 16.4 renames it in each phase. The build command never stops after compile-only output.

Microsoft Edge's headless launcher fails under the sandbox's process/pipe restrictions. Playwright's project-local Chromium headless shell runs successfully and was used for the final browser and accessibility results. The in-app preview opening also timed out; screenshots came from the verified Chromium renderer.

Codex can terminate background child processes when their launching execution cell ends, and one sandbox session may not signal a PostgreSQL process started by another. Database-backed work therefore uses the documented `--keep-alive` mode in a retained interactive/TTY session. Its own `stop` input was verified to request a fast shutdown and complete a clean PostgreSQL checkpoint. Normal native terminal daemon usage remains available. Preview servers were stopped after verification; the database files are preserved.

The PostgreSQL adapter emits a non-failing pg 8 deprecation warning about concurrent client queries during nested transactional operations. All transaction, concurrency and database invariant checks pass. Recheck adapter compatibility before a future pg 9 upgrade.

## Verification limits

These are local MVP checks, not a production security audit or a complete manual WCAG audit. Physical-device testing, deployment/load testing, backup/restore exercises, real payment processing, wallets, NEAR contracts, testnet transactions and blockchain finality/reconciliation were not performed. See the [historical NEAR design](near-integration.md).

No infrastructure, transaction hashes or blockchain confirmations were fabricated. All financial activity in this app remains explicitly simulated.
