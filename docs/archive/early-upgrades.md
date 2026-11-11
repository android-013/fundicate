# Fundicate capability upgrades

> Historical sub-phase record: the user has regrouped **all completed work here into Part 1/5**. The authoritative remaining four-step roadmap and next-triggered agent workflow are in [MASTER-PLAN.md](../MASTER-PLAN.md). The old phase 3–5 labels below are superseded, not an independent delivery counter. Current detailed rules below still describe the implemented baseline.

The existing dashboard, analytics, community membership, proposal workflow and simulated treasury remain available. New funding rounds are an additional workflow. Completion of a phase is not a claim that the whole Money Heist concept is complete.

| Phase                              | Scope                                                                                                                            | State    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1. Multi-scheme rounds             | Separate funding rounds, published rules, member/public submissions, multiple immutable schemes and frozen voters                | Complete |
| 2. Screening and selection         | Separate 24-hour majority screening and first-past-the-post selection; stage-specific hidden ballots and published final results | Complete |
| 3. Committed funds                 | Round-specific prepaid simulated balances, reservations, safe settlement/refunds and failed/empty-round handling                 | Planned  |
| 4. Allocation and rejection        | Proportional/custom ranked splits, contribution-weighted voting with snapshots, optional 24-hour/90% veto gate                   | Planned  |
| 5. Advanced choices and reputation | Ranked/STV/pairwise methods with defined algorithms; participation-based ratings and review moderation                           | Planned  |

## Current funding-round rules

Staff create a draft and open submissions. Published rules lock when submissions open. A round accepts either active community members or any signed-in account; suspended and removed accounts are excluded. At most 50 schemes are accepted, with five per account. A submitted scheme cannot be edited or deleted.

After the submission deadline, staff begin screening. The active membership at that moment is frozen for both elections, with a local MVP limit of 10,000 voters. Later joiners cannot vote in that round. A suspended, removed or departed member cannot cast new ballots; existing ballots remain recorded. Eligible scheme authors can vote on the same terms as other members.

Each scheme has a separate YES/NO/ABSTAIN screening ballot. Passing requires the configured participation quorum and strictly more YES than NO. Abstentions count toward quorum and do not enter the approval denominator. Screening lasts 24 hours, with early finalization allowed only when every frozen voter has voted on every scheme.

Qualified schemes enter a separate 24-hour selection election. Each frozen voter selects one scheme, with equal weight. Participation must meet the same quorum; the unique highest vote count selects the winner. A tied maximum selects no winner. Selection can close early only after all frozen voters cast a ballot. No qualified schemes ends the round without a selection election; zero submissions also produces no winning scheme.

Ballots are hidden from other application users until their own stage is finalized, including when its deadline has passed but staff have not finalized it. A voter can see their own choice. No public vote-choice audit event is emitted while voting is sealed. Screening results publish when screening closes; selection results remain hidden until selection closes. Published individual ballots show up to 100 rows per stage, alongside complete aggregate counts. This is application-level ballot privacy; it is not cryptographic secrecy from database administrators.

Staff cannot cancel a round once submissions open, rewrite its published rules, redirect a recorded winner, or change its immutable ballots. Staff explicitly advance each stage; there is no background finalization worker yet. Draft rounds can be cancelled. A round with no schemes finishes without a winner after its submission deadline.

## Deliberate phase boundary

These first two phases record a decision. Requested amounts describe scheme requests; they are not a funded pool, a reservation, an allocation or a payment. The selected scheme has no payout control. A round neither changes the existing treasury nor produces an executable legacy proposal. The next phase must introduce committed funds and settlement as a complete flow before this boundary changes.

Existing single-proposal ballots retain their established public-vote behavior. Hidden ballots apply to the new funding-round workflow. Existing analytics retain their datasets; new round lifecycle and submission events appear in the existing activity trail, while round ballots have their own result views.
