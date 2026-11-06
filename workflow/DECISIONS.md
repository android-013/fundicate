# Delivery decisions

## Confirmed by the user — 5 November 2026

1. All existing work, including the earlier two capability upgrades, is **Part 1/5**.
2. Exactly four implementation parts remain. Each fresh **next** request runs one eligible part; planning this system does not start Part 2.
3. Use agents and a persistent progress/review loop. Existing extra features stay in the project.
4. The document's **GECCO means Glicko-2**. This is resolved, not a pending ambiguity.
5. The final target is a **verified NEAR testnet flow**, with account funding/wallet approvals when needed. Integration code without actual observation is insufficient.

## Planned product defaults — publish/version before use

## Part 5 release direction — user confirmed 6 November 2026

The user requested a production-ready, plug-and-play service which can run by itself, connect to NEAR, or support another execution system. Standalone operation keeps the existing simulated ledger and requires no wallet credentials. The optional native NEAR testnet provider uses a separate, explicitly denominated custody pool bound to a final V4 governance decision, with newly accepted native request caps and source-owned refunds. It never converts historical fiat balances or changes a published electorate. Provider implementations must satisfy the typed observation/precision/idempotency contract and pass conformance checks before enablement. No unimplemented provider is advertised as available.

The prior mandatory real NEAR testnet deposit, payout, refund and independent finality gate remains. Production readiness requires actual verification and an honest deployment handoff; configuration files or simulated observations alone do not satisfy it. The user has not authorized mainnet or hosted publication. Additional release checks cover portable setup, current dependency audit, isolated restore, templates/analytics and the large fictional demo.

## Planned product defaults — publish/version before use (continued)

- New strict governance coexists with legacy profiles; do not rewrite historical public ballots, declarations, roles or votes. New PDF-conforming flows use stage-specific privacy.
- Admission/screening approval is strict majority of valid YES/NO power with quorum; removal is exact two-thirds. The source's 24-hour requirement is scheme screening, not membership admission.
- Founder/member contribution declarations are not payments. Unknown legacy amounts stay unknown. Actual verified/simulated received round funds determine financial ownership and any weighted snapshot.
- A governed administrator-removal ballot publishes an eligible successor; success transfers authority atomically. No incumbent-cooperation requirement is added as a hidden veto.
- Legacy emergency staff suspension remains available in its legacy profile. New strict-profile rules prevent unilateral membership/voter stripping as a substitute for member-governed removal.
- STAFF submissions are added beside existing MEMBERS/EVERYONE, not substituted for them.
- Part 2 can settle only supported, explicitly veto-disabled funded versions. Part 3 adds an immutable optional veto and central settlement gate. Existing decision-only rounds never acquire payment rights.
- Enabled veto lasts the full 24 hours after result/allocation publication. Rejection requires at least 90% of all frozen eligible veto power and rejects the whole round. No early payout; rejected allocations refund original contributors.
- Fees default to zero. Request caps, unfilled ranked shares, ties, unpayable recipients, zero support, collection targets, expiry and rounding/residual policy are declared in advance. Default unused funds to refunds, not hidden redistribution.
- Native/token asset IDs and precision remain explicit; no assumed FX between BDT/USD/EUR and NEAR. Refunding former members follows original ownership, not current roles.
- Every advanced engine freezes its exact specification, weighted extension and allocation transformation before enablement. Standard Glicko-2 must match the official reference case; raw ratings are not proportional money weights.
- Optional capped contribution weights are R19 backlog. They are neither mandatory original scope nor a replacement for required ordinary weighting. Additional unrelated features do not silently enlarge the four remaining parts.

These defaults are implementation specifications, not claims of existing behavior. If a later user decision changes scope, record the change with its date/affected requirements before updating the plan. Do not silently reduce acceptance to obtain a passing status.
