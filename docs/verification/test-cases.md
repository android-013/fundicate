# Passed test cases and receipts

[Verification overview](README.md) · [Documentation home](../README.md)

These results identify the suites, reported case labels and individual receipt files for the verified standalone source. Where a runner reports an aggregate, its source link gives the assertions exercised by that suite.

Financial cases use simulated balances and fictional payment records. In the recorded check labels, a received contribution means a posted simulated deposit with a ledger receipt.

## Unit tests

The unit runner passed 200 tests in the following 16 files. The files contain the complete case definitions.

- [analytics.test.ts](../../tests/analytics.test.ts)
- [build-artifacts.test.ts](../../tests/build-artifacts.test.ts)
- [chain-core.test.ts](../../tests/chain-core.test.ts)
- [elections-core.test.ts](../../tests/elections-core.test.ts)
- [funds-core.test.ts](../../tests/funds-core.test.ts)
- [governance-profile.test.ts](../../tests/governance-profile.test.ts)
- [governance.test.ts](../../tests/governance.test.ts)
- [http-security.test.ts](../../tests/http-security.test.ts)
- [methods-core.test.ts](../../tests/methods-core.test.ts)
- [payment-records.test.ts](../../tests/payment-records.test.ts)
- [release-analytics.test.ts](../../tests/release-analytics.test.ts)
- [reputation-core.test.ts](../../tests/reputation-core.test.ts)
- [round-templates.test.ts](../../tests/round-templates.test.ts)
- [rounds-core.test.ts](../../tests/rounds-core.test.ts)
- [runtime-config.test.ts](../../tests/runtime-config.test.ts)
- [wallet-core.test.ts](../../tests/wallet-core.test.ts)

## HTTP end-to-end

The [HTTP suite](../../tests/e2e.ts) passed 61 checks. It exercised registration, login, community creation, applications, admission, role checks, draft and open proposals, frozen ballots, finalization, separate simulated execution, receipts, treasury and audit views, analytics, session and logout behavior.

## Browser checks

The [browser suite](../../tests/browser-qa.ts) passed 75 layout and interaction checks. It covers public and signed-in navigation, responsive widths, dashboard customization, analytics and drill-downs, source records, CSV downloads, filtering and the community workflows defined in the runner.

## Accessibility routes and states

All 30 entries in the [accessibility runner](../../tests/accessibility.ts) reported an empty violations list. The paths below use `<record-id>` for fixture record IDs.

1. `/`
2. `/login`
3. `/register`
4. `/dashboard`
5. `/explore`
6. `/communities/new`
7. `/communities/campus-collective`
8. `/communities/campus-collective/treasury`
9. `/communities/campus-collective/members`
10. `/communities/campus-collective/proposals`
11. `/communities/campus-collective/proposals/new`
12. `/communities/campus-collective/governance`
13. `/communities/campus-collective/activity`
14. `/settings/profile`
15. `/settings/security`
16. `/analytics`
17. `/analytics/treasury`
18. `/analytics/governance`
19. `/analytics/network`
20. `/analytics/personal`
21. `/analytics/records`
22. `/communities/campus-collective/proposals/<record-id>`
23. `/ (mobile)`
24. `/dashboard (mobile)`
25. `/explore (mobile)`
26. `/communities/campus-collective/treasury (mobile)`
27. `/analytics (mobile)`
28. `/analytics/treasury (mobile)`
29. `/analytics/network (mobile)`
30. `/analytics/records (mobile)`

## Delivery workflow

[progress-workflow.test.mjs](../../tests/progress-workflow.test.mjs)

