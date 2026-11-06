# Funded V3 specification — Part 3

Status: implementation contract, frozen before enabling V3. V1 decision-only and V2 equal/FPTP/winner-all/veto-disabled semantics remain unchanged. Part 3 implements R15–R18, not the optional capped-weight R19 or Part 4 election methods.

## Configuration and exact units

New API input opts in with `funded: true, fundedVersion: "V3"`; absent fundedVersion retains V2. V3 uses the existing funding target/minimum/maximum/cutoff/expiry and derived local fiat asset. Additional fields: `screeningWeight`, `selectionWeight`, `vetoWeight` each EQUAL or CONTRIBUTION; `allocationPolicy` WINNER_ALL, PROPORTIONAL or RANKED_CUTS; `rankedSharesBps` an array of 1–50 positive integer basis-point shares totaling 10000 for RANKED_CUTS (empty otherwise); `vetoEnabled` boolean; `selectionMethod` FPTP only. Unknown/unsupported fields fail. No currency/asset override or raw rating allocation is accepted.

All weights/amounts are BigInt minor units. A weight is never an amount in another asset. Fees are zero. All rules, asset and residual policies are stored before collection and immutable, including on drafts.

## Electorate and stage denominators

RoundVotingPower records active membership at opening and tracks membership activation/departure until the collection cutoff through a database trigger. Changes after cutoff do not alter this basis. At freeze, eligible users receive equal power 1 and paidPower equal to actual received own round contributions before cutoff; ineligible users have zero power. Declarations never count. Store the frozen timestamp and received basis permanently. New members after cutoff have no ballot rights. Departures/removals/role changes after cutoff do not remove frozen ballot rights or earlier valid votes. V1/V2 retain their existing active-member rule.

Each stage independently chooses equal power or paidPower. Users with zero stage power cannot cast that stage's ballot. At least one eligible user and positive total power for each enabled stage are required to open an election. An invalid zero-power basis concludes with no award and contributor refunds, rather than opening a zero-weight vote.

Screening: one immutable YES/NO/ABSTAIN per scheme per eligible positive-power voter. Quorum is ceil(total frozen stage power * quorumBps / 10000). YES + NO + ABSTAIN power is participation; approval is strictly YES > NO. Selection: one scheme choice per positive-power eligible voter; no selection abstention ballot. Participation is cast choice power and uses the same rounded quorum formula. Nonvoting power counts only in the quorum denominator. Support is sum of each scheme's choice power; each voter is counted once. FPTP support/ranking and selection ballots remain sealed until selection ends; screening ballots/results remain sealed until screening ends. A voter can see only their own pending ballots.

## Allocation

Freeze the decision and proposed allocation in RoundDecision at publication. All candidate amounts/recipients/beneficiaries come from immutable qualified schemes. A missed quorum, zero support, failed target or no qualified scheme refunds the entire pool.

WINNER_ALL: a unique positive support leader receives min(pool, request). A top tie refunds the whole pool. PROPORTIONAL: split the pool by each positive support / total positive support. Use largest remainders with scheme-ID ascending to break equal remainders. Compute shares before request caps or recipient checks; unused amounts return to contributors, never to other schemes. Equal support is allowed.

RANKED_CUTS: split the full pool across the published slot shares first, with largest remainders tied by slot index. Rank positive support descending. A tied group consumes its full set of positions; all entitlements of tied positions are refunded, with no arbitrary winner or upward/downward share shifting. Missing positions and zero-support candidates get no payout. Unique rank recipients receive min(slot entitlement, request). Unpayable recipients' entitlements are refunded. No unused/capped share is redistributed.

All remaining principal returns pro rata to original received payment sources, using the existing largest-remainder/source-ID rule. Original ownership survives membership changes. Proposed decision allocation is immutable; financial execution uses only that plan, or the separately justified full-refund outcome after rejection/expiry. Immutable operations are the only transfer instructions.

## Rejection veto and centralized settlement gate

Enabled veto opens at decision publication for exactly 24 hours. All payouts wait the entire half-open interval [publishedAt, vetoClosesAt), including when all voters have voted. One immutable REJECT/KEEP/ABSTAIN ballot per frozen positive veto-power voter. Rejection succeeds iff total eligible veto power > 0 and 10 * REJECT >= 9 * total eligible veto power. The denominator includes nonvoters and abstentions. Pending veto ballots are sealed except the caller's own choice; reveal totals/ballots after the deadline. Zero veto power never produces an automatic successful rejection.

