# Part 5 — Standalone governance, payment records and release verification

## Run and scope

Run `72fba785-3bf0-4f38-a257-558a5455442f`, resumed on 8 November 2026. Requirements R28–R36 follow the user-approved standalone amendment recorded in [DECISIONS](../../workflow/DECISIONS.md) and [MASTER-PLAN](../MASTER-PLAN.md). Parts 1–4 remain preserved. R19 capped contribution weights remains the explicitly optional backlog item.

Frozen release source: `a39f984c939611960e1fecbef5fba8c18e737978fd50a523ba21ded6957902d5`. The additive payment-clock and reused-runtime-role repairs are integrated. All 20 mandatory checks below passed on this final source. Historical failed/superseded evidence remains preserved.

This branch offers governance and a separate register of externally handled payments. It does not move real money. Existing treasury and funded rounds remain labelled simulations. Historical chain models, source, records and prior evidence remain dormant; chain routes are retired and blockchain runtime modes are rejected. Real NEAR testnet operations have **not** been performed or verified. This is an explicitly amended branch scope, not a claim that the original chain target passed.

The generated progress table retains its pre-amendment Part 5 title from historical state. Its prominent scope note and the canonical current plan disambiguate that label: 5/5 means completion of the amended standalone sequence only. No state/history was manually rewritten to rename it.

## Delivered behavior

- **Standalone and account safety (R28):** wallet-free production runtime, retired chain routes, community-scoped authority, session revocation, recent-password confirmation for sensitive authority/payment-record actions, bounded request bodies, same-origin mutation checks and durable quotas. Compose separates migration-owner credentials from the DML-only runtime identity.
- **External-payment records (R29–R30):** staff record exact contributions, payouts and refunds with community-currency amounts, references, notes, occurrence times and optional HTTPS evidence. Active members inspect scoped, paginated history and CSV. Entries are independently unverified attestations. Full-payload/actor replay, concurrent uniqueness, SQL guards and full-source reversals preserve immutable originals. These records never alter simulated balances, electorates, voting power or payout rights.
- **Overview and detailed analysis (R31):** System insights is discoverable from Analytics. Round lifecycle, funding, results, veto, source refunds, reputation and separately labelled external-payment reports provide filters, exact asset/currency groups, source links and CSV. Draft/cancelled-round authorization is applied per community before report limits or aggregates. Pending results and hidden ballots remain protected. Reversed external records are excluded from full-cohort net totals; private record notes/references/counterparties are not selected for the system report. Existing dashboard layouts, saved views and custom analytics remain.
- **Templates and maintenance (R32):** reusable append-only template revisions create new drafts with bound rules. Published round rules remain immutable. Explicit bounded maintenance rechecks actor authority, deadlines and full veto windows; repeated execution retains the central settlement/recovery gates. No scheduler is installed implicitly.
- **Operations and hardening (R33):** environment diagnostics, minimal readiness, additive migrations, separate runtime-role provisioning, sanitized standalone packaging, secret scans and actual snapshot-based logical recovery. PostgreSQL client tools are an operator prerequisite for the native backup/restore commands; the current tools image does not bundle those binaries.
- **Isolated demonstration (R34):** 100 fictional members, 100,000 BDT and three schemes exercise sealed voting, a 60,000-BDT simulated payout and 40,000 BDT of original-source refunds. Five separately labelled fictional external records include an intentional mistake and its full reversal. Exact net totals are checked and simulated balances remain unchanged by external attestations. The configured application database is never reseeded/reset.
- **Preservation (R36):** existing networking, membership profiles, legacy proposals/treasury, V1–V4 rule dispatch, all six election methods, all 36 funded method/weight/allocation combinations, reputation/moderation/appeals, dashboards, saved views, exports and immutable history remain. New migrations are additive. Historical public ballots retain their documented historical semantics; new versioned rounds retain sealed voting.

Key implementation paths are `src/lib/payment-records.ts`, `src/lib/payment-records-core.ts`, `src/lib/release-analytics.ts`, `src/lib/round-templates.ts`, `src/lib/http-security.ts`, `src/lib/session-security.ts`, `src/lib/runtime-config.ts` and `scripts/maintenance.ts`. Deployment/recovery entry points are `scripts/bootstrap.mjs`, `scripts/provision-runtime-role.mjs`, `scripts/doctor.mjs`, `scripts/backup.mjs` and `scripts/restore.mjs`. Additive Part 5 migrations are `20261106030000_portable_service`, `20261106040000_release_integrity` and `20261107010000_standalone_payments` and `20261109010000_payment_record_clock`; no historical migration or posted record is reset.

The full requirement review retains the earlier part handoffs and adds current-source regression evidence:

| Requirements | Current verification coverage |
| --- | --- |
| R01–R06: authentication, communities, networking, ledger, dashboards and decision rounds | Unit, PostgreSQL integration, HTTP, general browser, legacy rounds and accessibility; [Part 1 provenance](part-01.md). |
| R07–R14: funded governance and accounting | Funds, integration, HTTP and unit checks; [Part 2 implementation](part-02.md). |
| R15–R18: weights, allocation and full veto | Elections, funds and unit checks; [Part 3 implementation](part-03.md). |
| R20–R27: all six methods, all 36 cells and reputation | Unit reference vectors, full funded matrix/browser elections, reputation, HTTP and legacy regressions; [Part 4 implementation](part-04.md). |
| R28–R36: amended standalone release | The current receipts below, actual deployment observations and final independent review. |

R19 is explicitly optional and remains unimplemented; it is not used to replace ordinary contribution weighting or omitted from a claimed mandatory score.

## Verification evidence

All 20 required receipts below bind the final source `a39f984c939611960e1fecbef5fba8c18e737978fd50a523ba21ded6957902d5`, record exit code zero and unchanged source, and retain their original SHA-256-verified logs. This handoff uses final receipts rather than the earlier 6ac/1aa/643d snapshots. The independent review binds this complete receipt set and this handoff; their hashes are obtained from the progress CLI without circularly embedding the handoff hash in itself.

| Actual check and receipt | Observed result |
| --- | --- |
| [Workflow recovery and advancement](../../workflow/evidence/part-05/workflow-tests-200faf2c-5aaa-4919-868f-67894771d709.json) | Passed; exit 0, unchanged final source. |
| [Unit tests](../../workflow/evidence/part-05/unit-c7bde017-71e7-466c-9b10-22d8e88df273.json) | Passed; exit 0, unchanged final source. |
| [TypeScript](../../workflow/evidence/part-05/typecheck-213a4e8c-8d13-4d95-96da-56ffc2fdd9c2.json) | Passed; exit 0, unchanged final source. |
| [ESLint](../../workflow/evidence/part-05/lint-da85a4da-70b0-4af1-91a8-dc8056716f56.json) | Passed; exit 0, unchanged final source. |
| [PostgreSQL integrity](../../workflow/evidence/part-05/integration-8608d422-a822-488f-94e8-ff258f464077.json) | Passed; exit 0, unchanged final source. |
| [Production build](../../workflow/evidence/part-05/build-7ff87fba-0774-4e4d-901c-db6b53a1267d.json) | Passed; exit 0, unchanged final source. |
| [Production HTTP](../../workflow/evidence/part-05/http-04137d8e-e819-468b-81c8-11148a1c513f.json) | Passed; exit 0, unchanged final source. |
| [General browser](../../workflow/evidence/part-05/browser-121984e7-3310-4697-82ad-9696ea307847.json) | Passed; exit 0, unchanged final source. |
| [Legacy round regression](../../workflow/evidence/part-05/rounds-8747da75-f98a-45e3-9930-8520aea2ef99.json) | Passed; exit 0, unchanged final source. |
| [General accessibility](../../workflow/evidence/part-05/accessibility-add20b19-db2d-47fd-9c59-0e70faca8e15.json) | Passed; exit 0, unchanged final source. |
| [Funds and governance](../../workflow/evidence/part-05/funds-af1a0d8e-ba64-4c3a-a6a3-e0a5137efdb9.json) | Passed; exit 0, unchanged final source. |
| [Election methods and all 36 funded cells](../../workflow/evidence/part-05/elections-c31b9009-961e-4971-ac95-cd6f42c2fe32.json) | Passed; exit 0, unchanged final source. |
| [Reputation and moderation](../../workflow/evidence/part-05/reputation-a162e137-77ae-4267-b61f-30384d07fb0d.json) | Passed; exit 0, unchanged final source. |
| [Analytics, templates and maintenance](../../workflow/evidence/part-05/release-f715e789-775f-477a-8516-0e5ec77aeeff.json) | Passed; exit 0, unchanged final source. |
| [Snapshot backup/restore](../../workflow/evidence/part-05/recovery-766a51ef-a2fa-4173-a335-f1e80fe3122d.json) | Passed; exit 0, unchanged final source. |
| [Large isolated fictional demo](../../workflow/evidence/part-05/large-demo-d64b0658-9e3a-4bba-a967-73a497889a6b.json) | Passed; exit 0, unchanged final source. |
| [Dependency audit](../../workflow/evidence/part-05/dependency-audit-f6609e21-94e2-4981-ada0-eafbac4f73be.json) | Passed; exit 0, unchanged final source. |
| [Account, HTTP and runtime-role security](../../workflow/evidence/part-05/security-e11de79c-f9d2-4cb8-a801-7b7777ed2b33.json) | Passed; exit 0, unchanged final source. |
| [Payment records and SQL clock regressions](../../workflow/evidence/part-05/payment-records-c8afda18-f057-44f3-b34f-64f8b1f1ff16.json) | Passed; exit 0, unchanged final source. |
| [Secret and distribution scan](../../workflow/evidence/part-05/secret-scan-a37c1246-6101-4bfa-bbe9-ecad85df54ad.json) | Passed; exit 0, unchanged final source. |