- init accepts only historical Part 1 and leaves Part 2 waiting
- explicit next part, revision and run ID prevent skips or replacement
- completion and criterion acceptance cannot invent missing check results
- checks execute predefined Node argument arrays and retain actual failing exits
- source edits invalidate previously executed checks and review
- published method rules are part of the verified source snapshot
- no completion without criterion evidence, handoff and independent review
- review binds the handoff and actual receipt set, not just a passed flag
- unresolved input blocks completion and resolves within the same active part
- short exclusive lock refuses competing mutation without changing state
- journal detects tampering and can explicitly repair a stale projection
- evidence paths cannot escape the project
- each explicit completion advances once and Part 5 never creates Part 6
- concurrent checks serialize while actual execution runs outside the write lock

## Operations security

[operations-security.test.mjs](../../tests/operations-security.test.mjs)

- connection parsing rejects authority overrides and duplicate TLS query values
- bootstrap refuses unsafe legacy query credentials without changing the saved configuration
- bootstrap preserves valid quoted legacy credentials and transport parameters
- backup exclusively reserves private archive and manifest before database work
- existing archive or manifest is preserved before any connection
- archive path replacement cannot redirect dump writes or publish a false success
- failed dumps retain private partial files without a valid success manifest
- restore consumes the same opened archive bytes that passed checksum verification
- restore rejects checksum mismatch before creating or connecting to a recovery database

## PostgreSQL integration

[integration.ts](../../tests/integration.ts)

- password hashing and authentication
- session expiration and revocation
- persistent authentication rate limit
- membership requires a recorded majority decision
- moderator cannot appoint moderators or transfer authority
- community-scoped authorization and member/staff separation
- one vote per eligible member and no outsider ballots
- cannot finalize a partial ballot before its deadline
- voter snapshots do not expand after admission
- votes and audit events are database-immutable
- votes are rejected after the closing time
- administrator cannot leave or lose active membership
- contribution idempotency and balanced ledger
- cross-community proposal IDs cannot be used
- concurrent spending is atomic and rejects overspending
- duplicate payout execution returns one receipt
- database rejects balance drift and unbalanced financial records
- removal requires two-thirds and retains financial history
- secure administrator transfer preserves exactly one administrator
- every account reconciles and audit trail exists
- administrator membership cannot be deleted directly
- emergency suspension opens a mandatory community review
- governance changes affect future admission and submission policy
- analytics reconcile to the immutable ledger
- analytics reject cross-community scopes and record inspection
- dashboard preferences and saved analyses are owned by the authenticated user
- analytics never combine currencies or miss events from another currency community

## Application security

[security.ts](../../tests/security.ts)

- 1: all retired chain and wallet APIs fail closed without credentials or network
- 2: CSRF, JSON shape/media and hostile nesting rejected before mutations
- 3: SQL-looking identities cannot escape schemas or disclose SQL/server detail
- 4: limiter thresholds remain atomic under concurrency, expire and return retry time
- 5: case-cycling the same email cannot bypass auth quota; 429 contains Retry-After
- 6: expired/revoked sessions and cross-user session revocations fail safely
- 7: legacy suspension requires recent authentication and strict governance remains member-controlled
- 8: unexpected database failures expose a generic response and opaque request ID
- runtime preflight refuses SUPERUSER without mutation
- runtime preflight refuses CREATEDB without mutation
- runtime preflight refuses CREATEROLE without mutation
- runtime preflight refuses REPLICATION without mutation
- runtime preflight refuses BYPASSRLS without mutation
- runtime preflight refuses outgoing membership without mutation
- runtime preflight refuses incoming membership without mutation
- runtime preflight refuses database ownership without mutation
- runtime preflight refuses schema ownership without mutation
- runtime preflight refuses table ownership without mutation
- runtime preflight refuses function ownership without mutation
- runtime preflight refuses direct SECURITY DEFINER execution without mutation
- runtime preflight refuses PUBLIC SECURITY DEFINER execution without mutation
- runtime preflight refuses custom pg_catalog SECURITY DEFINER execution without mutation
- runtime preflight refuses custom information_schema SECURITY DEFINER execution without mutation
- runtime preflight refuses custom pg_catalog native routine execution without mutation
- runtime preflight refuses custom public native routine execution without mutation
- runtime preflight refuses direct restricted native-function execution without mutation
- runtime preflight refuses type ownership without mutation
- runtime preflight refuses schema CREATE without mutation
- runtime preflight refuses database CREATE without mutation
- runtime preflight refuses PUBLIC restricted native-function execution without mutation
- runtime preflight refuses TRUNCATE without mutation
- runtime preflight refuses TRIGGER without mutation
- runtime preflight refuses REFERENCES without mutation
- runtime preflight refuses MAINTAIN without mutation
- runtime preflight refuses grant option without mutation
- runtime preflight refuses inherited PUBLIC definer execution before creating a missing role
- 9: runtime preflight refuses unsafe reused identities before migrations or role changes
- 10: runtime preflight protects an identity used by another disposable database
- 11: fresh and safe reused runtime roles retain only intended table privileges and read-only migration evidence
- 12: health fails closed when the payment clock migration is incomplete

