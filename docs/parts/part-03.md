# Part 3 — Weighted governance, allocation policies and rejection veto

## Run and scope

Run `0fa01744-7c3e-4e22-a4e8-c25a2633236f`, 5–6 November 2026. This part implements R15–R18. Part 1 and Part 2 behavior/data are preserved. Optional capped weights (R19), advanced election/rating methods and real testnet transfers remain outside this part.

Final source fingerprint: `b96507e4312066d0aa906a7b8cf6dd23f007e6ad454167fa1c2d58af53d6f952`.

The canonical V3 specification is `docs/algorithms/part-03.md`. New funded requests explicitly choose `fundedVersion: V3`; existing funded API requests without that field remain V2. V1 stays decision-only. Published V2 rounds retain equal/FPTP/winner-all/veto-disabled semantics. No old financial or ballot history is rewritten.

## Delivered behavior

V3 independently configures equal or actual paid-contribution power for screening, selection and veto. A database-maintained membership basis tracks activations/departures until collection cutoff, using UTC comparisons independent of session timezone. Freeze uses received original-source deposits in the same round and asset, never declarations. Later membership/role changes, deposits and departures cannot rewrite power or remove valid frozen ballot rights. Zero-power stage voters are rejected; an invalid all-zero weighted election produces no award and safe refunds.

Screening publishes rounded power quorum, YES/NO/ABSTAIN participation and strict YES > NO approval. Selection is a one-choice FPTP power ballot with rounded quorum and no selection abstention ballot. Frozen zero-power moderators receive no role privilege. Pending stage results/other voters' ballots remain sealed; a caller can see their own recorded choice.

All three allocation policies use exact BigInt amounts. Winner-all requires a unique positive leader and applies the winning request cap. Proportional allocation splits by positive support with deterministic largest remainders before caps or recipient validity. Ranked cuts require 1–50 positive basis-point shares totaling 100%; ties consume and refund all tied positions, missing slots refund, and no slot shifts to another rank. Request caps, unpayable recipients, zero support, unused shares and rounding residuals return to original contributors. There is no hidden redistribution or fee.

Every V3 final election publishes an immutable RoundDecision with its support result, exact proposed allocation and veto denominator before any transfer preparation. Enabled rejection veto lasts the full 24 hours. One sealed REJECT/KEEP/ABSTAIN per positive-power frozen voter; rejection requires at least 90% of all frozen eligible veto power, including nonvoters and abstainers in the denominator. Everyone voting does not shorten the window. At close, rejection returns all principal to original sources; otherwise only the published allocation supplies payout instructions. Proposed decision history remains unchanged even when the final financial plan is refunds.

Preparation, queueing, processing, every operation, local reconciliation and database transfer guards share version-aware settlement conditions. Expiry does not bypass a published active veto. Unpublished unresolved expired pools can queue full refunds; their immutable no-payout plans remain resumable and replay-safe. Queued plans survive later expiry. UNKNOWN outcomes block submission and release until local atomic-ledger evidence reconciles the same operation identity. The local reconciler makes no external-finality claim. A failed local posting records a durable failed attempt and retries the same intent once.

The UI offers stage weights, all allocation modes, exact ranked percentages and optional veto in new V3 drafts. It shows own/total frozen power, published denominators, proposed allocations, a sealed veto form/deadline/result, funding receipts and reconciliation controls. V1/V2 controls and the established responsive blockchain-themed design remain available. Advanced methods are not advertised as enabled.

Source paths: `src/lib/elections-core.ts`, `src/lib/rounds-v3.ts`, `src/lib/funded-rounds.ts`, `src/lib/rounds.ts`, `src/components/round-v3.tsx` and the existing round forms/detail views. Additive migrations: `20261105040000_weighted_veto_rounds`, `20261105050000_v3_transfer_gate_fix`, `20261106000000_v3_utc_cutoff`. Existing treasury accounts, balances, entries, legacy proposals and posted history retain their identities.

## Verification evidence

All 12 required gates passed against the final source fingerprint above. Every current receipt records exit 0 and unchanged source. Actual receipts/logs are under `workflow/evidence/part-03/`; earlier failed attempts remain in history.

