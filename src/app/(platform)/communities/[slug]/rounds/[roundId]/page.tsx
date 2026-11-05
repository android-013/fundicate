import Link from "next/link";
import { notFound } from "next/navigation";
import { LockKeyhole, ShieldCheck, Trophy, ArrowUpRight } from "lucide-react";
import { communityContext } from "@/lib/community";
import { getFundingRoundView } from "@/lib/rounds";
import { getRoundFinanceView } from "@/lib/funded-rounds";
import { AppError } from "@/lib/errors";
import { uuid } from "@/lib/validation";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { ActionButton, ActionForm, Select } from "@/components/forms";
import { FundingSchemeForm } from "@/components/round-forms";
import { RoundFunds } from "@/components/round-funds";
import { Status, Empty, Badge } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
export default async function FundingRoundDetail({
  params,
}: {
  params: Promise<{ slug: string; roundId: string }>;
}) {
  const { slug, roundId } = await params;
  if (!uuid.safeParse(roundId).success) notFound();
  const { community: c, user } = await communityContext(slug);
  const v = await getFundingRoundView(c.id, roundId, user?.id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const r = v.round;
  const finance = await getRoundFinanceView(c.id, r.id, user?.id);
  const base = { communityId: c.id, roundId: r.id };
  const now = new Date();
  const screenOpen =
    r.status === "SCREENING" &&
    r.screeningOpensAt! <= now &&
    r.screeningClosesAt! > now;
  const selectionOpen =
    r.status === "SELECTION" &&
    r.selectionOpensAt! <= now &&
    r.selectionClosesAt! > now;
  const winner = r.schemes.find((s) => s.id === r.winnerSchemeId);
  const qualified = r.schemes.filter((s) => s.status === "QUALIFIED");
  const names = Object.fromEntries(r.schemes.map((s) => [s.id, s.title]));
  const stageLabels = ["Submissions", "Screening", "Selection", "Decision"];
  const stageIndex = [
    "SUBMISSIONS",
    "SCREENING",
    "SELECTION",
    "DECIDED",
  ].indexOf(r.status);
  return (
    <>
      <Link className="back-link" href={`/communities/${slug}/rounds`}>
        ← Funding rounds
      </Link>
      <div className="section-title">
        <div>
          <div className="row">
            <span className="eyebrow">A COLLECTIVE FUNDING ROUND</span>
            <Status value={r.status} />
          </div>
          <h2 className="round-title">{r.title}</h2>
          <p className="muted">
            {r.schemes.length} competing{" "}
            {r.schemes.length === 1 ? "scheme" : "schemes"} · {c.currency} · one
            member, one vote
          </p>
          <Badge tone={finance ? "green" : "neutral"}>
            {finance ? "V2 · dedicated funding pool" : "V1 · decision only"}
          </Badge>
        </div>
      </div>
      <ol className="round-stage-track" aria-label="Funding round stages">
        {stageLabels.map((label, i) => (
          <li
            key={label}
            className={
              i === stageIndex ? "current" : i < stageIndex ? "complete" : ""
            }
            aria-current={i === stageIndex ? "step" : undefined}
          >
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {["SUBMISSIONS", "SCREENING", "SELECTION"].includes(r.status) && (
        <LiveRefresh label="Round status refreshes every 15 seconds while this page is visible." />
      )}
      <div className="round-layout">
        <div className="round-main">
          <section className="panel padded">
            <h3>The purpose</h3>
            <p className="prewrap">{r.description}</p>
          </section>
          {finance && (
            <RoundFunds
              view={finance}
              communityId={c.id}
              roundId={r.id}
              userId={user?.id}
            />
          )}
          {r.status === "DECIDED" && (
            <section className="panel padded round-result">
              <Trophy size={25} />
              <div>
                <span className="eyebrow">THE RECORDED DECISION</span>
                <h3>
                  {winner
                    ? winner.title
                    : r.outcome === "TIED"
                      ? "The selection ended in a tie"
                      : r.outcome === "NO_QUORUM"
                        ? "Selection did not reach quorum"
                        : r.outcome === "FUNDING_FAILED"
                          ? "Funding did not proceed"
                          : "No schemes qualified"}
                </h3>
                <p>
                  {winner
                    ? `${moneyFormat(winner.amount, c.currency)} requested · ${winner.recipient}`
                    : "No winning scheme was selected. A future round can invite a new decision."}
                </p>
                <p className="muted small-text">
                  {finance
                    ? "This is the recorded community decision. The separate funding panel shows whether money is held, reserved, paid, or refunded; a selected winner alone does not prove payment."
                    : "This records the community’s selection. No funds have been moved or reserved for this round."}
                </p>
              </div>
            </section>
          )}
          {r.status === "SCREENING" && (
            <div className="notice sealed-notice">
              <LockKeyhole size={20} />
              <span>
                <strong>Screening ballots are sealed.</strong> Results and other
                members’ choices appear only after this stage is closed. Your
                own recorded choices remain visible to you.
              </span>
            </div>
          )}
          {r.status === "SELECTION" && (
            <section className="panel padded">
              <h3>Choose the scheme to take forward.</h3>
              <p>
                Screening is complete. Select one qualified scheme. Interim
                selection results stay sealed.
              </p>
              {v.ownSelection ? (
                <div className="form-success">
                  Your recorded selection: {names[v.ownSelection]}
                </div>
              ) : v.eligible && selectionOpen ? (
                <ActionForm
                  operation="round-selection-vote"
                  defaults={base}
                  submit="Seal my selection"
                  confirm="Record your one selection? This ballot cannot be changed."
                >
                  <Select
                    name="schemeId"
                    label="Your chosen scheme"
                    options={qualified.map((s) => ({
                      value: s.id,
                      label: s.title,
                    }))}
                  />
                </ActionForm>
              ) : (
                <p className="notice">
                  {!user
                    ? "Sign in to check your voting eligibility."
                    : !v.eligible
                      ? "You are not an active member in this round’s frozen electorate."
                      : "Selection has closed for ballots. Results will appear when the stage is finalized."}
                </p>
              )}
            </section>
          )}
          {v.selectionResults && (
            <section className="panel padded">
              <h3>Selection results</h3>
              <p className="muted">
                {v.selectionResults.participation} ballots ·{" "}
                {v.selectionResults.quorumRequired} needed for quorum · highest
                vote count wins; ties select no winner.
              </p>
              <div className="round-results">
                {qualified.map((s) => (
                  <div className="row between" key={s.id}>
                    <span>{s.title}</span>
                    <strong>{v.selectionResults!.counts[s.id]} votes</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="round-schemes">
            <h3>
              {v.screeningResults
                ? "Schemes and screening results"
                : "The schemes"}
            </h3>
            {r.schemes.length ? (
              r.schemes.map((s) => {
                const result = v.screeningResults?.find(
                  (x) => x.schemeId === s.id,
                );
                return (
                  <article className="panel padded" key={s.id}>
                    <div className="row between">
                      <span className="muted small-text">
                        By {s.author.displayName}
                      </span>
                      <Status value={s.status} />
                    </div>
                    <h3>{s.title}</h3>
                    {s.category !== "UNSPECIFIED" && (
                      <Badge>{titleCase(s.category)}</Badge>
                    )}
                    <p className="prewrap">{s.description}</p>
                    <div className="round-request">
                      <strong>{moneyFormat(s.amount, c.currency)}</strong>
                      <span>Requested for {s.recipient}</span>
                    </div>
                    {s.supportingUrl && (
                      <a
                        href={s.supportingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link"
                      >
                        Supporting information <ArrowUpRight size={14} />
                      </a>
                    )}
                    {result && (
                      <div className="round-screen-result">
                        <strong>
                          {result.yes} YES · {result.no} NO · {result.abstain}{" "}
                          ABSTAIN
                        </strong>
                        <span>
                          {result.participation}/{result.eligible} ballots ·
                          quorum {result.quorumMet ? "met" : "not met"}
                        </span>
                      </div>
                    )}
                    {r.status === "SCREENING" &&
                      (v.ownScreens[s.id] ? (
                        <p className="form-success">
                          Your recorded screening choice: {v.ownScreens[s.id]}
                        </p>
                      ) : v.eligible && screenOpen ? (
                        <ActionForm
                          operation="round-screen-vote"
                          defaults={{ ...base, schemeId: s.id }}
                          submit="Seal screening vote"
                          confirm="Record your screening choice for this scheme? It cannot be changed."
                        >
                          <Select
                            name="choice"
                            label={`Screen ${s.title}`}
                            options={[
                              {
                                value: "YES",
                                label: "Yes · qualify this scheme",
                              },
                              { value: "NO", label: "No · do not qualify" },
                              {
                                value: "ABSTAIN",
                                label: "Abstain · count my participation",
                              },
                            ]}
                          />
                        </ActionForm>
                      ) : (
                        <p className="muted small-text">
                          {!v.eligible
                            ? "Only active members in the frozen electorate can vote."
                            : "The screening ballot window has ended."}
                        </p>
                      ))}
                  </article>
                );
              })
            ) : (
              <Empty
                title="The next idea could be yours"
                description="Schemes submitted before the deadline will appear here."
              />
            )}
          </section>
          {r.status === "SUBMISSIONS" &&
            r.submissionsCloseAt > now &&
            (v.canSubmit ? (
              <section className="panel padded" id="submit-scheme">
                <h3>Bring an idea to the round.</h3>
                <FundingSchemeForm
                  communityId={c.id}
                  roundId={r.id}
                  currency={c.currency}
                  funded={r.rulesVersion === 2}
                />
              </section>
            ) : (
              <p className="notice">
                {!user ? (
                  <Link href="/login">
                    Sign in to check submission eligibility →
                  </Link>
                ) : r.proposalPolicy === "STAFF" ? (
                  "This round accepts schemes from the administrator and active moderators only."
                ) : (
                  "This round accepts schemes from active community members only."
                )}
              </p>
            ))}
          {(v.screeningBallots || v.selectionBallots) && (
            <section className="panel padded">
              <details>
                <summary>Published individual ballots</summary>
                <p className="muted small-text">
                  Only closed stages are published. Up to 100 ballots from each
                  stage are shown here.
                </p>
                {v.screeningBallots && (
                  <>
                    <h3>Screening ballots</h3>
                    <div
                      className="table-scroll"
                      role="region"
                      aria-label="Published screening ballots"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Scheme</th>
                            <th>Choice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.screeningBallots.slice(0, 100).map((b, i) => (
                            <tr key={i}>
                              <td>{b.user.displayName}</td>
                              <td>{names[b.schemeId]}</td>
                              <td>{b.choice}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="small-text muted">
                      {v.screeningBallots.length} recorded screening ballots in
                      total.
                    </p>
                  </>
                )}
                {v.selectionBallots && (
                  <>
                    <h3>Selection ballots</h3>
                    <div
                      className="table-scroll"
                      role="region"
                      aria-label="Published selection ballots"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Scheme</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.selectionBallots.slice(0, 100).map((b, i) => (
                            <tr key={i}>
                              <td>{b.user.displayName}</td>
                              <td>{names[b.schemeId]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="small-text muted">
                      {v.selectionBallots.length} recorded selection ballots in
                      total.
                    </p>
                  </>
                )}
              </details>
            </section>
          )}
        </div>
        <aside className="round-sidebar">
          <section className="panel padded">
            <h3>Rules, set in advance.</h3>
            <dl className="detail-list">
              <div>
                <dt>Who can submit</dt>
                <dd>
                  {r.proposalPolicy === "EVERYONE"
                    ? "Any signed-in account*"
                    : r.proposalPolicy === "STAFF"
                      ? "Administrator and active moderators"
                      : "Active members"}
                </dd>
              </div>
              <div>
                <dt>Submissions close</dt>
                <dd>{dateTime(r.submissionsCloseAt)}</dd>
              </div>
              <div>
                <dt>Screening rule</dt>
                <dd>More than 50% of YES/NO ballots</dd>
              </div>
              <div>
                <dt>Quorum, each stage</dt>
                <dd>{r.quorumBps / 100}% of the frozen electorate</dd>
              </div>
              <div>
                <dt>Voting weight</dt>
                <dd>One member, one vote</dd>
              </div>
              <div>
                <dt>Selection method</dt>
                <dd>First past the post · one scheme per voter</dd>
              </div>
              <div>
                <dt>Tie rule</dt>
                <dd>No winner selected</dd>
              </div>
              <div>
                <dt>Electorate</dt>
                <dd>
                  {r._count.electorate
                    ? `${r._count.electorate} members frozen for both stages`
                    : "Freezes when screening begins"}
                </dd>
              </div>
              {r.screeningClosesAt && (
                <div>
                  <dt>Screening deadline</dt>
                  <dd>{dateTime(r.screeningClosesAt)}</dd>
                </div>
              )}
              {r.selectionClosesAt && (
                <div>
                  <dt>Selection deadline</dt>
                  <dd>{dateTime(r.selectionClosesAt)}</dd>
                </div>
              )}
            </dl>
            <p className="small-text muted">
              Each voting stage lasts 24 hours. Staff may finalize earlier only
              after every eligible member votes on every scheme in screening, or
              casts their selection. Abstentions count toward screening quorum,
              not approval.
            </p>
            <p className="small-text muted">
              Rules lock when submissions open. Late members do not enter this
              round’s electorate. Suspended or removed members cannot cast new
              votes. Limits: 50 schemes, five per account, and 10,000 eligible
              members. *Suspended and removed accounts cannot submit.
            </p>
          </section>
          {v.staff && !["DECIDED", "CANCELLED"].includes(r.status) && (
            <section className="panel padded">
              <h3>Move the round forward.</h3>
              <div className="stack">
                {r.status === "DRAFT" && (
                  <>
                    <ActionButton
                      operation="round-action"
                      body={{ ...base, action: "open" }}
                      confirm="Open submissions? This locks the published round rules."
                    >
                      Open submissions
                    </ActionButton>
                    <ActionButton
                      operation="round-action"
                      body={{ ...base, action: "cancel" }}
                      confirm="Cancel this unpublished draft?"
                    >
                      Cancel draft
                    </ActionButton>
                  </>
                )}
                {r.status === "SUBMISSIONS" &&
                  (r.submissionsCloseAt <= now ? (
                    <ActionButton
                      operation="round-action"
                      body={{ ...base, action: "screen" }}
                      confirm="Freeze active voters and begin the 24-hour screening stage?"
                    >
                      Begin screening
                    </ActionButton>
                  ) : (
                    <p className="muted small-text">
                      Screening can begin after the submission deadline.
                    </p>
                  ))}
                {r.status === "SCREENING" && (
                  <ActionButton
                    operation="round-action"
                    body={{ ...base, action: "close-screening" }}
                    confirm="Finalize screening? This requires its deadline or every eligible ballot on every scheme."
                  >
                    Close screening
                  </ActionButton>
                )}
                {r.status === "SELECTION" && (
                  <ActionButton
                    operation="round-action"
                    body={{ ...base, action: "close-selection" }}
                    confirm="Finalize selection? This requires its deadline or every eligible ballot."
                  >
                    Close selection
                  </ActionButton>
                )}
              </div>
            </section>
          )}
          <div className="notice">
            <ShieldCheck size={20} />
            <span>
              {finance
                ? "The vote and the funding lifecycle are separate. Follow deposit, payout, and refund receipts in this round’s dedicated pool."
                : "Selection records the community’s preference. The treasury remains unchanged by this round."}{" "}
              <Link href={`/communities/${slug}/activity`}>
                View the decision trail →
              </Link>
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