## Funding-round lifecycle

[rounds.ts](../../tests/rounds.ts)

- staff-only creation, same-origin protection and validated immutable configuration
- new-round page requires sign-in and submission deadlines cannot be bypassed
- public scheme submission supports non-members without granting voting membership
- published rules, scheme content and staff cancellation are locked
- submission policies, caps and cross-community identifiers are enforced
- screening freezes the electorate and rejects non-staff stage changes
- screening privacy includes anonymous views, other members and public audit details
- duplicate, ineligible, late-member and cross-round screening votes fail
- screening ballots and voter snapshots are immutable in PostgreSQL
- suspended voters cannot vote and restored frozen members can continue
- screening and selection are separate elections; ties fail strict screening majority
- selection preserves secrecy, one ballot per voter and frozen eligibility
- tied selection publishes ballots and leaves the treasury unchanged
- unique FPTP winner is final without creating a payment or legacy proposal
- deadline boundaries reject late ballots and no-quorum selection picks no winner
- empty rounds and rejected schemes conclude without a winner
- browser creates and opens a round, then submits a scheme
- browser records a sealed screening ballot and shows only the voter’s own choice
- browser records a selection while keeping other selection ballots hidden
- round list, published results and existing proposal navigation render on desktop and phones
- 14 funding-round WCAG A/AA scans; no violations.

## Funded rounds and governance

[funds.ts](../../tests/funds.ts) · [governance-profile.ts](../../tests/governance-profile.ts)

- STAFF, MEMBERS and EVERYONE schemes enforce roles and funded categories on the server
- V1 remains decision-only and cannot gain payment rights
- new funding rejects unsupported settings, asset overrides and invalid cutoff/expiry bounds
- draft funding metadata is private and published rules/assets cannot be rewritten
- contributions enforce active ownership, first-deposit minimum, cumulative cap and positive top-ups
- concurrent duplicate deposits have one effect and late replay preserves the original receipt
- a complete FPTP funded round caps its winner and refunds exact unused principal
- held round money is physically absent from legacy spendable TREASURY accounts
- unpayable winning recipients return the complete original pool
- expiry refunds a decided but still unprepared winning round
- failed targets queue full refunds without giving the election payment authority
- empty and rejected-scheme rounds refund every original contribution
- selection ties and missing quorum refund the entire pool without arbitrary winners
- zero-received failed targets close safely without zero-value operations
- an original contributor recovers expired unresolved funds after leaving, with no redirection
- a failed local execution durably records failure and retries the same immutable operation once
- database integrity blocks source changes, invalid balances and rewrites of receipts, operations and attempts
- funding HTTP requires authentication, same origin, strict payloads, active membership and unique keys
- strict creation requires the founder's own declaration, introduction and matching answers
- strict founder bootstrap records actual pledge and answers without inventing a ballot or funds
- legacy defaults preserve unknown founder declarations and avoid fabricated historical applications
- unknown legacy declarations are prospective, minimum-bound, immutable and idempotent
- strict admission denies both unilateral staff decisions and stores the actual approved pledge
- database guards preserve profile and declarations and require honest strict activation
- strict governance rejects REVIEW changes, emergency voter suspension and published ballot cancellation
- strict removal remains available to ordinary members when other member submissions are disabled
- a member facing an open removal cannot become the published administrator successor
- published strict succession freezes nominee and incumbent authority while allowing member control
- exact two-thirds member approval atomically removes the administrator and installs the published successor
- legacy REVIEW, emergency suspension and direct authority transfer remain available
- returning strict members retain their original declaration while the new application meets the current minimum
- 8 funded-round WCAG A/AA scans; no violations.
- funded round UI supports real contributions, scoped receipts, settlement details and responsive accessibility