Decision/result/proposed allocation are visible during veto. After the deadline, close veto atomically; success queues full original-source refunds. Failure/disabled veto permits the immutable published allocation. Existing queued plans never change on expiry or retry. For a published enabled veto, even expiry recovery waits for its window to close; unresolved expiry before any decision may refund without creating payout authority. Publish this distinction in the UI.

Every prepare, process, per-operation execution, local reconciliation and database payout guard uses the same version-aware eligibility conditions. UNKNOWN operations block new submission and release; local-only reconciliation proves whether the atomic ledger contains the exact operation key/intent before retry. No fake external finality is inferred. Other networks remain unsupported until Part 5.

## Shared implementation contracts

Coordinator owns schema/migrations, rounds-core.ts, rounds.ts, API router, package/test runner and workflow state. Workers use the separate Part 3 staging tree and exclusive owned files; no main data resets or independent migrations.

Models: RoundVotingPower(roundId,userId composite PK, eligible Boolean, paidPower BigInt default0, frozenAt DateTime?, createdAt DateTime); RoundDecision(roundId PK, publishedAt, allocation Json, result Json, vetoClosesAt DateTime?, vetoFinalizedAt DateTime?, rejected Boolean defaultfalse, totalVetoPower BigInt); RoundVetoVote(id UUID, roundId,userId composite voter FK, choice String, createdAt, unique roundId/userId). FundingRound owns powers, decision, vetoVotes; User owns powers and vetoVotes. Existing table/column identities are retained. Operation/attempt status UNKNOWN is added without changing confirmed history.

elections-core.ts exports v3FundsConfigSchema, V3FundsConfig, WeightMode, V3_RULES_POLICY, weightedScreeningOutcome, weightedSelectionOutcome and allocateV3. Weighted outcome objects use BigInt power fields. allocateV3 takes received, candidate array {schemeId,request,recipient,beneficiaryId,support}, policy and ranked shares; returns payouts {schemeId,amount,recipient,beneficiaryId} and refundTotal. Validate conserved nonnegative exact amounts; unpayable control-character/empty recipient labels receive no payout.

rounds-v3.ts exports getV3Settings(settlement), v3Weight(settlement,power,stage), seedV3Electorate(tx,round,now), freezeV3Electorate(tx,round,settlement,now) returning {ready,reason?}, tallyV3Screening(tx,round,schemeId), tallyV3Selection(tx,round), publishRoundDecision(tx,decidedRound,actorId,now), finalizeRoundVeto(tx,round,now), assertRoundSettlementGate(tx,round,settlement,now), castRoundVetoVote(userId,input,now?), closeRoundVeto(userId,input,now?), getV3RoundView(communityId,roundId,userId?,now?). Settlement gate returns {decision: RoundDecision|null,rejected:boolean}; V2 returns null/false without changing its existing behavior. Scope input is strict {communityId,roundId}, veto adds choice. Clock is never accepted through HTTP.

V3 read view returns settings, frozenAt, ownPower {screening,selection,veto}, totalPower with the same keys, screeningResults (null until screening ends), selectionResult (null until selection ends), decision and veto {state,ownChoice,canVote,canClose,rejectedPower (null while open),ballots (null while open)}. Dates and BigInts stay server-side or explicitly formatted for client props. No accidental pending aggregate leakage. Other workers must agree with the owner before changing these interfaces.

The finance worker extends funded-rounds.ts for V3, preserves V2 and adds reconcileRoundSettlement. It calls seedV3Electorate on open and freezeV3Electorate during received-basis freeze. Failed-target V3 does not queue before the coordinator publishes a decision. Queue V3 payouts solely from RoundDecision.allocation; full refunds are explicitly recorded for rejected/expired/failed outcomes. V3 reserves use reserve:v3 and existing unique immutable operation keys. No external submission occurs inside retryable database transactions.

The coordinator calls publishRoundDecision immediately after every V3 DECIDED transition. For V3 it freezes RoundElectorate from eligible RoundVotingPower rows, uses weighted tallies for finalization, and permits frozen positive-power voters despite later membership changes. Existing numeric legacy result DTOs are null for V3; the separate V3 read view supplies exact results. New successful non-WINNER_ALL decisions use outcome ALLOCATION_SELECTED with no single winnerSchemeId. V3 failed target/invalid power concludes FUNDING_FAILED with zero awards.
