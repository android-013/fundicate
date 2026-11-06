# Part 4 — Complete election methods and participation-based reputation

## Run and scope

- Date: 6 November 2026 (Asia/Dhaka).
- Run: `55d8970f-1e28-4df2-8cad-0cdb79dd7ade`.
- Requirements: R20–R27; exactly Part 4 of the five-part plan.
- Final source fingerprint: `5d014afd692d8bc8d0dbcd1070893d774806eae55c477dc52117b50f7bc842a6`.
- Current receipt-set hash: `2d0755e14fad86347d1d26bba91189eb8cbf8343d00d461207cf93efbfd0f99d`.

Existing V1 decision-only rounds, V2 local funded FPTP rounds and V3 weighted/allocation/veto rounds retain their published meaning. Networking, governance, legacy proposals/treasury, saved dashboards, analytics, CSV and posted history remain available. Two additive migrations introduce V4 method ballots and reputation; no user/demo database was reset and the manual scoped winner foreign key was preserved.

## Delivered behavior

New explicitly funded V4 rounds support all six methods: FPTP, ranked IRV, multi-winner STV, batch Elo, actual Glicko-2 and forced-choice +1/-1 pairwise polling. Screening, selection and veto use independently published equal or received-contribution power, frozen at the existing cutoff. Method, seats, weights, quorum, allocation and veto configuration become immutable before collection.

[The algorithm specification](../algorithms/part-04.md) was frozen before engine implementation. Its exact public copy is readable without signing in at `/rules/fundicate-methods-v1`, linked before creating/voting in V4 rounds. The copy is included in the verification fingerprint and checked against the canonical text. Ranked ballots allow partial preferences and defined exhaustion; STV uses integer Droop quota, exact rational inclusive Gregory transfers and separate elected seats. Every tie rule and transfer event is replayable.

Elo and Glicko-2 use distinct period implementations. Glicko-2 includes rating, deviation, volatility, inactivity, bounded Illinois convergence and the official example. Its unrounded result is rating 1464.0506705393013, RD 151.51652412385727 and volatility 0.059995984286488495; the test also reproduces the paper's rounded intermediate conversion to 1464.06. Paid-frequency extensions are separately named and tested against repeated standard games. Ratings reset each round; raw ratings never become money ratios.

[All 36 required matrix cells](../../workflow/method-matrix.json) have named semantics and executed unit/full-funding scenarios. FPTP retains actual support power; advanced methods use declared nonnegative competition-rank points. All three existing exact allocators operate on those published supports. STV seats are separate from funding: nonelected schemes may receive proportional/ranked money under that explicit policy. Caps, tied/missing slots, unpayable recipients and unused principal return to original sources without silent redistribution. V4 reuses the full veto, UNKNOWN/reconciliation, immutable-plan and scoped-ledger safeguards.

Pairwise ballots cover every unordered pair, up to 1,225 comparisons for 50 candidates. The UI pages comparisons, retains answers while paging, validates completion and counts each unique voter's frozen power once. One complete immutable method ballot is stored per voter; foreign/duplicate/reversed/missing pairs and unsupported draws are rejected by both application and SQL guards. The actual 50-candidate HTTP case proves the bounded payload is accepted once. Other ballots/results/transcripts remain sealed until selection closes. The ballot is near the page top, with its power denominator and public rules links; calculation details remain available below.

[Reputation](../REPUTATION.md) supports written 1–5-star reviews for members, schemes, legacy proposals and rounds, with separate participation/presentation and receipt-backed recipient-experience dimensions. Actual completed shared participation is required; electorate-only, self, duplicate and foreign-context claims fail. A payment receipt establishes a transfer, never project delivery or investment performance. Current visible revisions supply all-review counts/averages; hidden reviews retain raw data and history without contributing to public aggregates.

Edits, abuse reports, public moderation reasons and author appeals append history. An unconflicted staff member moderates, and an appealed hiding decision requires a different unconflicted moderator for restoration. Pending veto-only participation cannot leak through review targets/eligibility. A deferred SQL constraint requires the initial written score revision atomically, and aggregates fail closed if one is missing. The composer offers the latest 30 round/proposal contexts and latest 50 bodies; older eligible contexts remain valid through the API and aggregates include all visible reviews.

