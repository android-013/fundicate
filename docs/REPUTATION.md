# Participation-based reputation — Part 4

Community members can publish a written review (20–3,000 characters) with an integer 1–5-star score. Targets are members, funding schemes, legacy proposals and agendas/funding rounds. Each author gets one review per community, target and dimension; changes append numbered revisions rather than replacing the original review. Targets and participation context cannot be edited.

Database constraints require an initial revision before a new review commits and preserve ordered, append-only revisions and moderation events. A malformed review without a score fails closed instead of contributing an invented default rating.

Member and round reviews describe participation. Scheme and legacy proposal reviews describe presentation. A separate **receipt-backed recipient experience** dimension is available for a member/scheme with a confirmed matching funded-round payout or a legacy funding proposal with a confirmed execution and ledger transaction. Receipt verification means payment evidence, including explicitly simulated local payments; it does not verify delivery, project success or an investment return. The raw stored dimension is `VERIFIED_RECIPIENT_PERFORMANCE`, but that name never turns a payment into evidence of a real-world outcome.

## Eligibility and scope

Writing requires active community membership and actual recorded shared participation in a completed context. A completed context is a DECIDED round with a decision timestamp and no pending veto window, or a finalized legacy proposal with a closed/approved/rejected/executed status. A creator or scheme author participates by creating the recorded work. An actual screening, selection, method or veto ballot, or an actual received round contribution, also establishes participation. A proposal author or an actual proposal vote establishes proposal participation. Merely belonging to a community or appearing in a frozen electorate does not qualify. The entire round context remains unavailable until an enabled veto deadline passes, so a participant whose only action is a sealed veto cannot be inferred through review eligibility or target options.

A scheme or proposal review uses its own round/proposal as the context. A member target and reviewer must both have recorded participation in the same context. Self-reviews, reviews of one's own schemes/proposals/rounds, duplicate target/dimension reviews, cross-community targets, false contexts and unreceived performance claims are rejected. Eligibility is checked again when revising. None of these queries exposes ballot choices, and open contexts do not qualify.

The review composer offers unreviewed eligible choices from the latest 30 completed rounds and 30 finalized proposals. Older eligible contexts remain valid through the same API. The latest 50 review bodies are shown; aggregates use every latest visible review, including older reviews beyond that list. Averages remain separate per target and dimension and count one latest score per review, regardless of revision count.

## Moderation, reports and appeals

An active member can file one reasoned abuse report per review other than their own. Reports are private to staff. An active moderator/administrator can hide or restore with a public reason. A moderator cannot decide a review they authored or one whose target is themselves or their own work. Visibility is derived from ordered, append-only moderation events; hiding excludes the review from public averages without deleting its original stars or text.

The author can appeal the current HIDE event once. Restoration after an appeal requires a different, unconflicted moderator from the person who hid it. If no such moderator exists, the appeal remains recorded and the review stays hidden; administrator status does not bypass the conflict rule. Each later HIDE event may have its own appeal. There is no automatic restoration or staff editing of an author's rating/body.

The public sees a hidden-review placeholder, author/target identity, version number and public moderation reasons, with no hidden score, text or historical revisions. Authors and staff may inspect retained revision/appeal history; staff may inspect reports. Editing a hidden review does not make it public. Audit events contain action/review identity without review text or ballot choices. Financial and election outcomes are unchanged by reputation or moderation.

## API operations

Authenticated same-origin POST routes: `reputation-create`, `reputation-edit`, `reputation-report`, `reputation-moderate`, `reputation-appeal`. Every operation requires `communityId`; all except create require `reviewId`. Create also requires `targetType`, `targetId`, `dimension`, `contextType`, `contextId`, `score`, and `text`. Edit takes score/text. Report takes reason. Moderate takes action HIDE/RESTORE and reason. Appeal takes moderationId and statement. Unknown fields are rejected.

The community hub is `/communities/[slug]/reputation`, with source links, target/dimension aggregates, author editing, abuse reports, moderation reasons and appeal history. Reviews never grant funds, change voting power, alter recipient identities or rewrite posted decisions.