## V3 and V4 elections

[elections.ts](../../tests/elections.ts) · [elections-finance.ts](../../tests/elections-finance.ts) · [methods.ts](../../tests/methods.ts) · [methods-browser.ts](../../tests/methods-browser.ts)

- V3 independently configures stage power, weighted approval and sealed stage results
- post-cutoff departures and role changes preserve frozen power and ballot rights
- pre-cutoff membership tracking rejects zero paid-power elections and preserves refunds
- a zero-paid moderator can screen equally but cannot gain contribution selection power
- veto uses all frozen power, stays sealed and rejects exactly 90 percent only after 24 hours
- equal veto counts nonvoters in its denominator and cannot close early when everyone votes
- V3 proportional caps preserve cents and original-source refunds across worker restart and expiry
- V3 WINNER_ALL with EQUAL selection settles the exact published plan and replays safely
- V3 WINNER_ALL with CONTRIBUTION selection settles the exact published plan and replays safely
- V3 PROPORTIONAL with EQUAL selection settles the exact published plan and replays safely
- V3 PROPORTIONAL with CONTRIBUTION selection settles the exact published plan and replays safely
- V3 RANKED_CUTS with EQUAL selection settles the exact published plan and replays safely
- V3 RANKED_CUTS with CONTRIBUTION selection settles the exact published plan and replays safely
- V3 ranked cuts refund capped, tied, and empty positions without shifting entitlements
- V3 proportional unpayable share and winner-all top ties refund without arbitrary awards
- V3 exact 90-percent rejection waits 24 hours across prepare, process, SQL bypass, and expiry
- V3 89-percent rejection includes abstaining and nonvoting power in the denominator
- UNKNOWN blocks the entire plan until local non-posting proof records a durable same-intent retry
- V3 atomic posting failures append durable attempts before retrying the same operation
- V3 failed target freezes without queueing until the immutable decision is published
- V3 unresolved expiry can queue, process and replay original-source full refunds with either target outcome
- V4 paid Elo large cyclic tie refunds original sources instead of inventing a payout winner
- V4 public reads preserve an immutable historical result after an engine calculation repair
- V4 FPTP-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FPTP-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FPTP-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FPTP-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FPTP-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FPTP-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 IRV-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 STV-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ELO-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 GLICKO_2-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-EQUAL-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-EQUAL-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-EQUAL-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-CONTRIBUTION-WINNER_ALL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-CONTRIBUTION-PROPORTIONAL: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 FORCED_PAIRWISE-CONTRIBUTION-RANKED_CUTS: full funded matrix, sealed ballot, exact allocation and immutable concurrent replay
- V4 ranked/pairwise HTTP and SQL reject duplicate, missing, reversed, foreign, wrong-method and ineligible ballots
- V4 Glicko-2 enabled veto blocks every early transfer and refunds exact original sources after unanimous rejection
- V4 paid voter rights stay frozen after departure and late membership grants no selection power
- V4 actual 50-candidate HTTP ballot records all 1,225 comparisons once and stays sealed until selection closes
- V4 FPTP complete browser ballot, sealed/revealed boundaries and responsive accessibility
- V4 IRV complete browser ballot, sealed/revealed boundaries and responsive accessibility
- V4 STV complete browser ballot, sealed/revealed boundaries and responsive accessibility
- V4 ELO complete browser ballot, sealed/revealed boundaries and responsive accessibility
- V4 GLICKO_2 complete browser ballot, sealed/revealed boundaries and responsive accessibility
- V4 FORCED_PAIRWISE complete browser ballot, sealed/revealed boundaries and responsive accessibility
- 24 V4 method WCAG A/AA scans, all six browser ballots, no runtime errors.
- veto HTTP enforces authentication, origin, strict input, eligibility and one immutable ballot
- 4 V3 voting/veto WCAG A/AA scans; no violations.
- V3 browser casts sealed veto and exposes exact rules and allocation responsively without runtime errors