## Verification evidence

Every required gate below executed against the final source, exited 0 and recorded `sourceUnchanged:true`. These are current receipts, not imported historical counts. Check/log hashes, criteria and reviewer binding are validated by the progress CLI.

| Gate | Actual evidence | Observed summary |
| --- | --- | --- |
| workflow-tests | [receipt](../../workflow/evidence/part-04/workflow-tests-3627e3bc-847f-413c-9e99-f604a4ea3845.json) · [log](../../workflow/evidence/part-04/workflow-tests-3627e3bc-847f-413c-9e99-f604a4ea3845.log) | # pass 14 |
| unit | [receipt](../../workflow/evidence/part-04/unit-9028ae92-f2cf-4eec-822f-a70629b73ac4.json) · [log](../../workflow/evidence/part-04/unit-9028ae92-f2cf-4eec-822f-a70629b73ac4.log) |  Test Files  8 passed (8);       Tests  114 passed (114) |
| typecheck | [receipt](../../workflow/evidence/part-04/typecheck-023fb2f9-0d33-4704-ba0b-60f3a3cd7a46.json) · [log](../../workflow/evidence/part-04/typecheck-023fb2f9-0d33-4704-ba0b-60f3a3cd7a46.log) | Exit 0; actual command output retained. |
| lint | [receipt](../../workflow/evidence/part-04/lint-fdf5b715-4ad5-4b09-9ba2-1bb7431b46d5.json) · [log](../../workflow/evidence/part-04/lint-fdf5b715-4ad5-4b09-9ba2-1bb7431b46d5.log) | Exit 0; actual command output retained. |
| integration | [receipt](../../workflow/evidence/part-04/integration-64511720-d02f-4f85-980a-a5ecdbb1b698.json) · [log](../../workflow/evidence/part-04/integration-64511720-d02f-4f85-980a-a5ecdbb1b698.log) | PASS analytics reject cross-community scopes and record inspection; PASS dashboard preferences and saved analyses are owned by the authenticated user; PASS analytics never combine currencies or miss events from another currency community |
| build | [receipt](../../workflow/evidence/part-04/build-96cce761-6e82-40dc-8585-1e33d8b64ba4.json) · [log](../../workflow/evidence/part-04/build-96cce761-6e82-40dc-8585-1e33d8b64ba4.log) | Exit 0; actual command output retained. |
| http | [receipt](../../workflow/evidence/part-04/http-1a917c1d-3fc3-4799-b455-8b59055e3fe3.json) · [log](../../workflow/evidence/part-04/http-1a917c1d-3fc3-4799-b455-8b59055e3fe3.log) | PASS 61 HTTP end-to-end checks: register → create communities → apply → admission vote → member draft → open → vote → approve → execute simulation → treasury/audit → logout. |
| browser | [receipt](../../workflow/evidence/part-04/browser-4d9b30cb-c2ad-465a-9340-9e0de8db9a43.json) · [log](../../workflow/evidence/part-04/browser-4d9b30cb-c2ad-465a-9340-9e0de8db9a43.log) | PASS 75 browser layout/interaction checks, no browser runtime errors. Screenshots: test-results |
| rounds | [receipt](../../workflow/evidence/part-04/rounds-5cbf17cd-ec76-40ad-be62-187d3464635f.json) · [log](../../workflow/evidence/part-04/rounds-5cbf17cd-ec76-40ad-be62-187d3464635f.log) | PASS round list, published results and existing proposal navigation render on desktop and phones; PASS 14 funding-round WCAG A/AA scans; no violations.; PASS 20 funding-round integrity, authorization, privacy, HTTP and browser checks. |
| accessibility | [receipt](../../workflow/evidence/part-04/accessibility-423b5e00-db4a-414a-bb2d-4d0b68acf35f.json) · [log](../../workflow/evidence/part-04/accessibility-423b5e00-db4a-414a-bb2d-4d0b68acf35f.log) | Exit 0; actual command output retained. |
| funds | [receipt](../../workflow/evidence/part-04/funds-57965405-3f12-4947-a8bc-6bc4c17b4acc.json) · [log](../../workflow/evidence/part-04/funds-57965405-3f12-4947-a8bc-6bc4c17b4acc.log) | PASS 8 funded-round WCAG A/AA scans; no violations.; PASS funded round UI supports real contributions, scoped receipts, settlement details and responsive accessibility; PASS 32 funded-round and governance integrity, HTTP, browser and recovery checks. |
| elections | [receipt](../../workflow/evidence/part-04/elections-a1e519bf-d5b1-40f5-ae03-26f201e9ec83.json) · [log](../../workflow/evidence/part-04/elections-a1e519bf-d5b1-40f5-ae03-26f201e9ec83.log) | PASS 4 V3 voting/veto WCAG A/AA scans; no violations.; PASS V3 browser casts sealed veto and exposes exact rules and allocation responsively without runtime errors; PASS 69 V3/V4 election/allocation/veto integrity, HTTP, browser and recovery checks. |
| reputation | [receipt](../../workflow/evidence/part-04/reputation-0ffc47cd-012a-45d4-bb7a-266f0c4e967d.json) · [log](../../workflow/evidence/part-04/reputation-0ffc47cd-012a-45d4-bb7a-266f0c4e967d.log) | PASS 4 reputation WCAG A/AA scans, no violations or browser runtime errors.; PASS 14. browser creates, edits, reports, hides, appeals and restores reviews at desktop and narrow widths; PASS 14 reputation service, SQL, HTTP, concurrency, privacy and browser checks. |

