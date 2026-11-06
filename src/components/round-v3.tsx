import { ShieldCheck, Vote } from "lucide-react";
import type { getV3RoundView } from "@/lib/rounds-v3";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { ActionButton, ActionForm, Select } from "./forms";
import { Badge } from "./ui";

type V3View = NonNullable<Awaited<ReturnType<typeof getV3RoundView>>>;
const power = (value: bigint) => value.toLocaleString("en-US");
const weightName = (mode: string) =>
  mode === "CONTRIBUTION" ? "Received contribution" : "Equal member power";
const policyName = (policy: string) =>
  policy === "RANKED_CUTS"
    ? "Ranked cuts"
    : policy === "PROPORTIONAL"
      ? "Proportional"
      : "Winner-all";
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function localAmount(value: unknown, currency: string) {
  return typeof value === "string" && /^\d+$/.test(value)
    ? moneyFormat(BigInt(value), currency)
    : "Unavailable";
}

export function RoundV3({
  view,
  communityId,
  roundId,
  currency,
  names,
}: {
  view: V3View;
  communityId: string;
  roundId: string;
  currency: string;
  names: Record<string, string>;
}) {
  const { settings, veto, decision } = view;
  const base = { communityId, roundId };
  const allocation = record(decision?.allocation);
  const payouts = Array.isArray(allocation?.payouts)
    ? allocation.payouts.map(record).filter((item) => item !== null)
    : [];
  const vetoTitle = !settings.vetoEnabled
    ? "Rejection veto is disabled."
    : veto.state === "OPEN"
      ? "The rejection window is open."
      : veto.state === "REJECTED"
        ? "The community rejected this allocation."
        : veto.state === "PASSED"
          ? "The rejection threshold was not met."
          : veto.state === "DISABLED"
            ? "Rejection veto is disabled."
            : "The rejection window begins after the decision.";
  return (
    <section
      className="panel padded round-v3"
      aria-labelledby="round-v3-heading"
    >
      <div className="row between">
        <div className="row">
          <Vote size={22} aria-hidden="true" />
          <div>
            <span className="eyebrow">
              FROZEN POWER · PUBLISHED ALLOCATION · V3
            </span>
            <h3 id="round-v3-heading">Your voice, with the rules in view.</h3>
          </div>
        </div>
        <Badge tone="green">{policyName(settings.allocationPolicy)}</Badge>
      </div>
      <p className="muted small-text">
        {view.frozenAt
          ? `Power frozen ${dateTime(view.frozenAt)}.`
          : "Membership and received payments freeze at the contribution cutoff."}{" "}
        Later departures, removals and role changes do not rewrite frozen power
        or valid ballots. A pledge is never paid voting power.
      </p>
      <div className="v3-power-grid">
        {(["screening", "selection", "veto"] as const).map((stage) => (
          <article key={stage}>
            <h4>{stage === "veto" ? "Rejection veto" : titleCase(stage)}</h4>
            <span className="small-text muted">
              {weightName(settings[`${stage}Weight`])}
            </span>
            <strong>
              {view.frozenAt ? power(view.ownPower[stage]) : "Not frozen"}
            </strong>
            <small>
              Your power ·{" "}
              {view.frozenAt
                ? `${power(view.totalPower[stage])} total eligible power`
                : "the cutoff basis is pending"}
            </small>
          </article>
        ))}
      </div>
      <p className="small-text muted">
        Contribution weighting uses received {currency} minor units in this
        round only: one minor unit gives one unit of power. Equal weighting
        gives each eligible member one unit. Zero stage power gives no ballot in
        that stage; roles add no extra power.
      </p>

      <details className="v3-rule-details">
        <summary>Explore voting and allocation rules</summary>
        <dl className="detail-list">
          <div>
            <dt>Selection method</dt>
            <dd>FPTP · one scheme choice per voter</dd>
          </div>
          <div>
            <dt>Screening approval</dt>
            <dd>YES power must be strictly greater than NO power</dd>
          </div>
          <div>
            <dt>Screening participation</dt>
            <dd>YES + NO + ABSTAIN power; abstentions do not approve</dd>
          </div>
          <div>
            <dt>Ordinary quorum</dt>
            <dd>Rounded-up published percentage of all frozen stage power</dd>
          </div>
          <div>
            <dt>Selection abstention</dt>
            <dd>
              No abstention ballot; nonvoters remain in the quorum denominator
            </dd>
          </div>
          <div>
            <dt>Allocation policy</dt>
            <dd>{policyName(settings.allocationPolicy)}</dd>
          </div>
          {settings.allocationPolicy === "RANKED_CUTS" && (
            <div>
              <dt>Ranked position shares</dt>
              <dd>
                {settings.rankedSharesBps
                  .map(
                    (share) =>
                      `${Math.floor(share / 100)}.${String(share % 100).padStart(2, "0")}%`,
                  )
                  .join(" / ")}
              </dd>
            </div>
          )}
          <div>
            <dt>Rejection veto</dt>
            <dd>
              {settings.vetoEnabled
                ? "24 hours · 90% of all frozen veto power"
                : "Disabled · no additional rejection holding period"}
            </dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd>Zero</dd>
          </div>
        </dl>
        <p className="small-text muted">
          {settings.allocationPolicy === "WINNER_ALL"
            ? "A unique positive-support leader receives min(pool, request). A top tie returns the entire pool."
            : settings.allocationPolicy === "PROPORTIONAL"
              ? "Positive support splits the full pool before caps. Equal-support schemes may share. Largest remainders preserve exact minor units; scheme ID breaks equal remainders."
              : "The pool is split by the published position shares first. A tied group consumes its occupied positions and those entitlements are refunded. Missing positions and zero-support candidates receive no award. Rounding ties use position order."}{" "}
          Every request caps its payout. Unpayable, missing and capped shares
          return to contributors without redistribution. Residual refunds use
          original-source largest remainders and source-ID ties.
        </p>
        <p className="small-text muted">
          A missed quorum, failed target or invalid zero-power basis creates no
          award. Unresolved expiry before a decision can return principal; once
          an enabled veto is published, recovery waits for its complete window.
          A queued plan resumes unchanged, and an unknown local execution must
          be reconciled before retry or release.
        </p>
      </details>

      {view.screeningResults && (
        <div className="v3-closed-results">
          <h4>Screening power results</h4>
          {view.screeningResults.map((result) => (
            <article key={result.schemeId} className="v3-result-row">
              <div className="row between">
                <strong>{names[result.schemeId] ?? "Scheme"}</strong>
                <Badge tone={result.approved ? "green" : "neutral"}>
                  {result.approved ? "Qualified" : "Not qualified"}
                </Badge>
              </div>
              <p>
                {power(result.yes)} YES · {power(result.no)} NO ·{" "}
                {power(result.abstain)} ABSTAIN power
              </p>
              <small className="muted">
                {power(result.participation)} / {power(result.eligible)}{" "}
                eligible power participated · {power(result.quorumRequired)}{" "}
                required · quorum {result.quorumMet ? "met" : "not met"}
              </small>
            </article>
          ))}
        </div>
      )}

      {view.selectionResult && (
        <div className="v3-closed-results">
          <h4>Selection power results</h4>
          <p className="small-text muted">
            {power(view.selectionResult.participation)} /{" "}
            {power(view.selectionResult.eligible)} eligible power participated ·{" "}
            {power(view.selectionResult.quorumRequired)} required. Support is
            the exact sum of each voter’s frozen selection power.
          </p>
          <div className="round-results">
            {view.selectionResult.ranking.map((rank) => (
              <div key={rank.schemeId} className="row between">
                <span>
                  Rank {rank.rank} · {names[rank.schemeId] ?? "Scheme"}
                </span>
                <strong>{power(rank.support)} support</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {decision && (
        <div className="v3-proposed-allocation">
          <h4>Published allocation — not payment receipts</h4>
          <p className="muted small-text">
            Published {dateTime(decision.publishedAt)}. This proposed plan stays
            recorded even when rejection or expiry requires a separate
            full-refund outcome. Actual execution and refund receipts appear in
            the funding pool.
          </p>
          {payouts.length ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Published V3 allocation"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Scheme</th>
                    <th>Recipient</th>
                    <th>Proposed payout</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((item, index) => (
                    <tr
                      key={
                        typeof item.schemeId === "string"
                          ? item.schemeId
                          : index
                      }
                    >
                      <td>
                        {typeof item.schemeId === "string"
                          ? (names[item.schemeId] ?? "Scheme")
                          : "Scheme"}
                      </td>
                      <td>
                        {typeof item.recipient === "string"
                          ? item.recipient
                          : "Unavailable"}
                      </td>
                      <td>{localAmount(item.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="notice">
              This proposed plan contains no scheme payouts.
            </p>
          )}
          <p className="small-text">
            Proposed original-source refunds:{" "}
            <strong>{localAmount(allocation?.refundTotal, currency)}</strong>
          </p>
        </div>
      )}

      <div className="v3-veto" id="round-veto">
        <div className="row">
          <ShieldCheck size={21} aria-hidden="true" />
          <h4>{vetoTitle}</h4>
        </div>
        {settings.vetoEnabled ? (
          <>
            <p>
              Rejection needs at least 90% of all frozen eligible veto power.
              Nonvoters, KEEP and ABSTAIN are not rejection votes. No payout can
              leave before the full 24-hour window ends, even if everyone votes
              early.
            </p>
            {veto.closesAt && (
              <p className="notice">
                Rejection deadline: <strong>{dateTime(veto.closesAt)}</strong>
                {veto.state === "OPEN" && " · payouts are held"}
              </p>
            )}
            {veto.ownChoice && (
              <p className="form-success">
                Your recorded rejection ballot: {veto.ownChoice}
              </p>
            )}
            {veto.canVote && !veto.ownChoice && (
              <ActionForm
                operation="round-veto"
                defaults={base}
                submit="Seal rejection ballot"
                confirm="Record this immutable rejection ballot? It cannot be changed."
              >
                <Select
                  name="choice"
                  label="Your rejection ballot"
                  options={[
                    {
                      value: "REJECT",
                      label: "Reject · refund the entire round",
                    },
                    {
                      value: "KEEP",
                      label: "Keep · do not reject the allocation",
                    },
                    { value: "ABSTAIN", label: "Abstain · no rejection power" },
                  ]}
                />
              </ActionForm>
            )}
            {veto.state === "OPEN" && (
              <p className="muted small-text">
                Rejection ballots and totals stay sealed until the deadline. You
                can see your own choice only. Eligible frozen voters with
                positive veto power retain their ballot rights after leaving the
                community.
              </p>
            )}
            {veto.rejectedPower !== null && (
              <p className="notice">
                Rejection power: <strong>{power(veto.rejectedPower)}</strong> /{" "}
                {power(view.totalPower.veto)} total eligible power ·{" "}
                {veto.state === "REJECTED"
                  ? "90% threshold met; original contributors are refunded."
                  : "90% threshold not met."}
              </p>
            )}
            {veto.canClose && (
              <ActionButton
                operation="round-veto-close"
                body={base}
                confirm="Finalize the rejection window using its complete frozen denominator?"
              >
                Finalize rejection window
              </ActionButton>
            )}
            {veto.ballots && (
              <details className="v3-veto-ballots">
                <summary>Published rejection ballots</summary>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Published rejection ballots"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Choice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {veto.ballots.slice(0, 100).map((ballot) => (
                        <tr key={ballot.user.id}>
                          <td>{ballot.user.displayName}</td>
                          <td>{ballot.choice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small-text muted">
                  {veto.ballots.length} recorded ballots; up to 100 shown.
                </p>
              </details>
            )}
          </>
        ) : (
          <p className="muted small-text">
            The published rules disable rejection veto. The final decision may
            proceed to settlement without an additional window; monetary
            receipts remain separate.
          </p>
        )}
      </div>
    </section>
  );
}
