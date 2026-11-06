# Progress CLI and evidence contract

Run from the Fundicate checkout, or use `npm run progress -- COMMAND ...`. No command starts implementation by itself: the coordinator follows the user-triggered contract in AGENTS.md. There is deliberately no auto-next command, scheduler or background agent service.

## Files and ownership

- `plan.json`: five part boundaries, requirement IDs, required check IDs and handoff paths.
- `requirements.json`: acceptance criteria and original/user/enhancement provenance. R19 is explicitly optional; every mandatory requirement is assigned.
- `method-matrix.json`: all 36 required method/weight/allocation cells; unresolved cells cannot be hidden to close Part 4.
- `state.json`: the current projection. Only the coordinator mutates it through the CLI.
- `history.jsonl`: hash-linked, append-only transition journal, including state snapshots for explicit projection recovery.
- `evidence/part-NN/`: actual check receipts and combined stdout/stderr logs.
- `reviews/`: independent reviewer reports, bound to final source/check receipts/handoff.
- `progress.md` in the repository root: generated between delivery-status markers; historical implementation notes below them are preserved.

Initialization imports only the accepted historical Part 1. It does not execute product tests, create an active Part 2, or convert historical test counts into fresh evidence. Never use init to reset existing progress.

## Inspect, begin and resume

```text
node scripts/progress.mjs status
node scripts/progress.mjs validate
node scripts/progress.mjs begin --part 2 --run-id UUID --expect-revision N
node scripts/progress.mjs checkpoint --run-id UUID --note "Current integrated behavior and remaining checks."
```

Read status first. Use an actual UUID and the reported revision. A begin for the active part with the same run ID resumes it; another part/run is rejected. Resume does not erase prior failures, blockers or evidence. A source snapshot is a SHA-256 fingerprint of source, schema, scripts, tests, selected config and canonical policy files. Generated build output, local databases, screenshots, status/journal/evidence and handoff prose are excluded.

Published versioned rule documents under `public/rules` are included in the source snapshot. Changing a public specification invalidates old verification just as changing an engine does; the V4 unit suite also checks that the published copy exactly matches its frozen algorithm document.

Do not begin Part 2 during a planning-only request. A fresh user next selects the eligible part once. Another next while it is running does not queue the following part. Identical later messages cannot be perfectly deduplicated without a stable client message ID; explicit part/run/revision selection prevents accidental active-run replacement and skipping.

## Run actual checks

```text
node scripts/progress.mjs check --run-id UUID --id unit
node scripts/progress.mjs check --run-id UUID --id funds
```

Checks use predefined Node executable/argument arrays, not shell interpolation or arbitrary user commands. The available IDs are:

| ID             | Actual command behavior                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| workflow-tests | Node test runner for `tests/progress-workflow.test.mjs`                                   |
| unit           | Existing unit-test wrapper                                                                |
| typecheck      | Installed TypeScript CLI with `--noEmit`                                                  |
| lint           | Installed ESLint CLI                                                                      |
| integration    | Isolated database runner, integration mode                                                |
| build          | Prisma generate, TypeScript, then the complete build wrapper, sequentially                |
| http           | Isolated database/production HTTP runner, e2e mode                                        |
| browser        | Existing browser test wrapper                                                             |
| rounds         | Isolated funding-round runner                                                             |
| accessibility  | Existing axe wrapper                                                                      |
| funds          | Isolated runner's funds mode, added by Part 2                                             |
| elections      | Isolated runner's elections mode, added by Part 3 and expanded in Part 4                  |
| reputation     | Isolated runner's reputation mode, added by Part 4                                        |
| near-testnet   | `scripts/verify-near-testnet.mjs`, implemented in Part 5 and querying actual observations |

Future suites are requirements to implement, not passing placeholders. A missing script, unsupported runner mode, nonzero exit or source edit during execution produces nonpassing evidence. A handwritten passed flag has no CLI equivalent.

Each receipt records run/part/check, actual argument arrays, start/end UTC times, exit code, source fingerprint, whether source stayed unchanged, and log path/hash. The active check has a durable token/PID, but the short state-write lock is released while its child executes. Checks serialize within the run, avoiding shared port/build conflicts. The coordinator can still checkpoint or report progress during execution.