The election gate covers 69 V3/V4 service, finance, privacy, HTTP, recovery and browser checks, including all 36 complete funded cells and six real browser ballot flows; its accessibility work comprises 24 V4 and 4 preserved V3 zero-violation scans. Reputation covers 14 broad checks and 4 zero-violation scans. Current regression totals are 14 workflow tests, 114 unit tests in 8 files, 27 PostgreSQL checks, 61 HTTP checks, 20 legacy-round checks, 32 funded/governance checks and 75 existing browser checks with no runtime errors. Accessibility across elections (28), reputation (4), rounds (14), funds (8) and the existing app (30) totals 84 scans with zero violations. Representative 1280/390/320 method screenshots and 1440/390 reputation screenshots were visually inspected; all required narrow-layout overflow checks passed.

Failed/superseded receipts remain in evidence. They record the initial browser-path configuration, replay contrast/keyboard findings, overly literal browser selectors and a nonstaff creation-form fixture. The runner now uses its installed project browser, replay regions have dark-theme contrast and keyboard focus, semantic role/name selectors exercise the real controls, and creation uses staff. A build whose source changed during a final correction is explicitly nonpassing and was replaced by a fresh unchanged-source build; no failed gate was waived.

## Independent review

Independent reviewer: `/root/part04_review`. The final report uses [workflow/reviews/part-04-55d8970f.json](../../workflow/reviews/part-04-55d8970f.json) and must bind this source, all current receipts and this handoff before the workflow can close Part 4.

Review identified missing public pre-vote method details and reviewed the pending-veto participation and initial-revision integrity repairs. Those gaps are now implemented and tested. As additional **manual review evidence**, the reviewer independently exercised 6,000 deterministic equal/weighted tallies, 18,000 conserved allocation cases and 51,011 assertions, including permutation replay, per-event STV conservation, Glicko reference calculations and weighted frequency replication. Those probes are not represented as an automated workflow receipt.

## External evidence

All deposits, payouts, refunds and receipt-backed review fixtures in this part are explicitly local simulations. No real NEAR transfer, wallet signature, contract deployment or mainnet action is claimed. Part 5 retains the requirement for independently verified real NEAR testnet deposit, payout, refund and recovery evidence.

## Remaining work and next action

No mandatory Part 4 method/matrix/reputation scope is deferred. R19 capped weights remains optional backlog. After independent review and guarded workflow completion, stop and wait for a fresh user **next** to begin Part 5: real NEAR testnet operations, integrated analytics/templates/recovery and final audit. This run does not authorize automatic Part 5 work or a sixth part.
