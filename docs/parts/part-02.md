# Part 2 — Funded rounds, accounting and governance foundation

## Run and scope

Run `c2a9b142-58d8-4b5c-9e2d-4f23ce6d9c01`, 5 November 2026. This part covers R07–R14 only. The final source fingerprint and receipt-set binding are recorded by the progress CLI and independent review linked below.

Final source fingerprint: `c625c2f0b453324f67ef53b91857527f1081fd546d44045a919dd488413b3be0`.

Existing communities retain the LEGACY governance profile. Existing V1 funding rounds remain equal-weight, decision-only rounds; no payment authority is added to them. Existing proposals, posted ledger entries, networking, dashboards, analytics, saved views and exports are preserved. Migrations are additive; the demo database is never reset for tests.

## Delivered behavior

New strict-profile communities collect a real founder declaration, introduction and answers. Approved applications record actual prospective member declarations. Unknown legacy pledges remain unknown until the member explicitly declares one; declarations do not credit either treasury or round funds. Declarations are once-only, replay-safe and audited. Returning members retain the original declaration and timestamp; their new application separately records a pledge meeting the current minimum.

Strict admissions require a member ballot. Removal uses exact two-thirds of valid YES/NO votes and published quorum. Active members may publish removal ballots, including administrator removal with a named eligible successor. Authority transfers and incumbent removal commit together; direct transfer and successor departure/removal are locked during an open succession ballot. Staff cannot cancel open strict ballots or unilaterally suspend strict members. Legacy review, emergency suspension review and administrator transfer remain available in their original profile.

Round creators choose STAFF, MEMBERS or EVERYONE scheme submissions. Server checks enforce roles. Funded requests publish donation, crowdfunding or investment-request categories and a recipient label.

V2 funded rounds explicitly opt into the only executable profile in this part: equal-weight screening and FPTP selection, winner-all allocation, veto disabled, zero fees, local simulated fiat with two decimal places. Unsupported methods, weights, veto settings and asset overrides are rejected. Asset, target, caps, cutoff, expiry and supported rules are immutable before any deposits. V1 accepts no funding settings and can never acquire a settlement.

Round money lives in separate RoundAccount/RoundLedgerTransaction tables, never in legacy spendable TREASURY. Received deposits have balanced entries, an immutable original owner/source and owner-bound idempotency keys. First deposits meet the published minimum; positive top-ups cannot exceed a contributor's cumulative maximum. Collection ends at the published cutoff. The immutable contribution snapshot uses received minor units, not declarations.

Election and financial states are independent. A unique winner receives the smaller of the requested amount and received pool. Residuals return pro rata to original sources using deterministic largest-remainder rounding. Ties, missed quorum, no qualified schemes, failed targets and unpayable recipients refund original contributors. An original contributor can recover an unprepared expired pool even after leaving or removal. Expiry never replaces a previously queued allocation plan.

Preparation locks durable payout/refund intents and reserves the complete pool. Processing commits one local operation at a time, retaining unique identities, attempt records and receipts. A new worker resumes the same plan after an earlier process exits. Failed local operations retain their intent and retry without duplicate money effects. No external adapter is invoked inside retryable database transactions.

PostgreSQL enforces append-only financial history, matching original deposit receipts, scoped balanced entries, account balances, conservation counters, immutable financial rules/snapshots/intents, once-only declarations and published proposal snapshots. Source and migration paths: `src/lib/funded-rounds.ts`, `src/lib/funds-core.ts`, `src/lib/service.ts`, `src/lib/rounds.ts`, and migrations `20261105010000_funded_rounds`, `20261105020000_round_receipt_guard`, `20261105030000_returning_declarations`.

The UI provides a simple received/held/reserved/paid/refunded overview, own deposit receipts and refunds, visible veto-disabled rules, detailed funding policy, operation attempts and local receipt IDs. Draft finance data is staff-only. Existing responsive blockchain-themed design is retained.

## Verification evidence

