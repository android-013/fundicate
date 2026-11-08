# Fundicate — five-part delivery plan

## Standalone branch scope — user approved 7 November 2026

On codex/standalone-security-audit the user approved the proposed first release: community governance plus transparent tracking of externally handled payments, separate from blockchain. This explicitly supersedes NEAR-specific Part 5 acceptance on this branch. It does not mark unperformed testnet work complete. Existing historical milestones and evidence stay intact. The active Part 5 run is retained.

No wallet, chain transfer, bank transfer or automated payment processing is offered. New append-only staff payment attestations are independently unverified, separate from simulated ledgers and never confer voting weight/payment rights. Corrections are full-source reversal records, not money refunds. Existing simulated treasury/rounds and V1-V4 published history remain intact. Chain models and old contract/source/evidence remain dormant historical material, not enabled product features. Switching FUNDICATE_MODE to near-testnet is rejected. No automatic restoration of these features or mainnet/hosted deployment is authorized.

The branch replaces R28-R30 chain integration/observations with standalone isolation, external-record integrity and failure/concurrency recovery. R31-R36 retain analytics/privacy, templates, operational hardening, isolated fictional demo, fresh security/regression review and preservation, excluding real-chain demonstrations. Required checks add security and payment-records; archived chain/contract/testnet checks are no longer release gates by this explicit user-approved scope amendment. Remaining production limits must be reported honestly.


This is the canonical delivery plan. **All work completed before this plan is Part 1/5**, including the earlier architecture/UI/analytics phases and the two funding-round capability phases. The remaining work is delivered in exactly four parts, numbered 2–5. Historical sub-phase numbers do not consume these four parts.

The user saying **next** authorizes exactly one eligible part. Planning creates no authorization to run through the remaining parts automatically. If a part is unfinished, another next resumes it. Completing a part ends that execution cycle. After Part 5, next reports the completed sequence rather than creating a sixth part.

## Confirmed scope and sources

- Baseline: the **Original project notes** in `C:/Users/Refat/Downloads/Money_Heist_Formatted.md`, the provided Markdown transcription of the PDF. Its structured response explains the concept and proposes additions; optional suggestions are not silently promoted into original requirements.
- The user's clarification makes **Glicko-2** the intended algorithm for the document's GECCO label.
- The user's clarification makes a **verified NEAR testnet flow mandatory for Part 5**, including actual funding and wallet approvals when needed.
- Preserve the existing Fundicate name, blockchain-inspired UI, networking, dashboard/analytics, saved views, CSV, legacy proposals, treasury and financial/audit history.
- Bounded additions beyond the original notes are explicitly included below: safer participation-based reviews/moderation, reusable templates, integrated analytics, operational recovery and a reproducible demo. Additional unrelated features remain backlog; they do not create another automatic part.

`workflow/requirements.json` is the requirement-level acceptance register; `workflow/plan.json` maps it to parts. `workflow/state.json` and the checked history record actual progress. One of five parts complete measures milestones, not the percentage of PDF requirements implemented or production readiness.

## Parts and acceptance gates

### Part 1 — Existing application and first capability upgrades · accepted historical baseline

Includes authentication/profiles, community RBAC and membership governance, immutable simulated treasury/ledger, legacy proposal flows, responsive blockchain theme and networking, customizable dashboards/deep analytics, saved views/CSV, and multi-scheme rounds with equal-weight screening/FPTP selection and stage-specific hidden ballots.

The dated prior verification is in `docs/VERIFICATION.md`: 31 unit tests, 27 PostgreSQL checks, 61 HTTP checks, 75 existing browser checks, 20 new round scenarios and 14 round accessibility scans. These are historical results, not fresh runs of the planning tools. Current round selections do not move/reserve funds. Some original-document requirements remain outstanding despite this accepted baseline.

### Part 2 — Funded rounds, accounting and governance foundation

Requirements: **R07–R14**. Deliver a complete local funded round using equal-weight FPTP, winner-all allocation and an explicitly published **veto-disabled** rule version.

