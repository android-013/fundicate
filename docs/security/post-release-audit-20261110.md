# Post-release regression and security audit — 10–11 November 2026

Explicit user task: run tests, fix confirmed defects and check the approved specifications. This is maintenance after the completed five-part delivery, not Part 6 and not a reopening or rewrite of historical state.

Canonical project: `C:/Users/Refat/Documents/git web/Startup/fundicate`.
Audit ID: `20261110-d4934bf3-6f77-4eb7-a593-cd1bbf2ad938`.
Durable live state/actual receipts: `.local/security-audits/20261110-d4934bf3-6f77-4eb7-a593-cd1bbf2ad938/state.json`.
Starting source: `a39f984c939611960e1fecbef5fba8c18e737978fd50a523ba21ded6957902d5`; historical delivery revision 412 remains intact.

## Plan and current tasks

- [x] Read canonical specs, original notes and historical release evidence; separate original requirements from optional suggestions and the approved standalone amendment.
- [x] Start independent application-security, domain-integrity and operational-security reviews; preserve all user data.
- [x] Fresh cheap baseline passed on the original a39 source (execution 27893); preserved as superseded baseline after confirmed fixes.
- [x] Protect private abuse-report and member payment audit metadata before public queries/limits/exports/inspection; require recent authentication for legacy staff suspension. Before-fix failures and meaningful regressions are preserved.
- [x] Repair exact weighted Elo tie/rank/allocation calculation and preserve published decision snapshots. Before/after numeric evidence remains in chat workspace `work/audit-domain-numeric-{evidence,after-fix}.json`.
- [x] Repair exclusive/private backup output and owned-file-descriptor restore; validate effective PostgreSQL URL identity across bootstrap/runtime/provision/backup. Reject unsafe reused-role authority, including custom SECURITY DEFINER/native routines in system namespaces. Isolated catalog probes preserve the accepted-before/refused-after observations and a fresh stock-role positive case; no native file-access function was executed.
- [x] Repairs integrated. Targeted reputation (14), election (71), recovery (50 tables / 5 invariants), operations-security (9) and unit checks passed during repair; superseded source receipts and fixture/time-out failures remain evidence, not final passes. New npm/CI operations-security entry runs the nine Node regressions beyond Vitest's glob.
- [x] Final freeze `e2ea7d5dd5eefdef30c0495493e59cc0b4a3df285ba120dcc32083e06c4c883b`: all21 fresh unchanged-source checks passed, including security12, reputation14, elections71, actual recovery, finance/HTTP/integration, payment21, isolated100-member demo and dependency/secret scans. Browser/accessibility and copied package3003 passed; QA preview/database cleanup was observed. Earlier build exit zero with changed source remains explicitly invalid. Actual state/receipts determine progress; targeted diagnostics never substitute for final passes.
- [x] Native copied standalone package passed. Linux web/tools/database images rebuilt/scanned; actual Compose runtime and Unix file-descriptor recovery passed on the unchanged source. All owned test previews/containers and the native keeper stopped; existing data, retained fixture volumes and failed evidence remain intact. Database/browser suites shared port3001 sequentially; no build ran against a live native QA output.
- [x] Final independent review completed against the unchanged final source, all21 receipt/log hashes, native/container/Unix proofs and the new independent container assessment. Exact bindings and disclosed remaining risks are recorded in the separate maintenance review; owned services were independently observed stopped.

## Interruption recovery

The runner is `C:/Users/Refat/Documents/Codex/2026-11-02/c-users-refat-documents-git-web/work/post-release-audit.mjs`, executed with the project's private Node 22.23.4. `status AUDIT_ID` reports actual current-source passes/remaining checks. `run AUDIT_ID CHECK...` records actual commands, UTC intervals, source before/after, exit codes and original log hashes. Completed receipts survive a stopped chat; stale-source or changed logs are not reusable passes.