Start the retained TTY PostgreSQL keeper before database work. Build before production tests, run suites sharing port 3001 sequentially, and serve the normal seeded app for the existing browser/accessibility wrappers. Root AGENTS and README contain the environment rules. Do not execute external transfers inside retryable transactions or print secret configuration into evidence logs.

## Record criterion acceptance

```text
node scripts/progress.mjs accept --run-id UUID --requirement R11 --criteria 1,2 --checks funds,integration --note "Name the executed cases and how they prove these criteria."
node scripts/progress.mjs accept --run-id UUID --requirement R11 --criteria all --checks funds,integration --note "Use all only after every criterion has genuine supporting evidence."
```

Criteria are 1-based indices in requirements.json. Referenced check receipts must already exist, pass, retain their original logs and match the current source. Each acceptance stores its own snapshot/evidence references and rationale. It is not globally verified until the complete part passes review and closes. The CLI checks mechanical consistency; the coordinator/reviewer judge whether evidence genuinely proves each product requirement.

## Blockers and recovery

```text
node scripts/progress.mjs block --run-id UUID --id testnet-funding --reason "Exact missing prerequisite and attempted independent work."
node scripts/progress.mjs resolve --run-id UUID --id testnet-funding --note "What was actually supplied or verified."
```

An unresolved blocker retains the same active part/nextPart and prevents completion. A resolution note does not replace required checks or real wallet/RPC evidence.

If a helper was interrupted, inspect its retained process, log and state. Only after its owner PID is proven stopped:

```text
node scripts/progress.mjs recover-check --run-id UUID --reason "Owner stopped; preserve partial logs and rerun this check."
node scripts/progress.mjs recover-lock --reason "Proven-dead lock owner; record explicit recovery."
```

Never remove a lock because it is old or steal one from a live/unknown process. If a crash occurred between durable journal append and projection write, inspect the valid journal then use:

```text
node scripts/progress.mjs repair --reason "Restore state/progress projections from the validated journal."
```

A malformed/altered journal fails closed; repair does not silently reset it. Preserve evidence and investigate/back up before any manual restoration.

## Handoff, independent review and completion

Prepare the assigned `docs/parts/part-NN.md` using `docs/parts/TEMPLATE.md`. It must include `# Part N`, `## Verification evidence`, `## Independent review` and `## Remaining work and next action`. Prepare its known review-report link before review so the handoff can be hashed without a circular edit.

After all required checks/criteria pass and blockers are resolved, status provides `sourceFingerprint`, `receiptSetHash` and `handoffHash`. The independent reviewer writes a JSON report under workflow/reviews with:

```json
{
  "part": 2,
  "runId": "actual-active-run-uuid",
  "reviewer": "/root/actual-independent-review-agent",
  "independent": true,
  "verdict": "pass",
  "sourceFingerprint": "current-status-value",
  "receiptSetHash": "current-status-value",
  "handoffHash": "current-status-value",
  "requirementsReviewed": ["all-assigned-part-requirement-ids"],
  "preservation": {
    "legacyFeatures": true,
    "historyPreserved": true,
    "heldFundsIsolated": true,
    "privacyPreserved": true
  },
  "findings": []
}
```

This is a schema illustration, not a current review. Record actual reviewer identity and findings. Findings must be resolved; only low-severity accepted findings with a substantive reason can remain accepted. A self-review labeled coordinator is rejected. Local metadata/hashes do not cryptographically prove a person's independence or the semantic completeness of a test; actual agent review remains necessary.

```text
node scripts/progress.mjs review --run-id UUID --file workflow/reviews/actual-report.json
node scripts/progress.mjs validate --run-id UUID
node scripts/progress.mjs status
node scripts/progress.mjs complete --part 2 --run-id UUID --expect-revision N
```

Completion requires every mandatory assigned criterion, all required actual checks, matching source/log/receipt hashes, a current independent review, an unchanged handoff and no blocker/active check. It advances the eligible number once and clears the active run, then waits. Part 5 completion ends the five-part sequence; no Part 6 is created.

A new code/policy/test change invalidates stale evidence. A new check changes the receipt-set hash; a changed handoff changes its hash. Renew acceptance/review as needed. Do not downgrade required checks or edit state/history to force a pass.

`--root PATH` exists for isolated workflow tests/CI fixtures. It is never used to fake real application evidence or demonstrate advancement against the actual project. Planning verification is limited to this workflow tooling; the product's prior verification remains a dated historical baseline.
