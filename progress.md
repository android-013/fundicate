<!-- delivery-status:start -->
Current delivery: 4/5 parts complete. This is milestone count, not PDF feature coverage.

State: needs_input. Next eligible part: 5. Revision: 198.

| Part | Scope | Status |
| --- | --- | --- |
| 1/5 | Existing application and first capability upgrades | complete |
| 2/5 | Funded rounds, accounting and governance foundation | complete |
| 3/5 | Weighted governance, allocation policies and rejection veto | complete |
| 4/5 | Complete election methods and participation-based reputation | complete |
| 5/5 | Verified NEAR testnet, integrated analytics and full-system audit | needs_input |

Active run: 72fba785-3bf0-4f38-a257-558a5455442f; part 5. Resume it before advancing.
<!-- delivery-status:end -->

The canonical plan is `docs/MASTER-PLAN.md`; machine state is `workflow/state.json`. All work recorded below is historical **Part 1/5**, including the earlier capability phases 1–2. The historical 100% labels describe that earlier scope, not the full PDF or this new five-part program. Milestone count and feature coverage are different measurements.

## Historical Part 1 implementation log

## Phase 1 — Architecture · 100%

- [x] Inspect repository, README, installed runtime and local database tools.
- [x] Establish Next.js App Router, TypeScript, PostgreSQL, Prisma architecture.
- [x] Identify simulation boundary and project-local database setup.

## Phase 2 — Database and authentication · 100%

- [x] Normalized schema, constraints, migration, deterministic seed.
- [x] Password hashing, sessions, registration, login, logout, rate limits.
- [x] Profile and session revocation.

## Phase 3 — Communities and membership · 100%

- [x] Discovery, community creation, community-scoped RBAC.
- [x] Applications, admission votes, removal votes, suspension review.
- [x] Moderator assignment and explicit administrator transfer.

## Phase 4 — Governance · 100%

- [x] Eligibility snapshots, immutable votes, quorum, thresholds, deadlines.
- [x] Proposal lifecycle, membership and governance decisions.

## Phase 5 — Treasury · 100%

- [x] Balanced immutable ledger, contributions, atomic execution.
- [x] Overspending/replay protection and adapter interface.

## Phase 6 — Interface · 100%

- [x] All required public, dashboard, community and settings pages.
- [x] Connected forms, responsive layouts, errors, empty and loading states.
- [x] Complete desktop and mobile browser review; 40 checks pass with no runtime errors or horizontal overflow.
- [x] Optional HTTPS avatar display with an initials fallback.

## Phase 7 — Audit and polish · 100%

- [x] Immutable audit events and notifications.
- [x] Accessibility, mobile navigation and responsive review; 20 axe scans report no WCAG A/AA violations.
- [x] Contrast, accessible account link names and keyboard access to scrolling tables.

## Phase 8 — Verification and documentation · 100%

- [x] Two migrations applied, demo seeded, and repeat setup preserves data.
- [x] Database restart preserves both communities, eight users and balanced ledger records; interactive keeper shutdown completes cleanly.
- [x] 13 unit tests and 23 real PostgreSQL integrity/security checks pass.
- [x] 43 HTTP end-to-end checks and 40 browser checks pass.
- [x] 20 desktop/mobile accessibility scans report no violations.
- [x] Lint, TypeScript, full production build and production dependency audit pass.
- [x] README, reproducible demo, verification report and NEAR integration guide.

## Phase 9 — Blockchain-inspired workspace · 100%

- [x] Indigo, violet and cyan design system, connected-node identity and responsive navigation.
- [x] Redesigned landing, authentication, dashboard and shared community interface.
- [x] Clear networking, voting and growth entry points; existing governance/treasury flows retained.

## Phase 10 — Simple overview and deep analytics · 100%

- [x] Six analytical areas: overview, treasury, governance, network/growth, personal impact and record explorer.
- [x] Exact per-currency metrics, trends, source drill-downs and balanced-ledger inspection.
- [x] Community, time, currency, dataset, person, type, status and vote-cohort filters.
- [x] Persisted dashboard customization, private saved views, pagination and authenticated CSV export.
- [x] Third migration applied without resetting demo data; scoped authorization and export limits enforced.

## Phase 11 — Expansion verification · 100%

- [x] 25 unit tests and 27 real PostgreSQL integrity/security checks pass.
- [x] 61 HTTP checks and 75 browser layout/interaction checks pass without browser runtime errors.
- [x] Desktop/mobile review includes 320-pixel layouts; 30 axe scans report no WCAG A/AA violations.
- [x] TypeScript, lint and full production build pass.
- [x] Metric definitions, operating limits, analytics guide and updated handoff documented.

## Capability phase 1 — Multi-scheme funding rounds · Complete

- [x] Add separate rounds and competing schemes without converting or deleting legacy proposals.
- [x] Staff-owned drafts, published locked rules, member/public submissions, scoped authorization and bounded submission limits.
- [x] Immutable scheme content and an active-member snapshot shared by both voting stages.

## Capability phase 2 — Separate screening and selection · Complete

- [x] 24-hour majority screening, independent first-past-the-post selection and explicit quorum/tie/deadline rules.
- [x] New round ballots stay hidden until their stage is finalized; voters see their own choice.
- [x] Published results/ballots, immutable votes, no staff cancellation after publication and safe empty/no-quorum outcomes.
- [x] 31 unit tests, 27 PostgreSQL checks, 61 HTTP checks and 75 existing browser checks pass.
- [x] 20 new round scenarios and 14 round accessibility scans pass; desktop/mobile/320-pixel layouts checked.
- [x] TypeScript, lint, full production build and additive fourth migration pass; demo financial records preserved.

## Superseded capability-phase numbering

The user regrouped all completed work into Part 1. The former pending capability phases are now expanded into delivery Parts 2–5 in `docs/MASTER-PLAN.md`: funded rounds/accounting; weighted allocation/veto; advanced methods/reputation; verified NEAR testnet and full integration.

Round selections currently record a preference without moving or reserving funds. Existing dashboard, analytics, proposals and treasury features remain available. See `docs/UPGRADE-PHASES.md` for rules and boundaries.

## Future work — not claimed as complete

- [ ] NEAR wallet linking, treasury contract, testnet submission and verified chain receipts.
- [ ] Durable outbox/reservations, chain reconciliation and safe external retry processing.
- [ ] Production account recovery, email verification, MFA and stronger transfer reauthentication.
- [ ] Production deployment/security review, monitoring, backups, pagination on remaining community lists and scheduled maintenance/finalization.
- [ ] File uploads, advanced round allocation/settlement and a ledger reversal UI.

These future items do not change the fact that the delivered treasury uses local simulated funds. See `docs/NEAR-INTEGRATION.md` and `docs/VERIFICATION.md` for boundaries and evidence.