- Introduce rule/asset versions and snapshots before adding financial behavior. Existing published V1 rounds remain decision-only and never acquire retroactive payout authority.
- Keep election state separate from collection/reservation/settlement/refund state. Preserve old account IDs and posted entries when migrating the current community/kind account selectors and constraints.
- Record received simulated contributions separately from declarations. Segregate held funds into scoped round accounts so the legacy TREASURY spend predicate cannot consume them. Track contributor ownership, receipts, targets, min/max, cutoff and recovery/expiry policy.
- Add exact winner-all settlement and contributor refunds, including failed targets, empty rounds, no quorum, ties, capped requests, unpayable recipients and unused funds. Publish residual handling before collection. Never invent historical individual ownership of a communal treasury.
- Add durable operation IDs/outbox/attempts, concurrency/replay protection and restart-safe local processing. Never perform an external transfer inside the retryable database transaction.
- Introduce a strict PDF-conforming governance profile: declared contributions include the founder; admission uses member majority; removal uses exact two-thirds and can replace an administrator through a published, eligible successor and atomic succession. Preserve legacy REVIEW and transfer behavior as named/versioned extras. The original notes do not require a 24-hour membership-admission deadline; 24 hours applies to scheme screening.
- Keep existing emergency staff suspension as an explicitly legacy-profile extra. The strict profile must not let staff unilaterally strip active voters or otherwise change membership status to shape a current ballot; use its published member-governed process. Preserve and test both profile behaviors.
- Add STAFF scheme submissions; preserve MEMBERS and EVERYONE. Funding-request categories can describe donation/crowdfunding/investment intent without inventing equity ownership or promised returns.

Gate: a funded local round can collect, hold, choose and either settle or refund with exact conservation. Legacy spending cannot consume held funds. Repeated/concurrent requests have one effect. Unsupported future veto/algorithm settings are rejected; no UI advertises them as available. All current features remain usable.

### Part 3 — Weighted governance, allocation and rejection veto

Requirements: **R15–R18**. Extend new versioned rounds while preserving V1/V2 behavior.

- Support equal and paid-contribution weighting independently for screening, selection and veto. Freeze eligible power from actually received, eligible round funds at the published cutoff. Reject all-zero weighted electorates and never combine assets to create weight.
- Publish all denominators. Admission/screening require a strict majority of YES/NO power plus quorum; abstentions count toward ordinary participation, not approval. Removal uses exact `3 * YES >= 2 * (YES + NO)` with quorum.
- Deliver winner-all, proportional and configurable ranked cuts. Ranked percentages total 100%; ties, insufficient winners, request caps, zero support, unpayable recipients and residuals follow prepublished rules. Default unused shares/caps to refunds rather than silent redistribution. Use integer arithmetic and a deterministic remainder rule.
- Freeze the result and allocation plan before rejection. A configured veto holds **every** payout path for the full 24-hour window. At least 90% of all frozen eligible veto power rejects the entire round; non-votes are not rejection. Equal/weighted veto is explicit. Successful rejection refunds the original contributors.
- Controllers, workers, legacy bridges and retries use a central settlement gate. No early payout because everyone voted, a staff action was clicked or a worker restarted. Keep immutable plan and outcome history.

Gate: all three allocation modes and both required weight modes reconcile exactly; veto success/failure/boundaries and concurrency tests pass. For each round and asset, `received = held + reserved + paid + refunded` (fees are zero unless separately published/versioned). Optional capped weights R19 are backlog, not a substitute for ordinary weighted voting.

### Part 4 — Complete election methods and social reputation

Requirements: **R20–R27**. FPTP remains supported. Add ranked-choice/IRV, multi-winner STV, Elo, Glicko-2 and forced-choice +1/-1 pairwise polling.