All 11 required gates passed on the final source above, with unchanged-source receipts and retained actual logs. Current and historical evidence is preserved under `workflow/evidence/part-02/`; failed attempts remain in the history.

| Gate | Actual result | Current receipt |
| --- | --- | --- |
| workflow-tests | 13 passed | `workflow-tests-c4d4e7f2-239f-4b3c-9192-2ed68adcd28a.json` |
| unit | 47 passed across 5 files | `unit-4217efb2-e6b8-49d7-baab-d5b2a76b3a0b.json` |
| typecheck | Passed | `typecheck-c45612ff-3bed-44a6-88b3-8353ec2a5815.json` |
| lint | Passed | `lint-06848162-ef6a-4c31-a75d-cc99cc48d4b5.json` |
| integration | 27 PostgreSQL checks passed | `integration-6db551d8-9bf8-44b7-af2b-2fc836121fd1.json` |
| build | Prisma generation, TypeScript, compile and static generation passed | `build-e52bca16-3449-472d-8b67-144afa3b654a.json` |
| http | 61 checks passed | `http-9c690ca1-fab6-4115-858a-237e3d3a459d.json` |
| browser | 75 layout/interaction checks passed; no runtime errors | `browser-255a73dc-3b6b-429c-9e2d-c31fb951f435.json` |
| rounds | 20 checks and 14 zero-violation axe scans passed | `rounds-dd1b841e-8466-48a0-b54d-f710f4451b10.json` |
| accessibility | 30 general-app axe scans; zero violations | `accessibility-15043a5b-d35c-4e95-bfb2-c40cea15ef39.json` |
| funds | 32 checks and 8 zero-violation axe scans passed | `funds-6c13997b-6aaa-4ffc-9f37-81d8999b776d.json` |

The funds suite exercises strict governance, all submission policies, full funded elections, exact conservation, concurrent/replayed deposits and settlement, a separate-process recovery worker, durable failure/retry, expiry before and after decision, unpayable recipients, SQL bypass attempts, HTTP authorization, browser deposits, strict founder creation and prospective pledge declaration. The rejoin case preserves the original declaration while requiring a current-minimum application. General, round and funded accessibility suites total 52 executed scans.

Visual evidence: `test-results/fundicate-funds-collecting-1440.png`, `fundicate-funds-collecting-390.png`, `fundicate-funds-settled-1440.png`, `fundicate-funds-settled-390.png`; machine-readable funded scans are in `.local/funds-accessibility.json`. Coordinator and independent reviewer inspected the desktop/mobile layouts. Preview and isolated test servers were serialized for the final verification. A prior un-reproduced navigation failure remains in historical logs; diagnostic URL/status/body capture is retained in the test. No product timeout defect or load-test claim is inferred from it.

## Independent review

Reviewer: `/root/part02_review`. Final report path: `workflow/reviews/part-02-c2a9b142.json`. The report records the independent verdict and binds this handoff to the final source and receipt set.

Review findings repaired before acceptance: V1 silently accepting unused future settings; insufficient visible veto-disabled publication; misleading failed-funding result heading; and a forged contribution row referencing a non-deposit transaction. Review also required explicit unpayable-recipient and decided-before-expiry recovery coverage. The coordinator and reviewer aligned returning-declaration validation, and browser verification corrected the governance selector's accessible name. The reviewer independently exercised 2,000 deterministic randomized allocation cases without changing product source. Final approval requires no unresolved material finding.

## External evidence

This part moves no real money and claims no blockchain observations. NEAR testnet funding, wallet approvals, deposits, payouts, refunds and receipt/finality verification remain mandatory Part 5 work.

## Remaining work and next action

No Part 2 implementation remains. The progress CLI and linked review control formal closure. Stop after this part and wait for a fresh user `next`. Part 3 adds paid-contribution voting weights, allocation policies and rejection veto under a new immutable rules version; published V2 snapshots must retain their meaning. None of those future settings is enabled prematurely by this part.
