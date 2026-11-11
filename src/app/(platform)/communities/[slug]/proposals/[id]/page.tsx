import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, ShieldCheck, ExternalLink } from "lucide-react";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { calculateOutcome } from "@/lib/governance";
import { proposalTypeLabels } from "@/lib/service";
import { dateTime, moneyFormat } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, Status } from "@/components/ui";
import { ActionButton, ActionForm, Select, TextArea } from "@/components/forms";
import { auditVisibilityWhere } from "@/lib/audit-visibility";
export default async function ProposalDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const {
    community: c,
    user,
    isMember,
    isStaff,
  } = await communityContext(slug);
  const p = await db.proposal.findFirst({
    where: { id, communityId: c.id },
    include: {
      proposer: { select: { displayName: true } },
      votes: true,
      eligibleVoters: true,
      execution: { include: { transaction: true } },
    },
  });
  if (!p) notFound();
  const strictRemoval =
    p.governanceProfile === "STRICT" && p.type === "REMOVAL";
  const strictAdminRemoval =
    p.governanceProfile === "STRICT" && p.type === "REMOVAL" && !!p.successorId;
  const removalMembers =
    p.type === "REMOVAL"
      ? await db.communityMembership.findMany({
          where: {
            communityId: c.id,
            userId: {
              in: [p.targetUserId, p.successorId].filter(
                (id): id is string => !!id,
              ),
            },
          },
          select: { userId: true, user: { select: { displayName: true } } },
        })
      : [];
  const subject = removalMembers.find((m) => m.userId === p.targetUserId)?.user
    .displayName;
  const successor = removalMembers.find((m) => m.userId === p.successorId)?.user
    .displayName;
  const result = calculateOutcome(
    p.votes,
    p.eligibleVoters.length,
    p.quorumBps,
    p.thresholdBps,
    p.type === "REMOVAL",
  );
  const myVote = p.votes.find((v) => v.userId === user?.id);
  const eligible = p.eligibleVoters.some((v) => v.userId === user?.id);
  const live =
    p.status === "OPEN" && p.opensAt <= new Date() && p.closesAt > new Date();
  const events = await db.auditEvent.findMany({
    where: {
      communityId: c.id,
      entityId: p.id,
      AND: [
        auditVisibilityWhere(isMember ? [c.id] : [], isStaff ? [c.id] : []),
      ],
    },
    include: { actor: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <Link href={`/communities/${slug}/proposals`} className="back-link">
        <ArrowLeft size={15} />
        All proposals
      </Link>
      <div className="proposal-heading">
        <div className="row">
          <span className="eyebrow">{proposalTypeLabels[p.type]}</span>
          <Status value={p.status} />
        </div>
        <h1>{p.title}</h1>
        <div className="row muted">
          <Avatar name={p.proposer.displayName} small />
          <span>Proposed by {p.proposer.displayName}</span>
          <span>·</span>
          <Clock3 size={15} />
          <span>Closes {dateTime(p.closesAt)}</span>
        </div>
      </div>
      <div className="two-column proposal-detail">
        <section>
          <article className="panel padded">
            <h2>The idea</h2>
            <p className="prewrap proposal-body">{p.description}</p>
            {p.type === "REMOVAL" && (
              <div className="inset">
                <h3>
                  {strictAdminRemoval
                    ? "Administrator removal and succession"
                    : "Member removal"}
                </h3>
                <p>
                  Member under consideration:{" "}
                  <strong>{subject ?? "Recorded member"}</strong>.
                </p>
                {strictAdminRemoval && (
                  <>
                    <p>
                      Published successor:{" "}
                      <strong>
                        {successor ?? "Recorded active successor"}
                      </strong>
                      . Approval removes the incumbent and appoints this
                      successor atomically.
                    </p>
                    <p className="muted small-text">
                      While this ballot is open, direct authority transfer and
                      the successor’s departure or removal are locked. Any
                      active member can finalize under the published deadline
                      rules.
                    </p>
                  </>
                )}
                <p className="muted small-text">
                  {p.governanceProfile === "STRICT" ? "Strict" : "Legacy"}{" "}
                  governance was frozen for this ballot. The subject cannot
                  vote; removal requires an exact two-thirds majority of yes/no
                  votes and the published quorum.
                </p>
              </div>
            )}
            {p.supportingUrl && (
              <a
                href={p.supportingUrl}
                rel="noopener noreferrer"
                target="_blank"
                className="text-link"
              >
                Supporting document <ExternalLink size={15} />
              </a>
            )}
            {p.amount > 0n && (
              <div className="allocation-box">
                <span>
                  {p.type === "FUNDRAISING"
                    ? "Fundraising target"
                    : "Proposed allocation"}
                </span>
                <strong>{moneyFormat(p.amount, c.currency)}</strong>
                {p.recipient && <small>Recipient label: {p.recipient}</small>}
                <p>
                  Simulated funds ·{" "}
                  {p.type === "FUNDRAISING"
                    ? "no funds reserved"
                    : "approval does not execute a payment"}
                </p>
              </div>
            )}
            {p.governanceChange && (
              <div className="inset">
                <h3>Proposed governance rules</h3>
                <pre>{JSON.stringify(p.governanceChange, null, 2)}</pre>
              </div>
            )}
            {p.cancellationReason && (
              <p className="notice">
                Cancellation reason: {p.cancellationReason}
              </p>
            )}
          </article>
          <section className="panel padded">
            <h2>A clear decision trail</h2>
            <div className="timeline">
              {events.map((e) => (
                <div key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {e.action.toLowerCase().replaceAll("_", " ")}
                    </strong>
                    <p>
                      {e.actor.displayName} · {dateTime(e.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {p.execution && (
            <section className="panel padded">
              <h2>Simulated execution receipt</h2>
              <p className="notice">
                <ShieldCheck size={18} />
                No real funds moved. This is a local ledger confirmation.
              </p>
              <dl className="detail-list">
                <div>
                  <dt>Transaction</dt>
                  <dd className="mono">{p.execution.transactionId}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>{p.execution.network}</dd>
                </div>
                <div>
                  <dt>Confirmed locally</dt>
                  <dd>
                    {p.execution.confirmedAt
                      ? dateTime(p.execution.confirmedAt)
                      : "Pending"}
                  </dd>
                </div>
                <div>
                  <dt>Blockchain hash</dt>
                  <dd>None · local simulation</dd>
                </div>
              </dl>
            </section>
          )}
        </section>
        <aside>
          <section className="panel padded vote-panel">
            <div className="row between">
              <h2>The community’s voice</h2>
              <span className="vote-total">
                {result.participation}/{result.eligible}
              </span>
            </div>
            {p.status === "OPEN" && <LiveRefresh />}
            <div className="ballot-bars">
              {[
                { label: "In favor", n: result.yes, t: "yes" },
                { label: "Against", n: result.no, t: "no" },
                { label: "Abstain", n: result.abstain, t: "abstain" },
              ].map((v) => (
                <div key={v.t}>
                  <div className="row between">
                    <span>{v.label}</span>
                    <strong>{v.n}</strong>
                  </div>
                  <div className={`vote-bar ${v.t}`}>
                    <span
                      style={{
                        width: `${result.eligible ? (v.n / result.eligible) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <dl className="detail-list">
              <div>
                <dt>Quorum</dt>
                <dd>
                  {result.participation}/{result.quorumRequired} needed ·{" "}
                  {result.quorumMet ? "met" : "not met"}
                </dd>
              </div>
              <div>
                <dt>Approval rule</dt>
                <dd>
                  {p.type === "REMOVAL"
                    ? "At least exact 2/3 of yes/no votes"
                    : p.thresholdBps === 5001
                      ? ">50% of yes/no votes"
                      : `≥${p.thresholdBps / 100}% of yes/no votes`}
                </dd>
              </div>
              <div>
                <dt>Opens</dt>
                <dd>{dateTime(p.opensAt)}</dd>
              </div>
              <div>
                <dt>Closes</dt>
                <dd>{dateTime(p.closesAt)}</dd>
              </div>
            </dl>
            <p className="muted small-text">
              Abstentions count toward quorum, and are excluded from the
              approval denominator. Invalid choices are rejected. Every eligible
              account has one immutable vote.
            </p>
            {myVote ? (
              <div className="form-success">
                Your vote: {myVote.choice.toLowerCase()}. Thanks for showing up.
              </div>
            ) : live && isMember && eligible ? (
              <ActionForm
                operation="vote"
                defaults={{ communityId: c.id, proposalId: p.id }}
                submit="Record my vote"
                confirm="Record this vote? Ballots cannot be changed after submission."
              >
                <Select
                  name="choice"
                  label="Your vote"
                  options={[
                    { value: "YES", label: "Yes · I support this" },
                    { value: "NO", label: "No · I do not support this" },
                    {
                      value: "ABSTAIN",
                      label: "Abstain · count my participation",
                    },
                  ]}
                />
              </ActionForm>
            ) : (
              <div className="notice">
                {!user
                  ? "Sign in to see whether you can vote."
                  : !eligible
                    ? "You are not in this ballot’s eligibility snapshot."
                    : !isMember
                      ? "An active community membership is required to vote."
                      : "This ballot is not currently accepting votes."}
              </div>
            )}
          </section>
          {(isStaff || (strictRemoval && isMember)) && (
            <section className="panel padded">
              <h2>Decision controls</h2>
              <p className="muted small-text">
                All actions are authorized and recorded on the server.
              </p>
              <div className="stack">
                {isStaff && p.status === "DRAFT" && (
                  <ActionButton
                    operation="proposal-action"
                    body={{
                      communityId: c.id,
                      proposalId: p.id,
                      action: "open",
                    }}
                    confirm="Open this ballot and freeze its voter snapshot?"
                  >
                    Open voting
                  </ActionButton>
                )}
                {["OPEN", "CLOSED"].includes(p.status) && (
                  <ActionButton
                    operation="proposal-action"
                    body={{
                      communityId: c.id,
                      proposalId: p.id,
                      action: "finalize",
                    }}
                    confirm="Calculate and record the final decision? This requires the deadline or all eligible ballots."
                  >
                    Finalize decision
                  </ActionButton>
                )}
                {isStaff && p.status === "APPROVED" && p.type === "FUNDING" && (
                  <ActionButton
                    className="button primary"
                    operation="proposal-action"
                    body={{
                      communityId: c.id,
                      proposalId: p.id,
                      action: "execute",
                    }}
                    confirm={`Record a simulated payout of ${moneyFormat(p.amount, c.currency)}? No real money will move.`}
                  >
                    Execute simulated payout
                  </ActionButton>
                )}
              </div>
              {isStaff &&
                !(p.governanceProfile === "STRICT" && p.status === "OPEN") &&
                ["DRAFT", "OPEN"].includes(p.status) &&
                p.type !== "SUSPENSION_REVIEW" && (
                  <details className="cancel-details">
                    <summary>Cancel this proposal</summary>
                    <ActionForm
                      operation="proposal-action"
                      defaults={{
                        communityId: c.id,
                        proposalId: p.id,
                        action: "cancel",
                      }}
                      submit="Record cancellation"
                      confirm="Cancel this proposal? Its votes and history will be preserved."
                    >
                      <TextArea name="reason" label="Cancellation reason" />
                    </ActionForm>
                  </details>
                )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