State and receipts are fsynced and atomically replaced. Inspect saved active parent/child PIDs and runner lock after a crash. Only after both owners are proven stopped use `recover AUDIT_ID REASON`; it preserves interrupted logs/receipts and refuses live or unknown owners. Never hand-edit completed five-part state/history or erase failed evidence.

Native PostgreSQL keeper session2684 was cleanly stopped after all native checks and copied-package proof. Its existing cluster/data remains in `.local/postgres`; start a retained TTY only if more native database work is necessary. Tests used only uniquely named disposable databases; QA cleanup was observed. Agent processes/session IDs are transient; recover from this file and audit state, not assumed process survival. Keep credentials out of logs/reports. Local durability does not replace off-device backups.

The approved scope remains standalone governance with simulated accounting and separate unverified external-payment attestations. No hosted publication, real transfer, wallet approval or NEAR verification is authorized by this audit. Testing cannot certify zero bugs or zero security risk; report actual coverage and residual findings without suppressions.

## Confirmed defects and repairs

1. Private abuse-report metadata and member payment actions could leak through generic activity/analytics paths. A central per-community visibility predicate now applies before queries, limits, aggregations, exports and known-ID inspection. Staff retains legitimate report history; ordinary members retain legitimate payment history. No audit rows were removed or rewritten.
2. Legacy emergency suspension omitted the existing recent-password requirement. Stale sessions now receive 428 before any target/proposal/audit mutation; ordinary members remain forbidden, recently authenticated legacy staff remains supported, and strict member-governed communities remain protected.
3. Contribution-weighted Elo could turn an exact cyclic tie into a monetary winner through floating-point cancellation. Batch net ranking now uses exact integer arithmetic, including a real one-minor-unit distinction. Already published decisions are read from immutable result snapshots; historical payouts and decision versions are preserved.
4. Backup output could be reopened after a path check, and output confidentiality was applied too late. Archive and manifest files are now reserved exclusively with private modes before database work; dump output and verified restore input use owned file descriptors. Checksums, file identity and fsync are checked. This does not claim protection against a trusted operator modifying the same inode in place.
5. A reused runtime role could inherit unsafe routine authority through direct/PUBLIC grants or custom routines placed in system namespaces. Provisioning now refuses these identities before migrations/role changes, checks all namespaces for accessible SECURITY DEFINER routines, and rejects custom native wrappers outside trusted stock catalog objects. It does not silently revoke pre-existing rights. The boundary assumes trusted PostgreSQL installation/catalogs/superusers; extensions require review.
6. PostgreSQL URL query parameters could override the visibly reviewed identity or make TLS interpretation ambiguous between clients. Shared validation rejects authority overrides and duplicate decoded/case-normalized keys across bootstrap, runtime, provisioning and backup/restore; invalid legacy configuration is rejected without rewriting its credentials. Supported ordinary SSL/schema/IPv6 configuration remains covered.

The separate nine-test Node operations suite is now part of npm/CI verification. Regression fixtures use complete production-shaped private event payloads; an earlier malformed synthetic payload failure remains recorded. An unchanged workflow retry passed after a subprocess timeout; neither assertion nor timeout was relaxed.

## Coverage and limits to retain in the final verdict

The independent reviewer reread the actual original Downloads documents and current requirement register. Original mandatory governance/election/funding/reputation requirements remain in scope; optional capped weights (R19) are not an original requirement. The recorded standalone amendment replaces real-chain integration/observations with external-record integrity and isolation. NEAR, wallets, real-money custody and transfers remain disabled and unverified, never counted as performed tests.

Final evidence must include all 21 current-source receipts, a copied native standalone package, rebuilt/scanned Linux images, actual Compose runtime-role/isolation/payment/recovery checks, and real Unix PostgreSQL-client FD backup/restore with mode600 files. Historical Part5 receipts cannot satisfy these maintenance gates. Scanners must retain all severity levels and unfixed findings, with no advisory suppressions.

