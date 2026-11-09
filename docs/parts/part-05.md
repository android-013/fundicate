# Part 5 — Standalone governance, payment records and release verification

## Run and scope

Run `72fba785-3bf0-4f38-a257-558a5455442f`, resumed on 8 November 2026. Requirements R28–R36 follow the user-approved standalone amendment recorded in [DECISIONS](../../workflow/DECISIONS.md) and [MASTER-PLAN](../MASTER-PLAN.md). Parts 1–4 remain preserved. R19 capped contribution weights remains the explicitly optional backlog item.

Frozen release source: `643d7ea645e9a14b14d67526d35417a0148a3a41ece1402550e1885b98044db5`. The timestamp and reused-role repairs are integrated and independently source-reviewed. Final-source execution evidence, successful full-stack recovery and final review binding are still pending. All earlier snapshot receipts remain preserved as superseded evidence.

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

Key implementation paths are `src/lib/payment-records.ts`, `src/lib/payment-records-core.ts`, `src/lib/release-analytics.ts`, `src/lib/round-templates.ts`, `src/lib/http-security.ts`, `src/lib/session-security.ts`, `src/lib/runtime-config.ts` and `scripts/maintenance.ts`. Deployment/recovery entry points are `scripts/bootstrap.mjs`, `scripts/provision-runtime-role.mjs`, `scripts/doctor.mjs`, `scripts/backup.mjs` and `scripts/restore.mjs`. Additive Part 5 migrations are `20261106030000_portable_service`, `20261106040000_release_integrity` and `20261107010000_standalone_payments`; no historical migration or posted record is reset.

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

The actual Compose run [53b916f288](../../.local/container-audit-20261108/53b916f288-smoke-result.json) successfully migrated, provisioned the fresh runtime role, checked process/network/HBA/XML controls and ran the doctor, then **failed** payment-record creation with HTTP 500. Database logs identified the original trigger's transaction-start timestamp comparison. Additive migration 16 and its UTC database-generated default repair that defect without rewriting any posted row. A targeted diagnostic subsequently passed all 20 payment checks, including delayed transactions/default rounding, three session timezones, genuine future-date rejection, reversal and unchanged history/accounting. That diagnostic used the existing compiled server, so it is not substituted for final-source release evidence. Reused-role preflight hardening and final independent approval remain pending.

The table below records 20 genuine application passes against the **previous** source `6ac75853a9370472c6660544d6cd4a3717de91bea235dd1ce79224ef445e930f`, with `exitCode: 0` and `sourceUnchanged: true`. Its receipt-set SHA-256 is `50d97c3f03c5ca41edd8c826ca895f92807bc6ea1075b9be3ab3c6283cd927b0`. The later database-image gosu update and purpose-limited operator image change the source fingerprint, so these receipts and their acceptance records are now retained baseline evidence, not final-source passes. Four actual workflow/type/lint/build checks also passed on the intermediate `ce021dea…` snapshot and remain superseded evidence. All required checks must be renewed before completion. Each linked receipt contains its actual command, UTC execution interval and log SHA-256. Container verification and final independent approval remain pending.

| Check and receipt | Observed result |
| --- | --- |
| [Production build](../../workflow/evidence/part-05/build-b1b3c3c8-48c2-4b9f-8929-94c6e4f62dcf.json) | Prisma generation, type checking and complete production standalone build passed; copied environment configuration removed. |
| [Workflow](../../workflow/evidence/part-05/workflow-tests-e1bb9b86-34e0-43d5-b496-3be3ce2d6146.json) | 14 workflow tests passed. |
| [Unit](../../workflow/evidence/part-05/unit-da889bca-500a-4beb-bbc8-23132e921caf.json) | 195 tests in 16 files passed. |
| [Type check](../../workflow/evidence/part-05/typecheck-41903129-20fd-4bf7-9dbf-2eb9a9b413bf.json) | Passed. |
| [Lint](../../workflow/evidence/part-05/lint-01bf4eed-cec8-4c3a-92fa-89d64438682a.json) | Passed. |
| [PostgreSQL integration](../../workflow/evidence/part-05/integration-2ba9dfe0-977c-442a-a7ca-75a08bb03847.json) | 27 integrity/security checks passed. |
| [Security](../../workflow/evidence/part-05/security-720f4bdf-e54a-4641-99b3-62f0c55f29f5.json) | Eight security groups passed, including retired endpoints, quotas, hostile inputs, reauthentication and runtime-role boundaries. |
| [Payment records](../../workflow/evidence/part-05/payment-records-1e627be3-2915-4670-a74c-d70268d6a614.json) | 19 service/SQL/HTTP/browser checks and three accessibility scans passed. |
| [HTTP](../../workflow/evidence/part-05/http-44c22dc3-ffb3-4f31-ba7b-ede8950e861f.json) | 61 end-to-end checks passed. |
| [Legacy rounds](../../workflow/evidence/part-05/rounds-631d2a0f-80dc-444b-8b75-5c6488088f15.json) | 20 checks and 14 accessibility scans passed. |
| [Funds and governance](../../workflow/evidence/part-05/funds-290b6ab7-b6d5-498a-ba5f-12f534624508.json) | 32 integrity/HTTP/browser/recovery checks and eight accessibility scans passed. |
| [Elections](../../workflow/evidence/part-05/elections-5b891333-f1ec-47ae-ac00-656c11056a68.json) | 69 checks, every required funded matrix cell, all six browser methods, 24 V4 and four V3 accessibility scans passed. |
| [Reputation](../../workflow/evidence/part-05/reputation-22c492cb-1668-457f-8113-5a8c5b421945.json) | 14 checks and four accessibility scans passed. |
| [Release analytics/templates/maintenance](../../workflow/evidence/part-05/release-5cf34858-0bcd-4fe3-b57e-cb69261453d9.json) | 22 checks and six accessibility scans passed; actual System insights navigation, native downloads and quota effects verified. |
| [Logical recovery](../../workflow/evidence/part-05/recovery-a9c5e6fc-46af-4e82-8668-8575c4685cec.json) | Actual dump/restore matched all 50 tables and five financial invariants; post-snapshot source mutation stayed separate; configured database untouched. |
| [Large fictional demo](../../workflow/evidence/part-05/large-demo-f1eedbc5-acc9-462c-8c25-88b5ef861dae.json) | 100 members/100,000 BDT/three schemes, sealed ballots, exact payout/refunds, replay and five separate external attestations passed. |
| [Dependency audit](../../workflow/evidence/part-05/dependency-audit-9f41520e-a30d-46b7-9f1d-3e20f64f3a03.json) | npm registry audit reported zero findings at all severities. This does not assess container OS packages. |
| [Secret/artifact scan](../../workflow/evidence/part-05/secret-scan-b93bbfa1-90ab-4256-a92f-2d571edb934c.json) | Gitleaks and distribution scans passed; no configured runtime secrets or retired wallet SDK in browser assets. |
| [General browser](../../workflow/evidence/part-05/browser-af58aafb-2757-4ff5-951e-849acaf98b48.json) | 75 layout/interaction checks passed with no browser runtime errors. |
| [General accessibility](../../workflow/evidence/part-05/accessibility-9b0f1fef-cbf0-4a4d-812f-f8df2af44673.json) | 30 scans passed. |

