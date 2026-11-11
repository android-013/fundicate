# Dashboard and analytics

Fundicate uses a blockchain-inspired indigo, violet and cyan interface with connected nodes, transparent voting and collective growth. Treasury activity is still a local simulation. The interface does not invent token prices, wallet connections, transaction hashes or chain confirmations.

## Start simple, then investigate

The dashboard summarizes available treasury funds, open ballots, communities, network connections, personal contributions and recent activity. **Customize** lets each account choose which of six sections to show; preferences persist across sessions.

Open **Analytics** to explore:

| Area             | What you can investigate                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Overview         | Per-currency funds, participation, activity trends and shortcuts into deeper reports                         |
| Treasury         | Opening and closing balances, inflows, outflows, contribution averages/medians and individual ledger entries |
| Governance       | Proposal pipeline, turnout, approval, ballot choices and individual decisions                                |
| Network & growth | Shared-community connections, current peers and recorded membership joins                                    |
| Your impact      | Personal contributions, vote participation, eligibility and activity                                         |
| Record explorer  | Transactions, proposals, votes, memberships and audit events with search, filters, pagination and CSV export |

Filter by an active community, currency, preset period or custom UTC dates. Click a metric, chart point or table link to follow its source records. The explorer adds dataset, text search, status, type, person and vote-cohort filters. Transactions open an inspector with balanced ledger entries; votes and audit events expose their recorded details. Proposals and memberships link back to their community workflow.

Use **Save view** to name a filtered report and return to it from the dashboard or analytics overview. Saved views and dashboard preferences belong to the signed-in account. Removing a saved view does not delete its source data.

## Metric definitions

- **Currencies:** USD, BDT and EUR remain separate. No exchange rate or mixed-currency grand total is assumed. Money uses bigint minor units throughout; contribution averages and medians round half up to the nearest minor unit.
- **Treasury:** Opening balance is the sum of treasury ledger entries before the selected period. Closing balance adds every confirmed treasury movement in that period. Current treasury is the live account balance and can differ from a historical period close.
- **Flows:** Inflows are positive treasury movements; outflows are absolute negative movements. Counts and unique contributors use the selected community/currency/time scope. A zero previous-period baseline displays no percentage change.
- **Time:** Custom start and end dates include both calendar days in UTC. A 30-day preset starts at UTC midnight 29 days before today and ends at report time. Wider chart ranges use monthly buckets. Zero-activity buckets are real zeros; exact values are available beneath the chart.
- **Governance cohort:** Governance summaries select proposals created during the chosen period, then include their recorded lifetime ballots. Turnout is total ballots divided by total eligible-voter snapshot slots across those proposals. Approval rate uses decided outcomes rather than open or draft proposals. This is not a unique-person participation percentage.
- **Vote events:** Activity charts and the default vote explorer select ballots by the time the vote was cast. The explorer's decision-cohort option instead follows the proposals-created cohort used by governance summaries. A recent vote on an older proposal can appear in vote events while being outside that decision cohort.
- **Membership:** Join trends count stored membership join records during the period. Active-member and peer counts describe current membership state; they do not reconstruct a historical active population, retention or churn that the stored data cannot establish.
- **Network:** A peer is a distinct active co-member other than you. A community edge means at least one such peer is active in both communities. It does not represent blockchain transfers or a claimed social relationship. The graph displays up to 12 communities; totals include the whole authorized scope.
- **Personal impact:** Personal contributions and ballots use your account ID. Voting opportunities use the frozen eligible-voter snapshots. Current membership does not retroactively grant eligibility on an older ballot.
- **Records:** Transaction, vote and audit counts can describe different records arising from the same action. They are not a count of unique people or unique business actions.

## Access, exports and practical limits

Analytics are available only for communities where the account currently has an active membership. An explicitly requested community outside that scope is rejected. Identity fields are limited to display name, username, avatar and internal ID; password/session material and email addresses are not added to analytical datasets. Saved views are private and never grant access beyond the current scope.

The explorer shows 25 matching records per page. CSV export includes up to 10,000 matching rows, exact minor-unit and decimal money values, timestamps and source links. Text cells escape spreadsheet formulas, quotes and newlines. Larger exports return a useful error asking for narrower filters. Exports are authenticated, rate limited and marked private/no-store.

Reports reject more than 50,000 rows in an individual loaded dataset rather than silently calculate an incomplete total. Narrow the date range or community if that limit is reached. Up to 20 named views can be saved per account. These are local MVP guardrails; a production-scale system would move large aggregations and exports to dedicated database queries/jobs.

Read [NEAR-INTEGRATION.md](near-integration.md) for the future chain integration boundary, and [VERIFICATION.md](baseline-verification.md) for recorded checks.