## Reputation

[reputation.ts](../../tests/reputation.ts)

- 1. all four target types retain written 1–5-star reviews and separate dimensions
- 2. actual same-context participation defeats self, electorate-only, foreign and duplicate reviews
- 3. concurrent duplicate creation has one effect and concurrent edits append ordered revisions
- 4. latest visible revision counts once and historical bodies remain author/staff only
- 5. moderation requires reason and unconflicted authority; hidden bodies and stars leave public aggregates
- 6. abuse reports are scoped, reasoned, once-only and private to staff
- 7. hidden edits retain visibility; appeals need latest decision and a different unconflicted moderator
- 8. later hiding decisions preserve earlier appeals and require their own appeal identity
- 9. SQL guards reject immutable history rewrites, invalid scores, forged context and conflicting moderation
- 10. recipient experience requires matching confirmed payment and stays distinct from presentation
- 11. pending veto-only participation never appears in review options or eligibility
- 12. a completed V4 method ballot alone establishes actual participation without revealing its choice
- 13. HTTP requires authentication, same origin, strict schemas and correct community scope
- 4 reputation WCAG A/AA scans, no violations or browser runtime errors.
- 14. browser creates, edits, reports, hides, appeals and restores reviews at desktop and narrow widths

## Release insights and templates

[release-analytics.ts](../../tests/release-analytics.ts) · [maintenance.ts](../../tests/maintenance.ts)

- 1. staff save complete versioned source rules without ballots or financial history
- 2. ordinary members and foreign source rounds cannot edit a community template
- 3. concurrent staff edits append ordered immutable revisions
- 4. direct SQL cannot rewrite or delete an immutable template revision
- 5. instantiating an earlier revision makes a fresh unfunded draft bound atomically to that revision
- 6. stale shifted collection cutoffs fail before any draft is committed
- 7. template API preserves same-origin, sign-in and community staff boundaries
- 8. template library supports active member inspection but denies foreign memberships
- 9. draft and cancelled sources stay staff-only in report cohorts, totals and CSV, with roles checked per community
- 10. current asset totals reconcile exact received, held, reserved, paid and source refunds
- 11. system report and CSV expose no open-context participation, voter IDs or raw ballots
- 12. scope filters reject unauthorized communities and show complete cohorts only
- 13. external-payment snapshots aggregate exact unverified records, preserve reversals and currency scope without changing simulated money
- 14. visible reputation aggregate uses latest real scores and removes hidden reviews without leaking text
- 15. scoped CSV endpoints enforce membership, repeated-filter rejection and private caching
- 16. pending veto participation and published selection details stay absent from system analysis and CSV
- release-accessibility 6 zero-violation scans
- 17. browser template creation, instantiation and system drill-down work at desktop,390 and320 with zero accessibility violations
- 18. archive is idempotent, preserves old snapshots and prevents new instantiation
- 19. real maintenance dry-run reports the due stage and leaves all round state unchanged
- 20. real maintenance cannot act under a nonstaff member or foreign administrator
- 21. real maintenance applies a due published stage once and repeat execution adds no duplicate history
- 22. real maintenance preserves the full 24-hour veto despite a decided winner and every voter keeping the result

