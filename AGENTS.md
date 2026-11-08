## Standalone branch amendment (7 November 2026)

The user approved a separate standalone governance and external-payment-tracking product on this branch. See workflow/DECISIONS.md. This supersedes the NEAR-specific Part 5 gates below only on this branch. Preserve all history and keep the active run; do not describe omitted testnet work as verified.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Fundicate local database in Codex

Run `npm run db:local -- --keep-alive` in a retained execution session with `tty: true` before database-backed development or tests. Codex can terminate background child processes when their launching cell exits. Keep the database session alive while working; send a newline-terminated `stop` command to that same session for a clean shutdown. A non-TTY session may have closed stdin. Normal native terminal usage may use `npm run db:local` as a background daemon. Never reset the demo database as part of testing: use the isolated `npm run test:integration` and `npm run test:e2e` runners.

## Canonical five-part delivery and the next trigger

The user's current delivery instruction supersedes the old phase numbering: **all work completed before this plan is Part 1/5**. Exactly four implementation parts remain. Read `docs/MASTER-PLAN.md`, `workflow/plan.json`, `workflow/requirements.json`, `workflow/DECISIONS.md`, `workflow/DEPENDENCIES.md`, `workflow/FORMAT.md` and `node scripts/progress.mjs status` before acting on the next part. `progress.md` is the human-readable projection, not an independent counter.

The user has explicitly authorized an agent-based implementation/review loop. On an actual user request **next** (or an unambiguous request to do the next part):

1. Select the eligible part once, at the start of the turn, from machine state. A quoted occurrence of the word next in planning/discussion does not trigger implementation.
2. If a part/run is already active, unfinished or blocked, resume that exact part/run. A next message received while that run is executing does not queue another part. Do not skip a blocked part or replace its run ID.
3. Begin only the explicit eligible part using the progress CLI's part/run/revision guards. Never alter the real state to demonstrate or test advancement; workflow tests use isolated fixtures.
4. Use the coordinator/domain/frontend/reviewer briefs in `docs/agents/`. The coordinator owns state and integration. Spawn/reuse bounded agents with explicit requirement IDs, interfaces and exclusive file ownership, within the four available slots. Do not give two agents concurrent write ownership of shared schema/router/service files.
5. Implement, integrate, verify, independently review and repair **that part only**. Necessary regression/prerequisite fixes are included; unrelated future-part features are not. Continue until its acceptance gates pass or a real external dependency/user input is required.
6. Record actual check receipts, requirement acceptance, independent review and `docs/parts/part-NN.md`. Required checks must execute and match the final source snapshot; historical counts or handwritten passed flags cannot substitute. Follow the exact CLI contract in `workflow/FORMAT.md`.
7. Complete only after all mandatory gates pass with no unresolved blocker. Stop after that part and wait for a fresh user next. Do not automatically start the next part. After Part 5, report the completed sequence instead of inventing Part 6.

These are short-lived agents driven by user requests, not scheduled tasks or an unattended daemon. Their briefs and progress persist on disk; running processes are not promised to persist between chats. Without a stable client message ID, identical later next messages cannot be perfectly deduplicated; explicit part/run/revision selection and the one-part-per-turn rule must still hold.

## Confirmed decisions and preservation rules

- GECCO in the source document means **Glicko-2**, confirmed by the user. Implement the actual specified algorithm with official reference-vector tests, separate from Elo.
- Part 5 requires **real, verified NEAR testnet deposits, payouts and refunds**, including necessary account funding and wallet approvals. A compiled adapter or simulated receipt is not enough. If an external prerequisite is missing, record a named blocker and keep Part 5 active.
- Preserve existing UI, networking, dashboards, analytics, saved views, exports, legacy proposal/treasury flows and all posted history. Use additive/versioned migrations. Published V1 rounds stay decision-only; never add payment rights retroactively.
- Segregate committed round money from legacy spendable treasury; reservation counters alone do not protect against the existing treasury spend path. Keep election and financial lifecycles separate. Centralize payout/veto/reconciliation gates.
- Never fabricate pledges, contributor ownership, balances, chain hashes, receipts, finality or test results. Keep private keys and credentials out of source, logs, progress state and browser bundles.
- The current permission to build the system does not authorize mainnet, unrelated hosted publication, destructive data resets or messaging other people. Request only genuinely missing environment/wallet permissions or external inputs, explaining their source and exact purpose.

## Agent execution and evidence loop

Before delegation, agree on the part's data/API/result contracts and file ownership. The reviewer can prepare adversarial cases while implementation proceeds, then review the actual final source and evidence. A source fix after review/checks invalidates stale acceptance; rerun the affected required gates and renew the final review. Distinguish local simulation from external testnet observations in every report.

Run production/database/browser suites in their documented dependency order; suites sharing port 3001 run sequentially. Do not run a build against a live preview using the same generated output. Stop owned previews and shut down the retained database keeper cleanly when finished. A failed check, interrupted helper or stale lock is diagnosed and explicitly recovered using `workflow/FORMAT.md`; never silently reset progress or erase evidence.