Unmeasured upper-bound workloads (including 50-candidate/10,000-voter pairwise capacity) are not load-certified. Public TLS/proxy isolation, deployment secrets, backup scheduling/off-device retention, monitoring, email verification, self-service recovery and MFA still require an operator launch policy. No hosted infrastructure assessment, independent penetration test, customer-volume upgrade certification or zero-vulnerability guarantee is claimed. Raw vendor package risks must remain visible even when their supported HTTP input boundary has been assessed.

## Current image evidence

The exact Linux/amd64 runtime image is `sha256:bf4fd700c96e1c36e93ad97d20c0c8507e25bd01a53fd07dd87e44878528f140`; tools image `sha256:fe4eee91a1b77fb14a906dbb258eb91b9f60bdf79fa699e75df391da296d9db3`. Both fresh unsuppressed Trivy scans reported zero observations. The patched PostgreSQL18 Bookworm image is `sha256:d9208d7720eeb42960cd60ffaf034f73547ad7aed0b2b5ad7c4cefd5e59cd760`: **525 raw observations (4 Critical, 115 High, 207 Medium, 174 Low, 25 Unknown)**, including unfixed records. This is not an image-wide security clearance. Current independent vendor/input-boundary assessment remains a required separate verdict.

Actual feed UpdatedAt `2026-11-10T13:03:09.93195248Z`, downloaded `2026-11-10T18:11:28.553843559Z`, NextUpdate `2026-11-11T13:03:09.93195222Z`; scan command receipts bind this feed and exact image IDs. The new scan SHA is `92b15d6962c7f1345ca1b01d2c19b0d64d7be4b2101bcda11a9809f3a5703f96`. The previous historical assessment's stale top-level feed metadata is preserved rather than copied as current evidence. New online gosu binary analysis found zero affected symbols, retaining three imported-package and 55 required-module matches; its exact publisher-verified binary remains `b1892636c281590f34bc63c1118f058cd9de66c4ea463772e3909672d8b302ac`.

All nine image build/scan/inventory/signature/symbol commands exited zero. The audit-only Python wrapper then failed its final status call because a loop variable shadowed the status-helper path. Its original failed receipt is preserved unchanged at `containers/postrelease-images-20261111T005426Z-3bf8f0.json` (SHA `7a4111ded3c94dc0eb8c05ba8511627a14c05ea0b324eae31b2a2f2d6698d645`). A separate actual read-only observation `images-reconciliation-1794359488475.json` verifies all29 exported file hashes, the same build/source before and after, and current Docker IDs against each scan/command/iidfile. It completes this evidence binding without relabelling the original helper failure or claiming another build execution. Product source and all21 native passes remain unchanged.

The first Compose/browser attempt `compose-sequence-1794359637858-3994f543.json` remains **failed**. Real Unix FD backup/restore passed first, but the Edge helper stalled during shutdown after six screenshots and never produced a final browser result. Its timeout, abnormal helper exit, raw logs and owned-fixture cleanup remain recorded. Screenshots are not counted as a browser pass. The retry uses the same20 browser checks/six axe scans and existing timeouts with the installed Chromium already used by the native suites, a new fixture, a new Unix audit directory and distinct screenshot output. No product source or assertions changed for this recovery.

The complete retry `compose-sequence-1794360390167-d0427714.json` **passed**, with all six recorded commands exiting zero and source unchanged. Its fixture `fundicate-audit-a3cd662f2f` used only new labelled resources. Actual Compose migration/runtime credential separation, all14 restricted role flags, non-root UID/capability settings, private DB network/no host DB ports, health/doctor, simulated contribution, external-record replay/reversal/ledger isolation and maintenance all passed. The browser produced an actual result:20 checks/six WCAG A/AA scans at1440/390, zero violations/runtime errors.

Real Unix PostgreSQL18 clients exercised the product helpers as a non-root user: pg_dump wrote the already-owned private descriptor, pg_restore consumed the verified input descriptor, archive/manifest modes were600 under umask022, all50 tables and five financial invariants matched, and only the newly created restore DB was removed. Audit-only client image `sha256:9e5e95fce0f73a6e6a3a423752e4ff67e2dd16d50401580b773b5211cb8d1cd7` extends the exact final tools image solely for this proof; production images do not claim to include PostgreSQL client binaries. The nine Unix operations tests also passed with network disabled/read-only root/tmpfs.