## External payment records

[payment-records.ts](../../tests/payment-records.ts) · [payment-records-browser.ts](../../tests/payment-records-browser.ts)

- 1. only active community staff can record external payments
- 2. replayed references require every original detail and recorder identity
- 3. concurrent replays create exactly one attributable record and one audit
- 4. currency, future dates, foreign rounds and foreign counterparties are rejected
- 5. SQL-like free text is inert data while SQL-like IDs fail validation
- 6. payment details are restricted to active members and never enter public audit details
- 7. a correction appends one full reversal and preserves original records
- 8. SQL guards prohibit rewriting, deleting or cross-scope payment history
- 9. insert clocks remain valid after transaction delays and across session timezones without admitting future dates
- 10. tracking cannot create money, rewrite voting weights or settle historical decisions
- 11. paginated records are bounded and every page/filter boundary is validated
- 12. payment APIs enforce session, origin, strict inputs and recent-authentication boundaries
- 13. multi-page payment history returns complete nonoverlapping pages and full-cohort totals
- 14. payment CSV rejects unauthorized and ambiguous filters and exports only the exact private page with spreadsheet-safe attestations
- 15. payment audit identities remain member-only across public feeds and scoped analytics
- 16. browser records an external payment as a staff attestation without executing a transfer
- 17. CSV downloads require a deliberate click and deliver the recorded page without speculative export requests
- 18. payment records remain usable and accessible at desktop, 390px and 320px
- 19. browser corrections append a reversal and retain the original record
- 20. members can inspect history but receive no recording or correction controls
- 21. foreign and anonymous visitors cannot inspect external payment records

## Toolchain, recovery and demonstrations

- [TypeScript](../../tsconfig.json) and [ESLint](../../eslint.config.mjs) completed their recorded checks.
- [Build](../../scripts/build.mjs) generated the standalone package with its static assets. Native artifact smoke runs then verified packaged routes and dependency resolution.
- [Recovery exercise](../../scripts/recovery-exercise.mjs) used real PostgreSQL snapshot and restore tooling to verify 50 public tables and five financial invariants.
- [Large demonstration](../../scripts/demo-large.mjs) ran the isolated 100-member scenario and preserved the configured application database.
- [Dependency audit](../../scripts/dependency-audit.mjs) completed against the configured registry and the resolved dependency set.
- [Secret scan](../../scripts/security-scan.mjs) checked tracked source, browser assets and packaged server files. The receipt recorded zero configured secret matches.

## Receipt index

The local evidence directory is `.local/security-audits/20261110-f63dc98b-98d7-46a5-8f7d-a7d1365864e5/`. `state.json` associates each check with its receipt hash. Each receipt identifies the command, log hash, source fingerprint and exit status.

**Source fingerprint** `7bb7b5f66b6b7ed5f4307fbdca7c6af25ea38a1963ed29c9fb54bd5fc6de6652`

**Receipt-set fingerprint** `70bffb34a20f100fb37f123877209f0261186b061c4e5e0507773d9f2ea679c8`

