"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Star, MessageSquare, ShieldCheck } from "lucide-react";
import { ActionForm, Select, TextArea } from "./forms";
import { Badge, Empty } from "./ui";
import { reputationDimensionLabel } from "@/lib/reputation-core";
import type { getCommunityReputation } from "@/lib/reputation";

type View = Awaited<ReturnType<typeof getCommunityReputation>>;
const scoreOptions = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${value} ${value === 1 ? "star" : "stars"}`,
}));

function ReviewComposer({
  communityId,
  options,
}: {
  communityId: string;
  options: View["options"];
}) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState(options[0]?.key ?? "");
  const selected =
    options.find((option) => option.key === selectedKey) ?? options[0];
  if (!selected)
    return (
      <p className="muted">
        No unreviewed targets from your recent completed participation. Taking
        part in a completed round or proposal opens eligible reviews here. Being
        on an electorate list alone does not qualify.
      </p>
    );
  return (
    <>
      <label className="field" htmlFor={id}>
        <span>Choose someone or something you participated with</span>
        <select
          id={id}
          value={selected.key}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label} · {option.targetType.toLowerCase()} ·{" "}
              {reputationDimensionLabel(option.dimension)}
            </option>
          ))}
        </select>
      </label>
      <p>
        <Link href={selected.href}>View the original participation record</Link>
      </p>
      <ActionForm
        key={selected.key}
        operation="reputation-create"
        submit="Publish review"
        defaults={{
          communityId,
          targetType: selected.targetType,
          targetId: selected.targetId,
          dimension: selected.dimension,
          contextType: selected.contextType,
          contextId: selected.contextId,
        }}
      >
        <Select
          name="score"
          label="Your rating"
          options={scoreOptions}
          defaultValue="5"
        />
        <TextArea
          name="text"
          label="Your written review"
          placeholder="Describe your experience in at least 20 characters. Keep feedback specific and respectful."
        />
      </ActionForm>
    </>
  );
}

export function ReputationHub({
  communityId,
  view,
}: {
  communityId: string;
  view: View;
}) {
  return (
    <div className="reputation-hub">
      <div className="section-title">
        <div>
          <h2>Trust grows through shared experience.</h2>
          <p className="muted">
            Member, scheme, proposal and round reviews come from people who
            actually took part.
          </p>
        </div>
        <Badge tone="green">
          <ShieldCheck size={14} /> Participation qualified
        </Badge>
      </div>
      <div className="notice">
        <MessageSquare size={20} />
        <span>
          Presentation and participation ratings are separate from
          receipt-backed recipient experience. A confirmed transfer proves a
          payment; it does not prove a project succeeded. Local simulated
          receipts remain simulated.
        </span>
      </div>
      <section className="panel">
        <h3>Leave a review</h3>
        <p className="muted">
          One review per target and dimension. You can revise it later; prior
          versions remain in history. Eligible choices use your{" "}
          {view.contextLimit} most recent completed rounds and proposals.
        </p>
        {view.canWrite ? (
          <ReviewComposer communityId={communityId} options={view.options} />
        ) : (
          <p className="muted">
            Sign in with an active community membership to write a review.
            Recorded shared participation is also required.
          </p>
        )}
      </section>
      <section className="panel">
        <h3>At a glance</h3>
        <p className="muted">
          Averages use the latest version of every visible review in this
          community. Hidden reviews stay in history and do not affect these
          averages.
        </p>
        {view.aggregates.length ? (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">
                Community reputation by target and dimension
              </caption>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Dimension</th>
                  <th>Reviews</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {view.aggregates.map((group) => {
                  const review = view.reviews.find(
                    (row) =>
                      row.targetType === group.targetType &&
                      row.targetId === group.targetId,
                  );
                  return (
                    <tr
                      key={`${group.targetType}:${group.targetId}:${group.dimension}`}
                    >
                      <td>
                        {review ? (
                          <Link href={review.href}>{review.title}</Link>
                        ) : (
                          `${group.targetType.toLowerCase()} ${group.targetId}`
                        )}
                      </td>
                      <td>{reputationDimensionLabel(group.dimension)}</td>
                      <td>{group.count}</td>
                      <td>{group.average.toFixed(2)} / 5</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No visible reviews yet.</p>
        )}
      </section>
      <div className="section-title">
        <div>
          <h3>Community reviews</h3>
          <p className="muted">
            Showing the latest {view.reviews.length} of {view.totalReviews}{" "}
            reviews. Aggregates above include all visible reviews.
          </p>
        </div>
      </div>
      {!view.reviews.length && (
        <Empty
          title="Every useful review starts with shared experience"
          description="Finish a round or proposal together, then share thoughtful feedback."
        />
      )}
      {view.reviews.map((review) => {
        const latestModeration = review.moderationHistory.at(-1);
        const appealed =
          latestModeration &&
          review.appeals.some(
            (appeal) => appeal.moderationId === latestModeration.id,
          );
        return (
          <article key={review.id} className="panel" id={`review-${review.id}`}>
            <div className="row between">
              <div>
                <h3>
                  <Link href={review.href}>{review.title}</Link>
                </h3>
                <p className="muted">
                  {review.author.displayName} ·{" "}
                  {reputationDimensionLabel(review.dimension)} ·{" "}
                  {new Date(review.createdAt).toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                  })}
                </p>
              </div>
              <Badge tone={review.hidden ? "red" : "green"}>
                {review.hidden ? "Hidden" : "Visible"}
              </Badge>
            </div>
            {review.score !== null && (
              <p aria-label={`${review.score} out of 5 stars`} className="row">
                <Star size={17} aria-hidden="true" />{" "}
                <strong>{review.score} / 5</strong>
              </p>
            )}
            {review.text !== null ? (
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {review.text}
              </p>
            ) : (
              <p className="muted">
                This review is hidden by moderation. Its text and rating are
                excluded from the public view.
              </p>
            )}
            <p className="muted">
              Version {review.revision}.{" "}
              <Link
                href={
                  review.contextType === "PROPOSAL"
                    ? `/communities/${review.href.split("/")[2]}/proposals/${review.contextId}`
                    : `/communities/${review.href.split("/")[2]}/rounds/${review.contextId}`
                }
              >
                Participation source
              </Link>
            </p>
            {review.canEdit && (
              <details>
                <summary>Edit your review</summary>
                <ActionForm
                  operation="reputation-edit"
                  submit="Save new version"
                  defaults={{ communityId, reviewId: review.id }}
                >
                  <Select
                    name="score"
                    label="Revised rating"
                    options={scoreOptions}
                    defaultValue={String(review.score ?? 5)}
                  />
                  <TextArea
                    name="text"
                    label="Revised written review"
                    defaultValue={review.text ?? ""}
                  />
                </ActionForm>
                <p className="muted">
                  Editing a hidden review keeps it hidden until an unconflicted
                  moderator restores it.
                </p>
              </details>
            )}
            {review.canReport && (
              <details>
                <summary>Report abuse</summary>
                <ActionForm
                  operation="reputation-report"
                  submit="Record abuse report"
                  defaults={{ communityId, reviewId: review.id }}
                >
                  <TextArea
                    name="reason"
                    label="Reason for reporting"
                    placeholder="Explain the specific abuse in at least 10 characters. Reports are visible to community staff."
                  />
                </ActionForm>
              </details>
            )}
            {review.canEdit &&
              review.hidden &&
              latestModeration &&
              !appealed && (
                <details>
                  <summary>Appeal the hiding decision</summary>
                  <ActionForm
                    operation="reputation-appeal"
                    submit="Submit appeal"
                    defaults={{
                      communityId,
                      reviewId: review.id,
                      moderationId: latestModeration.id,
                    }}
                  >
                    <TextArea
                      name="statement"
                      label="Your appeal"
                      placeholder="Explain why this decision should be reconsidered, in at least 20 characters."
                    />
                  </ActionForm>
                  <p className="muted">
                    A different, unconflicted moderator must decide an appeal.
                  </p>
                </details>
              )}
            {review.canModerate && (
              <details>
                <summary>
                  {review.hidden
                    ? "Review visibility and appeals"
                    : "Moderate this review"}
                </summary>
                <ActionForm
                  operation="reputation-moderate"
                  submit={review.hidden ? "Restore review" : "Hide review"}
                  defaults={{
                    communityId,
                    reviewId: review.id,
                    action: review.hidden ? "RESTORE" : "HIDE",
                  }}
                >
                  <TextArea
                    name="reason"
                    label="Public moderation reason"
                    placeholder="Record a specific public reason in at least 10 characters."
                  />
                </ActionForm>
              </details>
            )}
            {(review.moderationHistory.length > 0 ||
              review.history.length > 0 ||
              review.reports.length > 0 ||
              review.appeals.length > 0) && (
              <details>
                <summary>Review history and accountability</summary>
                {review.moderationHistory.map((event) => (
                  <div className="inset" key={event.id}>
                    <strong>
                      {event.action === "HIDE" ? "Hidden" : "Restored"} by{" "}
                      {event.actor.displayName}
                    </strong>
                    <p>{event.reason}</p>
                  </div>
                ))}
                {review.history.map((revision) => (
                  <div className="inset" key={revision.revision}>
                    <strong>
                      Version {revision.revision} · {revision.score} / 5
                    </strong>
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {revision.text}
                    </p>
                  </div>
                ))}
                {review.reports.map((report) => (
                  <div className="inset" key={report.id}>
                    <strong>
                      Abuse report · {report.reporter.displayName}
                    </strong>
                    <p>{report.reason}</p>
                  </div>
                ))}
                {review.appeals.map((appeal) => (
                  <div className="inset" key={appeal.id}>
                    <strong>Author appeal</strong>
                    <p>{appeal.statement}</p>
                  </div>
                ))}
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