- Before coding an engine, freeze its ballot schema, tie/coverage/exhaustion rules, parameters, weight treatment, precision and result-to-allocation contract in an algorithm specification. Preserve earlier rule versions.
- STV specifies quota, seats and surplus transfers; elected candidates and monetary allocation remain separate. Elo and Glicko-2 are distinct. Glicko-2 includes rating, deviation, volatility and rating periods, and must pass Glickman's official example vectors. Any contribution-weighted extension is separately named/specified/tested, with the standard equal-weight case preserved.
- Each engine produces a reproducible ranking/tie structure, declared support measure and replay transcript. Do not divide raw Elo/Glicko ratings into proportional money shares. The required compatibility register is **six methods × two weight modes × three allocation policies = 36 cells**, recorded in `workflow/method-matrix.json`. Define a nonnegative support/allocation transformation for each required cell. An unresolved cell keeps Part 4 active; hiding a control or rejecting an incoherent combination is not completion. Only an explicit later user-approved scope change can exclude a required cell.
- Bound pairwise workloads in the published method specification: 50 candidates imply 1,225 possible pairs per voter. Declare feasible assignment, completion/coverage and duplicate rules before voting, without silently dropping required comparisons or counting one person's many comparisons as many voters.
- Complete ranked/pairwise ballot validation rejects duplicates, invalid candidates/pairs and ineligible votes. Count unique eligible voting power correctly; many pairwise comparisons do not make one person many voters. Preserve sealed ballots through all UI, audit, analytics and export paths.
- Add 1–5-star scores and written reviews for **members, schemes, legacy proposals and agendas/rounds**. Use actual shared participation, prevent self/duplicate/ineligible reviews, show count/average, and distinguish proposal presentation from actual recipient performance. Add abuse reports, moderation reasons, appeals and preserved history.

Gate: every required method is implemented and reference/edge-case/replay tests pass. All 36 required method/weight/allocation cells have published semantics and explicit evidence, or an actual user-approved scope amendment; mandatory unresolved cells block completion. Review eligibility/moderation and aggregate integrity pass, and existing features remain available.

### Part 5 — Verified NEAR testnet, integrated analytics and full-system audit

Requirements: **R28–R36**. This part stays active until the real testnet acceptance gate is satisfied.

- Implement secure expiring single-use wallet ownership challenges bound to domain and network, explicit asset/precision handling, and a replay-protected testnet treasury contract. Do not relabel USD/BDT/EUR minor units as NEAR. Keep secrets out of source/logs/browser bundles and disclose whether on-chain enforcement trusts an application signer for off-chain decisions.
- Require contract-level rejection tests for wrong signer, round, asset or recipient; over-allocation; duplicate nonce; redirected refunds; and payout before an enabled veto permits it. Contract checks enforce their committed spending conditions even when an application caller is wrong.
- Keep the existing global simulated treasury adapter on its legacy path: it currently runs inside a retryable posting transaction. Dispatch new live execution by asset/network/rule version through the durable outbox, never by replacing that global adapter with external side effects.
- Fund gas/storage through a separately accounted operating reserve. Zero platform fees must not silently deduct operating costs from participant principal. Reconcile actual on-chain custody against round liabilities and the operating reserve/storage treatment.
- Perform an actual wallet-approved testnet deposit, payout and refund. Independently query finality and receipt success, matching signer, receiver, method/actions, asset, amount, network and operation/contract identity. Save public transaction/receipt and RPC observation evidence. A compiled adapter, mock, hash alone or transaction inclusion is insufficient.
- Exercise real submission/reconciliation recovery for lost responses, duplicate callbacks, pending/failed operations and worker restart. Reconcile unknown outcomes before retry or reservation release.
- Extend the current overview-to-deep-analysis model to funds, weights, allocations, vetoes, refunds, reputation and chain observations. Preserve customization/saved views, add source drill-down/CSV and audit privacy across reports and unfinalized ballots.
- Add reusable templates with per-round snapshots, idempotent lifecycle maintenance/recovery, sensitive-action reauthentication, environment/health checks and an isolated backup/restore/recovery exercise.
- Provide an opt-in isolated 100-member, 100,000-BDT, three-scheme demonstration with sealed voting, allocation and refund paths. Demonstrate actual NEAR testnet assets separately, with no invented exchange rate and no demo-data reset.
- Close the complete mandatory requirements register with implementation, current checks, independent review and a final handoff. Optional backlog does not count as missing original scope, but mandatory unverified work cannot be deferred into a fictitious completion score.