| Gate | Actual result | Current receipt |
| --- | --- | --- |
| workflow-tests | 13 passed | `workflow-tests-e10afb6f-5b63-41f3-bf99-03c201799bac.json` |
| unit | 57 passed across 6 files | `unit-dc920a45-d6ec-46d9-8b25-dc4530d30034.json` |
| typecheck | Passed | `typecheck-e19974cf-209d-4eba-bc9b-c419bfec8aad.json` |
| lint | Passed | `lint-c41de8ea-70c5-465e-962f-355f07209abe.json` |
| integration | 27 PostgreSQL checks passed | `integration-750b53e5-1cdc-4a6f-8a05-e5ced9ea2012.json` |
| build | Prisma generation, TypeScript, compile and static generation passed | `build-92058124-2146-4a2f-835e-552eee551b66.json` |
| http | 61 checks passed | `http-fb748e3e-5c15-443c-af9b-3dee753eca76.json` |
| browser | 75 checks passed; no browser runtime errors | `browser-19c1d743-f24c-4e45-aa3d-921a9d7b6f9b.json` |
| rounds | 20 checks plus 14 zero-violation axe scans passed | `rounds-35481c0a-0597-4e07-bc51-f9a0f447409d.json` |
| funds | 32 checks plus 8 zero-violation axe scans passed | `funds-b07c5b7d-22d3-41bd-9eb7-a58b9d07e328.json` |
| elections | 23 checks plus 4 zero-violation axe scans passed | `elections-f8da73c3-9e08-4cf4-8795-6a09ac1e1d87.json` |
| accessibility | 30 general-app scans; zero violations | `accessibility-6ec09060-8c49-4b77-a4ed-518e697fe451.json` |

The election suite covers independent stage weights, weighted minority headcount/majority power, abstention denominators, pending ballot privacy, zero-paid staff, cutoff membership/departure and role changes, timezone-sensitive membership tracking, full veto boundaries, exact 90/89-percent decisions, all-voted early closure denial, direct SQL bypass/immutability, UNKNOWN reconciliation, durable posting failure/retry and worker restart. Six separately named funded rounds cross all allocation policies with equal and contribution selection power using fixed payout/refund oracles. UI tests submit a ranked/veto draft, cast an actual sealed ballot and scan desktop/390/320 layouts.

The four accessibility groups total 56 executed scans. Coordinator inspected `test-results/fundicate-v3-veto-1440.png` and `fundicate-v3-veto-390.png`; `.local/elections-accessibility.json` records the V3 scans. Demo data was never reset; database suites used unique isolated databases. Isolated and seeded preview servers ran sequentially to avoid shared-build/test interference.

Earlier fixture failures were repaired without weakening product rules: a veto-expiry fixture now respects the three-day minimum while overlapping the veto deadline, and UNKNOWN retry coverage explicitly rejects a noncontributor before using concurrent authorized workers.

## Independent review

Reviewer `/root/part03_review`; report path `workflow/reviews/part-03-0fa01744.json`. The report records the independent verdict and binds the source, current receipts and this handoff. Approval requires no unresolved material finding.

Issues repaired during review: queued no-decision expiry refunds initially could not resume; PostgreSQL session timezone could shift naive UTC cutoff comparisons; and non-winner-all audit outcomes could contradict the persisted allocation outcome. An early integration guard was also corrected to distinguish operation-only fields from ledger transaction fields. The reviewer independently checked 9,000 allocation plans (3,000 deterministic pools across all three policies), conservation, request caps, permutation invariance and weighted denominator edges. This is manual review evidence, not an automated workflow receipt.

## External evidence

All monetary behavior remains explicitly local simulation. No mainnet/testnet receipt, wallet approval or external finality is fabricated. Verified real NEAR testnet operations remain a mandatory Part 5 gate.

## Remaining work and next action

No Part 3 implementation remains. The progress CLI and linked independent review control formal closure. Stop after this part and wait for a fresh user `next`. Part 4 adds the specified advanced election methods and participation-based reputation under new immutable rule versions; published V3 meaning must remain unchanged.
