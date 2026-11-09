# System insights and reusable round templates

## System insights

`/analytics/system` extends the existing overview, saved views and customizable analytics. The original `/analytics` routes and exports remain available. Sign in with an active community membership to inspect that community; the service and CSV endpoint enforce the same scope.

Start with round counts and principal reconciliation, then open individual rounds and their immutable source records. Published rules show the election method, screening/selection/veto power modes and allocation policy. Local received principal must reconcile exactly:

```text
received = held + reserved + paid + refunded
```

Each network, asset ID, currency and precision has a separate group. There is no implied BDT/USD/EUR/NEAR exchange rate, and historical communal money is never assigned fabricated individual ownership. All amounts remain integer strings until display formatting.

Creation-date filters select a **round cohort**, rather than claiming to show financial event flow within that period. Every local money and election total covers the complete cohort. A cohort above 500 rounds returns an explicit narrowing request; it never silently displays incomplete totals. Individual sources have deterministic 25-record pagination.

Reputation and external-payment records are separately labeled current snapshots of the selected communities, independent of round creation-date filters. Reputation uses each review's latest score revision only when currently visible. Review bodies, author identities, private reports and hidden scores are not fetched for this report. Draft and cancelled round data is available only to that community's active staff.

External-payment totals are derived from append-only staff attestations and their full-source reversals, grouped by currency. They are independently unverified and separate from simulated principal. Source links lead to the scoped payment register. Historical chain custody is dormant and is not included in this branch's reports.

The complete ballot context remains sealed until the round is decided and any enabled veto deadline passes. No ongoing participation count, choice, ranking or raw ballot is passed to a report component or CSV. Closed contexts expose only whitelisted published participation/eligible/quorum power and the published allocation; source pages supply the deeper authorized context. Missing historical denominators remain unavailable.

`GET /api/analytics/system/export` accepts `community`, optional `from`/`to` calendar dates, `page`, and `dataset` (`rounds`, `funds`, `reputation`, `payments`). Repeated/unknown filters and unauthorized communities are rejected. `rounds` exports exactly the current 25-row page. Other datasets export the displayed grouped snapshot. CSV cells use the existing spreadsheet formula-injection protection. Exports require authentication, are rate limited, use private no-store caching and vary by session cookie.

## Reusable templates

`/communities/[slug]/templates` lists a community's preserved template library in deterministic pages of 25. Active members may inspect it. An administrator or active moderator can save, revise, archive or instantiate templates. Staff permissions are rechecked inside the same serialized community transaction as each change.

The UI saves from an existing draft or historical round. This copies the actual versioned rule configuration: proposal permissions, quorum, election method/seats, stage weights, allocation settings, veto and local funding limits. It does not copy ballots, schemes, contributions, receipts, payment authority, outcomes or real-chain custody.

Template revisions are append-only. Editing creates the next numbered revision and an audit event; concurrent edits are serialized. Archiving is idempotent and preserves revisions and all previously created rounds. An archived template cannot create new drafts. The latest 100 source-round choices are listed in the UI; an older source can still be supplied by its scoped API ID.

Absolute deadlines are replaced by two explicit intervals: collection cutoff before submissions, and recovery expiry after submissions. Creating a draft requires a fresh future submission deadline; the remaining dates shift by those intervals. Existing `roundSchema` validation and `createFundingRound` enforce valid rules, supported versions, future collection and recovery windows. A stale shifted cutoff fails atomically, without leaving a partial draft.

Each draft records its exact immutable `templateRevisionId` in the same transaction as its creation. That revision must belong to the same community and remain active at creation. Older revisions may be selected explicitly while the template remains active. The newly created round owns its independent funding-rule snapshot and lifecycle; later template edits cannot change its published rules.

Same-origin authenticated mutation operations:

| Operation              | Input                                                                                                                                      | Result                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `template-save`        | `communityId`, optional `templateId`, `name`, `description`, and exactly one of `sourceRoundId` or a validated flat `round` creation input | Template and newly appended revision                                      |
| `template-instantiate` | `communityId`, `templateId`, `revision`, fresh ISO `submissionsCloseAt`, optional `title`/`description`                                    | New draft with exact revision provenance                                  |
| `template-archive`     | `communityId`, `templateId`                                                                                                                | Archived template; repeated request preserves the original archival event |

The source template format is version 1. Unrecognized future formats or invalid/corrupt funding settings fail closed rather than silently upgrading a saved policy.

## Verification

`tests/round-templates.test.ts` and `tests/release-analytics.test.ts` cover relative schedules, exact settings, decision-only preservation, corrupt snapshots, no mutation, asset segregation, bigint precision, reconciliation failures and ballot/veto privacy boundaries. `tests/release-analytics.ts` runs isolated PostgreSQL, service, HTTP and actual browser scenarios, including fresh draft creation, concurrent revisions, SQL immutability, scoped CSV exports, visible reputation integrity, responsive layouts and six accessibility scans. Test evidence is reported by the coordinator only after those commands actually run against the integrated source.