External prerequisites are tracked early in `workflow/DEPENDENCIES.md`. Missing testnet funding, accounts, a wallet signature, an RPC prerequisite or deployment authorization keeps **Part 5** active with a named blocker. A resumed next continues Part 5; it does not create Part 6. Testnet is the target; mainnet and hosted publication are separate user actions.

## Agent system and one-part execution loop

The coordinator uses the available four-agent capacity: coordinator/root, backend/domain engineer, frontend/integration engineer and independent reviewer. Agents are created or reused for the active part and stop at its boundary. Durable briefs are in `docs/agents/`; this system creates no recurring automation or always-running background agents.

1. Read AGENTS, this plan, the requirement register and machine state. Select the eligible part once at turn start. Resume an active/blocked part. Extra next messages received while it runs do not queue another part.
2. Begin the explicit part with a run ID and expected state revision. Define interfaces and exclusive file ownership before delegation. The coordinator owns shared schema/router integration and progress state; two agents never write the same file concurrently.
3. Implement only this part and necessary prerequisite/regression fixes. Keep a small checkpoint log and requirement IDs. Update UI, business rules and persistence together; do not claim disconnected placeholders are working features.
4. Integrate, run actual predefined checks against the final source snapshot, and obtain an independent review. Fix/retest/re-review unresolved failures. A source change invalidates stale relevant completion evidence; planning prose and status updates do not masquerade as new test execution.
5. Record requirement-level acceptance references, the independent review and the required part handoff. Complete only when all mandatory part gates pass with fresh evidence and no unresolved blocker. The progress CLI validates mechanical evidence; the coordinator/reviewer judge whether it genuinely proves the requirement.
6. Stop. Report what changed, evidence, remaining scope and the next part. Wait for a fresh user next before starting it.

Use `node scripts/progress.mjs status` and `workflow/FORMAT.md` for exact commands and recovery. There is no mutating auto-next command. Explicit part/run/revision guards prevent skipping and concurrent advancement. Without a stable client message ID, identical later next messages cannot be perfectly distinguished from deliberate later requests; the one-part-per-turn and active-run rules are the safeguard.

## Common verification and preservation contract

- Use additive/versioned migrations; preserve IDs, posted ledger entries, ballots, audit trails, user data and previously published rules. No destructive demo reset and no fabricated pledges, balances, ownership, chain hashes or confirmations.
- Each part's independent review includes a preservation attestation for legacy features/history, held-fund isolation and privacy. R36 closes the overall preservation requirement in Part 5; preservation is still a gate in Parts 2–4.
- Financial amounts are exact asset units. Tests cover authorization, denominators, privacy, rounding, duplicate operations, concurrency, failed/unknown execution and full ledger reconciliation.
- Relevant unit, PostgreSQL, HTTP, browser, accessibility, typecheck/lint and full production-build checks pass. Specialized funds/election/reputation suites are added in their owning part. Required scripts cannot be marked passed merely because they have not been written yet.
- Keep database-backed tests isolated. Use the documented retained TTY database keeper. Build before production HTTP/browser checks; serialize test suites sharing port 3001 and stop a preview before rebuilding its output.
- Evidence stores actual exit codes, UTC timestamps, logs/hashes and a source fingerprint. Reviews/manual claims are labeled separately; no handwritten passed flag substitutes for an executed required check. Part 5 requires a real testnet verifier, not a screenshot claim.

Primary references, rechecked before implementation: [Glickman's Glicko-2 specification](https://www.glicko.net/glicko/glicko2.pdf) and [NEAR transaction/receipt finality documentation](https://docs.near.org/api/rpc/transactions). Use current primary documentation when implementing the relevant libraries/protocols.