The separate Compose snapshot restore matched50 tables/five financial checks and preserved an intentional later mutation only in its fixture source. A separately initialized disposable baseline→patched PostgreSQL18.6 volume preserved committed data and collation2.36 with zero mismatches; this does not certify a customer volume. Final public evidence indexes are `containers/public-evidence-index-20261111T013116Z.json` (42 files) and `unix-operations/public-evidence-index-20261111T013117Z-615708.json` (seven files). Earlier indexes and changed evidence filenames remain immutable; final indexes select exact filenames/hashes rather than assuming an unsuffixed file belongs to the latest attempt. Private env/cookies/archive bytes were excluded. An actual post-run `docker ps` returned no running containers.

## Final native results

All21 required checks have fresh matching receipts/log hashes on the final source. The independently reconstructed receipt-set hash is `720cc87ec2fab452616455e730a84646db2fb5f904cb39e736e40369c8d83097`.

| Checks | Actual result |
| --- | --- |
| Workflow, unit, Node operations-security |14 workflow /200 unit /9 operations tests passed |
| TypeScript, ESLint, full production build | Passed |
| PostgreSQL integrity, HTTP, application security |27 /61 /12 groups passed |
| Rounds, funds/governance, election/allocation/veto |20 /32 /71 checks passed, including all36 required method cells |
| Reputation, release insights/templates, payment records |14 /22 /21 checks passed |
| General browser and accessibility |75 layout/interaction checks; required accessibility scans passed with no violations/runtime errors |
| Isolated fictional large demo |100 members, three schemes,100,000 BDT simulated;60,000 simulated payout +40,000 refund, zero held/reserved; original DB preserved |
| Registry audit | Zero vulnerabilities across the observed complete npm graph |
| Secret/artifact scan | No findings;62 browser/2,267 server artifact files; no configured secrets/retired wallet integration matches |

Native QA receipt `native-qa-1794358126253-0fb4f44e.json` records final build/server binding and observed preview/disposable-DB cleanup. The copied package resolved Next/React/pg/Prisma entirely inside its distribution with no NODE_PATH/source fallback, and passed health, three public routes, login and three authenticated routes. POSIX mode600 assertions apply to the Unix proof; Windows backups require restricted NTFS ACLs as already documented in OPERATIONS.md.

## Independent completion verdict

Completion status: **complete for this explicit maintenance audit**. Independent reviewer `/root/final_release_reviewer` approved the scoped repairs and verification on 11 November 2026 after inspecting the final integrated source, original requirements and standalone amendment, all21 current receipt/log hashes, copied native distribution, rebuilt-image provenance, successful Compose/browser/snapshot/compatibility and real Unix file-descriptor recovery. Historical delivery revision412, its journal/review/handoff and the historical database assessment remain unchanged. Failed baseline/helper/browser attempts remain preserved.

The separate manual review is `.local/security-audits/20261110-d4934bf3-6f77-4eb7-a593-cd1bbf2ad938/reviews/post-release-review.json`; it binds this exact completed document, source, receipt set, manual evidence and independent container assessment `.local/security-audits/20261110-d4934bf3-6f77-4eb7-a593-cd1bbf2ad938/reviews/container-assessment.json` (SHA256 `96e347e3d66eac02503b8776557aa4fa45f93843f44e2573c11bda07de6304a3`). No unresolved material finding remains within the reviewed standalone HTTP/private trusted-database-peer boundary. The database retains **525 raw findings (4 Critical,115 High,207 Medium,174 Low,25 Unknown)**, including active SQL/XML and native GSS/Kerberos residual risks;344 lower-severity OS observations are inventoried without individual safety certification. This verdict does not authorize public deployment, claim a clean database image or zero bugs, certify arbitrary SQL/native inputs, or count unperformed NEAR/real-money operations as complete. The launch and capacity limits above remain applicable.
