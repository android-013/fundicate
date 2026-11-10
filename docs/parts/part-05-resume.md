# Part 5 finish checklist and recovery

Updated 10 November 2026. Canonical project: `C:/Users/Refat/Documents/git web/Startup/fundicate`.
Same run: `72fba785-3bf0-4f38-a257-558a5455442f`. Finish amended standalone Part 5 only; no new features, providers or Part 6. No hosted publication is authorized.

## Current checkpoint

COMPLETED: CLI revision **412**, status **complete**, completed parts **1–5**, next part **null**, active run **null**. All 20/20 current-source checks, all 24 criteria, final handoff and genuine independent review passed. Final source remains `a39f984c939611960e1fecbef5fba8c18e737978fd50a523ba21ded6957902d5`. Do not resume the closed run, create Part 6 or reinterpret this standalone completion as verified NEAR.

Final native package passed: `.local/native-package-final-1794291663425.json` preserves actual command/raw log/final-build binding and artifact `standalone-package-1794291631217`. All pipelines are finished. QA session 40834 stopped cleanly and removed only its disposable database; native keeper 64151 stopped PostgreSQL cleanly. Docker fixture services are stopped; their owned fixture resources and failed/successful evidence remain retained. No user database was reset.

Registered independent report: `workflow/reviews/part-05-standalone-72fba785.json`, SHA-256 `6813933c64f2d9d5ee4400f1e64b6ae7e3a9aba9cec2b469bfd08fd31796a602`. Final receipt-set SHA-256 `d8485c140c5eea28d75d6d3d8cda6faa239badc9b83491f48fa84ecafe4e77a1`; handoff SHA-256 `c027643c87e265644cef297660e6f7e86c801342d686c933c638db14379fe1e7`. Validation passed before guarded completion.

Container blocker resolved by CLI on 10 November after genuine separate assessor/reviewer approval for the tested standalone HTTP boundary. The exact 473-record assessment is `docs/security/database-assessment.json`, SHA-256 `a809fd51f3ec3aa69ecfd85fa981c54102096dee0d04c13fd17d2641a2bed101`; current successful evidence index is `.local/container-audit-20261108/public-evidence-index-20261110T060808Z.json`. Raw severities, active SQL/XML, pre-authentication GSS and trusted-private-database-peer/operator limits remain explicit. Final 20 checks, 24 criteria, handoff and independent release binding are still required.

- [x] Read-only audit: 12/20 current receipts on source `643d7ea645e9a14b14d67526d35417a0148a3a41ece1402550e1885b98044db5`, eight stale; all receipt/log hashes verified.
- [x] Correct factual deployment-document scan drift once, before final freeze. This changes the source fingerprint; renew all required checks after freeze.
- [x] Copied native package passed on 10 November with own dependencies, health, login, three public and three authenticated routes; no product fix or assertion relaxation. Artifact `standalone-package-1794289550529` in chat workspace. Repeat after final build for final packaging proof.
- [x] Final source frozen: `a39f984c939611960e1fecbef5fba8c18e737978fd50a523ba21ded6957902d5` (only deployment prose changed since 643d).
- [x] All 20 required checks passed in dependency order on final source, including 75 general browser checks, 30 general accessibility scans and final copied-package execution.
- [x] Final containers built; scanner data refreshed 10 November with explicit all-severity commands/no suppression. Web `addb03f2…` and tools `833fdbc2…` scans report zero; DB `ea816ac5…` retains 473 package findings including 4 Critical/75 High/17 Unknown for assessment.
- [x] Actual isolated Compose `b81b181f94` passed HTTP/payment replay/reversal, 14 denied elevated role flags/memberships, doctor with 16 migrations, browser20/six axe/zero runtime errors, 50-table/five-invariant snapshot restore and separate same-major data/collation compatibility. Existing user data untouched; failed `53b916f288` remains preserved.
- [x] Independent database assessment and final release review passed with disclosed residuals; no blanket advisory waiver.
- [x] Final handoff, all 24 current criteria, blocker resolution, reviewer binding, validation and Part 5 completion recorded through the CLI.
- [x] Stopped owned QA services and database keeper cleanly; all evidence and user data preserved.

## Resume after shutdown, pause or exhausted credits

1. Read `AGENTS.md`, `docs/MASTER-PLAN.md`, this file and `workflow/FORMAT.md`; run `node scripts/progress.mjs status` from the canonical project. Machine state/history and receipts are authoritative, not a chat percentage or process list.
2. If status is complete and no run is active, report the completed sequence and stop; do not reopen this run or invent Part 6. Otherwise resume this exact unfinished run. Never initialize/reset progress, replace the run, advance to another part or delete evidence. A completed receipt survives a lost chat/process. Recheck its source fingerprint and log/receipt hashes before reusing it.
3. Inspect `activeCheck` and any lock owner. Only when the recorded owner is proven stopped, use the documented `recover-check`/`recover-lock` CLI with a reason; never remove live/unknown locks. A journal/projection mismatch uses validated `repair`, not hand edits.
4. Restart the retained local PostgreSQL keeper using `node scripts/local-db.mjs start --keep-alive` in a TTY. Its existing `.local/postgres` data persists; never reinitialize, reset or reseed the configured database. An abrupt process loss may require normal PostgreSQL recovery on restart. These files do not replace an off-device backup.
5. Production suites sharing port 3001 execute sequentially. Build before them. Use only unique disposable test databases; a lost test can be rerun without replaying user financial operations. Keep `.env` and generated credentials private and unchanged.
6. Recreate disposable browser QA on port 3002 as needed. Stop it before rebuilding shared `.next` output. Copied-package smoke uses port 3003; actual Compose fixture uses port 3308. Inspect existing listeners/resources before starting duplicates.
7. Docker verification uses new uniquely named fixture volumes, never an existing user volume. After interruption inspect retained fixture results/logs and Compose labels before cleanup; never use broad prune or delete user volumes. Preserve failed results.
8. Agent processes may not survive interruption or a usage limit. Restart bounded agents from saved briefs and exact requirement/file ownership. Final independent review must inspect the final code/evidence/handoff; a coordinator cannot substitute a self-review.
9. Update this checklist and record a concise CLI checkpoint after each completed phase or blocker. Store no credentials in checkpoints. Only CLI mutations may update workflow state/history.

Helpers and transient process IDs are in the chat workspace `work/`; their existence is not evidence of success. The final handoff is `docs/parts/part-05.md`. All required gates and real independent approval must pass before completion.