The original Compose fixture [53b916f288](../../.local/container-audit-20261108/53b916f288-smoke-result.json) remains explicitly failed: payment-record creation returned HTTP 500 because its SQL guard compared against transaction-start time. Additive migration 16 uses a database-generated UTC wall clock with matching millisecond precision. Delayed transactions, repeated defaults in UTC/Dhaka/New York, explicit future-date rejection, full reversals and unchanged posted history are covered by the final payment check. The runtime-role repair rejects unsafe flags, memberships in either direction, ownership/cross-database dependencies and unsafe/grantable privileges before migration and again before commit. Final security tests cover fresh/safe reuse and 19 unsafe identity cases without modifying the user's preexisting runtime role.

The final [actual copied-package execution](../../.local/native-package-final-1794291663425.json) preserves its exact command, timestamps, build-receipt binding, raw output and log hash. It passed health, three public routes, login and three authenticated routes; Next.js, React, PostgreSQL and Prisma resolved within `C:\Users\Refat\Documents\Codex\2026-11-02\c-users-refat-documents-git-web\work\standalone-package-1794291631217`, with no source-directory fallback. It is labelled manual packaging evidence, separate from workflow test receipts. Earlier readiness failure and successful diagnostic are not silently substituted for this final observation.

## Container and recovery evidence

The [final public evidence index](../../.local/container-audit-20261108/public-evidence-index-20261110T060808Z.json) preserves exact bytes/hashes for raw builds, full-severity scans, actual scan commands, image identities, signatures and functional observations. Private fixture credentials, cookies and database dumps are excluded. The [successful actual Compose result](../../.local/container-audit-20261108/b81b181f94-smoke-result.json) binds source, recipe hashes and resolved image IDs. It verifies migration 16, separate DML runtime credentials, denied elevated flags/memberships, unprivileged processes, private database networking, actual HTTP records/replay/reversal, maintenance, responsive browser checks and six zero-violation accessibility scans. Actual pg_dump/pg_restore compares all 50 tables and five monetary invariants; a source change after snapshot remains separate. A separate newly initialized baseline fixture survives the same-major Bookworm database-image transition with its committed row and recorded collation unchanged. No existing user volume is attached or reset.

See the [dated container assessment](../security/container-audit.md) and [complete per-observation assessment](../security/database-assessment.json) for exact final scans and supported-input dispositions. Package findings retain scanner severity and vendor status; contextual review is not a patch or clean-image certification. PostgreSQL SQL/XML remains available to trusted runtime credentials. GSS/Kerberos libraries are also linked and protocol negotiation can occur before authentication; SCRAM rules alone do not exclude those parser paths. This release boundary covers the inspected parameterized standalone HTTP application with trusted private database peers and operators; arbitrary SQL tenants/consoles, untrusted direct database peers, XML processing, LDAP/Kerberos integration, untrusted native archives or changed role/host policy require a new assessment. No hosted deployment occurred.

## Independent review

Reviewer: `/root/final_release_reviewer`. The actual independent report is [part-05-standalone-72fba785.json](../../workflow/reviews/part-05-standalone-72fba785.json). It must bind final source, complete receipt set, this handoff, all R28–R36 criteria and preservation. The coordinator cannot substitute a self-review. Workflow completion occurs only after actual review registration and validation with no unresolved blocker.

## Remaining work and next action

This is the release handoff for amended standalone Part 5; completing its workflow ends the five-part sequence. R19 capped weights remains explicitly optional backlog. Real NEAR testnet deposit, payout and refund operations remain unperformed/unverified; blockchain modes are disabled. External-payment attestations are independently unverified records and move no real money. No new provider, feature, mainnet action, hosted publication, push or external payment is authorized by this release.

Use [OPERATIONS](../OPERATIONS.md), [STANDALONE](../STANDALONE.md) and [PRODUCTION](../PRODUCTION.md) for deployment. Native configuration is injected externally, for example `node --env-file=/private/path/fundicate.env .next/standalone/server.js`; never distribute source .env. Docker bootstrap preserves generated credentials and named data volumes. Public-origin preparation requires deliberate TLS/proxy/header configuration before startup. The operator must verify target TLS, trusted header overwrite/blocked direct access, private or verified database transport, secrets, monitoring, job ownership and tested backups before broad onboarding. Email verification, self-service account recovery and MFA are not implemented. No penetration test, external certification, general hosted readiness or automatic real-money-weighted governance is claimed.

The automated role provisioner is verified with a PostgreSQL **superuser operator**, as supplied by the tested Compose database. PostgreSQL 18 gives a non-superuser creator an administrative membership which the strict role policy rejects. Delegated/managed-provider automatic provisioning requires separately reviewed manual setup or a separately tested policy. Only Linux/amd64 container execution is verified. Native backup/restore requires installed PostgreSQL client tools; the tools image does not bundle them.

For interruption or exhausted credits, follow [the durable resume checklist](part-05-resume.md), canonical status and the hash-linked workflow journal. Completed evidence and application database files persist on disk, while processes/agents may need restart. Recover dead check/lock ownership explicitly through the CLI; never reset progress or user data. These local files do not replace off-device backups.
