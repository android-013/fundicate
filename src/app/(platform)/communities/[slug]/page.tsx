import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { moneyFormat, dateFormat } from "@/lib/format";
import {
  Empty,
  ProposalCard,
  SectionTitle,
  Stat,
  Avatar,
} from "@/components/ui";
import { ActionForm, Field, TextArea } from "@/components/forms";
export default async function Overview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const {
    community: c,
    user,
    isMember,
    membership,
  } = await communityContext(slug);
  const [proposals, activity, app, members] = await Promise.all([
    db.proposal.findMany({
      where: { communityId: c.id, status: "OPEN" },
      include: {
        votes: true,
        _count: { select: { votes: true, eligibleVoters: true } },
      },
      orderBy: { closesAt: "asc" },
      take: 3,
    }),
    db.auditEvent.findMany({
      where: { communityId: c.id },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    user
      ? db.membershipApplication.findFirst({
          where: { communityId: c.id, userId: user.id },
          orderBy: { createdAt: "desc" },
        })
      : null,
    db.communityMembership.findMany({
      where: { communityId: c.id, status: "ACTIVE" },
      include: { user: true },
      take: 5,
    }),
  ]);
  const balance = c.accounts.find((a) => a.kind === "TREASURY")?.balance ?? 0n;
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Available treasury"
          value={moneyFormat(balance, c.currency)}
          detail="Simulated funds · ready for community decisions"
        />
        <Stat
          label="A growing collective"
          value={String(c._count.memberships).padStart(2, "0")}
          detail={`Together since ${dateFormat(c.createdAt)}`}
          icon="users"
        />
        <Stat
          label="Open decisions"
          value={String(proposals.length).padStart(2, "0")}
          detail="One eligible member. One vote."
          icon="vote"
        />
      </div>
      <div className="two-column">
        <section>
          <div className="panel padded purpose-panel">
            <span className="eyebrow">WHAT BRINGS US TOGETHER</span>
            <h2>
              A shared purpose.
              <br />A place to make it happen.
            </h2>
            <p className="prewrap">{c.purpose}</p>
            <div className="member-preview">
              {members.map((m) => (
                <Avatar key={m.id} name={m.user.displayName} small />
              ))}
              <Link href={`/communities/${slug}/members`}>
                Meet the collective <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <SectionTitle
            title="Ideas in motion"
            href={`/communities/${slug}/proposals`}
          />
          {proposals.length ? (
            <div className="proposal-grid single">
              {proposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  slug={slug}
                  currency={c.currency}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="The next idea could be yours"
              description="Open funding and governance proposals will appear here."
              action={
                isMember ? (
                  <Link
                    className="button secondary"
                    href={`/communities/${slug}/proposals/new`}
                  >
                    Create a proposal
                  </Link>
                ) : undefined
              }
            />
          )}
        </section>
        <aside>
          <section className="panel padded">
            <span className="eyebrow">YOUR PLACE IN THE COLLECTIVE</span>
            <h2>{isMember ? "You’re part of this." : "Room for one more."}</h2>
            {isMember ? (
              <>
                <p className="muted">
                  Your voice helps shape what comes next. Contribute, propose an
                  idea, or join a vote.
                </p>
                <Link
                  className="button primary"
                  href={`/communities/${slug}/treasury`}
                >
                  Make a contribution <ArrowUpRight size={16} />
                </Link>
              </>
            ) : !user ? (
              <>
                <p className="muted">
                  Sign in to apply. Membership begins with a pledge of at least{" "}
                  {moneyFormat(c.minimumContribution, c.currency)}.
                </p>
                <Link href="/login" className="button primary">
                  Sign in to apply
                </Link>
              </>
            ) : app?.status === "PENDING" ? (
              <div className="notice">
                <Clock3 size={18} />
                Your application is awaiting a community decision. Pledge:{" "}
                {moneyFormat(app.proposedContribution, c.currency)}.
              </div>
            ) : membership && membership.status !== "LEFT" ? (
              <p className="notice">
                Your membership is {membership.status.toLowerCase()}.{" "}
                {membership.suspensionReason ??
                  "Historical records remain available."}
              </p>
            ) : (
              <>
                <p className="muted">
                  Tell us a little about yourself. Minimum pledge:{" "}
                  {moneyFormat(c.minimumContribution, c.currency)}. A pledge
                  does not transfer funds.
                </p>
                {app?.status === "REJECTED" && (
                  <p className="notice">
                    Your previous application was rejected. You may submit a new
                    application.
                  </p>
                )}
                <ActionForm
                  operation="application"
                  defaults={{ communityId: c.id }}
                  submit="Apply to join"
                >
                  <TextArea
                    label="Your introduction"
                    name="introduction"
                    placeholder="Why would you like to be part of this community?"
                  />
                  <Field
                    name="proposedContribution"
                    label={`Your contribution pledge (${c.currency})`}
                    type="number"
                    defaultValue={String(Number(c.minimumContribution) / 100)}
                    min={String(Number(c.minimumContribution) / 100)}
                  />
                  {c.questions.map((q) => (
                    <TextArea
                      key={q.id}
                      label={q.prompt}
                      name={`answer.${q.id}`}
                    />
                  ))}
                </ActionForm>
              </>
            )}
          </section>
          <section className="panel padded">
            <SectionTitle
              title="Latest activity"
              href={`/communities/${slug}/activity`}
            />
            <div className="activity-mini">
              {activity.map((a) => (
                <div key={a.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {a.action.toLowerCase().replaceAll("_", " ")}
                    </strong>
                    <p>
                      {a.actor.displayName} · {dateFormat(a.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