| Check | Receipt | Log |
| --- | --- | --- |
| workflow-tests | `workflow-tests-ff534749-2c3e-4c5d-b96e-49c1eac82358.json` | `workflow-tests-ff534749-2c3e-4c5d-b96e-49c1eac82358.log` |
| unit | `unit-54212e51-74ec-4987-8173-161209b4a253.json` | `unit-54212e51-74ec-4987-8173-161209b4a253.log` |
| typecheck | `typecheck-9eb37fc7-564d-43fb-aaf7-0255fb6a29c8.json` | `typecheck-9eb37fc7-564d-43fb-aaf7-0255fb6a29c8.log` |
| lint | `lint-591c9709-605a-406f-9767-54e8c24aec35.json` | `lint-591c9709-605a-406f-9767-54e8c24aec35.log` |
| build | `build-cbe4720c-8dc7-4f39-b254-87ee0322104e.json` | `build-cbe4720c-8dc7-4f39-b254-87ee0322104e.log` |
| integration | `integration-cb4b4214-a5c7-4d60-9aee-a98102e69baf.json` | `integration-cb4b4214-a5c7-4d60-9aee-a98102e69baf.log` |
| http | `http-150c19b3-c015-41f1-ba3b-28434030ab06.json` | `http-150c19b3-c015-41f1-ba3b-28434030ab06.log` |
| security | `security-ee8fe255-e233-4258-ad1d-39214d31cd5b.json` | `security-ee8fe255-e233-4258-ad1d-39214d31cd5b.log` |
| rounds | `rounds-c13d2475-4060-4d0a-b6b7-f5db609b670f.json` | `rounds-c13d2475-4060-4d0a-b6b7-f5db609b670f.log` |
| funds | `funds-0e3c8176-ab02-40d6-a235-1d7b687c16c3.json` | `funds-0e3c8176-ab02-40d6-a235-1d7b687c16c3.log` |
| elections | `elections-755f3f9d-f286-4ce8-9a43-bfaf1600d8fd.json` | `elections-755f3f9d-f286-4ce8-9a43-bfaf1600d8fd.log` |
| reputation | `reputation-f9245eb6-79f9-4e0c-871c-c8da071fb54c.json` | `reputation-f9245eb6-79f9-4e0c-871c-c8da071fb54c.log` |
| release | `release-77f0a174-9f0f-4d87-a006-bc6f1cc43ab7.json` | `release-77f0a174-9f0f-4d87-a006-bc6f1cc43ab7.log` |
| payment-records | `payment-records-3eea471e-c206-4b51-84a0-f81982e53517.json` | `payment-records-3eea471e-c206-4b51-84a0-f81982e53517.log` |
| recovery | `recovery-a8198797-2ffc-4dc5-ab7d-1f50a75328bf.json` | `recovery-a8198797-2ffc-4dc5-ab7d-1f50a75328bf.log` |
| large-demo | `large-demo-ea3d752a-946b-4127-b919-646103f23438.json` | `large-demo-ea3d752a-946b-4127-b919-646103f23438.log` |
| dependency-audit | `dependency-audit-5b7fc798-c3f1-4141-815f-6471c023d6dd.json` | `dependency-audit-5b7fc798-c3f1-4141-815f-6471c023d6dd.log` |
| secret-scan | `secret-scan-bbd85d0e-1e0b-4a38-a9fc-ed048765726e.json` | `secret-scan-bbd85d0e-1e0b-4a38-a9fc-ed048765726e.log` |
| browser | `browser-e3c82d96-d5fc-43d8-9126-2f12f7994fd2.json` | `browser-e3c82d96-d5fc-43d8-9126-2f12f7994fd2.log` |
| accessibility | `accessibility-0520603e-503b-475d-a093-e28cc5a5d903.json` | `accessibility-0520603e-503b-475d-a093-e28cc5a5d903.log` |
| operations-security | `operations-security-9411fbcc-7f61-4a29-bef0-8ee0c04746c1.json` | `operations-security-9411fbcc-7f61-4a29-bef0-8ee0c04746c1.log` |

The same evidence directory contains `native-qa-1794393848264-6545ae20.json`, `native-package-1794393904824.json`, `reputation-250c2caf-2438-4e70-82b5-c11b794fc01d.json`, `containers/36d4bce313-smoke-result.json` and `containers/public-evidence-index-20261111T064841Z.json`. The [dated verification record](../security/post-release-audit-20261111.md) describes their scope. The [delivery archive](../README.md#delivery-and-historical-records) links the original verification and part handoffs.