Earlier failures and superseded receipts remain in the append-only evidence history. An initial final-source unit attempt hit two wall-clock timeouts during host setup; the unchanged rerun passed all 195 tests without relaxing assertions or timeouts. Historical/superseded results are not counted as final-source passes. Screenshot inspection is manual review, separate from these automated receipts.

A separately labelled manual native-package smoke copied the final `.next/standalone` distribution to `C:/Users/Refat/Documents/Codex/2026-11-02/c-users-refat-documents-git-web/work/standalone-package-1794158006527`. Next.js, React, PostgreSQL and Prisma dependencies resolved inside that copy, with no source-directory fallback. The copy served readiness, three public routes, login and three authenticated routes successfully on loopback against the disposable QA database. It was then stopped. This is observed packaging evidence, not an additional workflow-test receipt or hosted deployment.

## Independent review

Reviewer: `/root/standalone_release_review`. The final report is [part-05-standalone-72fba785.json](../../workflow/reviews/part-05-standalone-72fba785.json). Registration requires that actual independent report to bind the final source, complete receipt set and this handoff. Review is pending while final checks/container verification are unfinished.

## External evidence

No real payment, wallet approval, chain transaction or hosted deployment occurred. Fictional service tests and locally observed containers are identified as such. See the dated [container audit](../security/container-audit.md) for exact image identities, scanner observations, retained advisories and compatibility/restore proof. Historical 7 November image observations are distinct from the new local verification.

## Remaining work and next action

Part 5 remains active until the required current-source checks, container gate, criterion acceptance and independent review all pass. Completing it ends the five-part sequence; no Part 6 is authorized.

For deployment instructions use [OPERATIONS](../OPERATIONS.md), [STANDALONE](../STANDALONE.md) and [PRODUCTION](../PRODUCTION.md). The portable native distribution is started with runtime secrets supplied externally, for example `node --env-file=/private/path/fundicate.env .next/standalone/server.js`. Never distribute the source `.env`. For Docker, `node scripts/bootstrap.mjs --docker` preserves generated credentials and its named volume. Public-origin setup uses `--prepare-only`, followed by deliberate TLS/proxy/header configuration before actual startup.

Deployable packaging and local verification do not establish that a hosted environment is configured safely. Before broad public onboarding, the operator must verify TLS, trusted proxy header overwrite and blocked direct access, secrets, private/verified database transport, backups, monitoring and job ownership in that environment. Email verification, self-service account recovery and MFA are not implemented. No independent penetration test, external certification, real-payment processing or automated real-money-weighted governance is claimed. These limits are not silently converted into completed integrations.

The automated role provisioner is verified with a PostgreSQL **superuser operator**, as supplied by the tested Compose database. PostgreSQL 18 gives a non-superuser role creator an automatic administrative membership; the strict dedicated-role policy rejects that edge. Delegated/non-superuser and managed-provider operators therefore require separately reviewed manual role setup or a separately tested provisioning policy. The native service can use appropriately configured DML credentials, but automatic provisioning is not claimed to support every provider. Only Linux/amd64 container execution is verified; checksum declarations for other architectures are not execution evidence.
