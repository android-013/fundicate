import Link from "next/link";
import { ArrowUpRight, Plus, Clock3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CommunityCard,
  Empty,
  PageHeading,
  ProposalCard,
  SectionTitle,
  Stat,
  TransactionTable,
} from "@/components/ui";
import { dateTime, moneyFormat } from "@/lib/format";
import { ActionButton } from "@/components/forms";
export default async function Dashboard() {
  const user = await requireUser();
  const [
    memberships,
    applications,
    ballots,
    transactions,
    notifications,
    approved,
  ] = await Promise.all([
    db.communityMembership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        community: {
          include: {
            accounts: true,
            _count: {
              select: {
                memberships: { where: { status: "ACTIVE" } },
                proposals: true,
              },
            },
          },
        },
      },
    }),
    db.membershipApplication.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { community: true },
    }),
    db.proposal.findMany({
      where: {
        status: "OPEN",
        eligibleVoters: { some: { userId: user.id } },
        votes: { none: { userId: user.id } },
      },
      include: {
        community: true,
        votes: true,
        _count: { select: { votes: true, eligibleVoters: true } },
      },
      orderBy: { closesAt: "asc" },
      take: 8,
    }),
    db.ledgerTransaction.findMany({
      where: { initiatedById: user.id },
      include: { initiatedBy: true, proposal: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.proposal.findMany({
      where: {
        status: { in: ["APPROVED", "EXECUTED"] },
        community: {
          memberships: { some: { userId: user.id, status: "ACTIVE" } },
        },
      },
      include: { community: true },
      orderBy: { finalizedAt: "desc" },
      take: 4,
    }),
  ]);
  const currencies = [...new Set(memberships.map((m) => m.community.currency))];
  const balances = currencies.map((currency) => ({
    currency,
    amount: memberships
      .filter((m) => m.community.currency === currency)
      .reduce(
        (s, m) =>
          s +
          (m.community.accounts.find((a) => a.kind === "TREASURY")?.balance ??
            0n),
        0n,
      ),
  }));
  return (
    <>
      <PageHeading
        eyebrow="YOUR COMMUNITY, IN MOTION"
        title={`Good to see you, ${user.displayName.split(" ")[0]}.`}
        description="Here’s what’s happening across your collective."
        action={
          <Link className="button primary" href="/communities/new">
            <Plus size={17} />
            Create community
          </Link>
        }
      />
      <div className="dashboard-banner">
        <div>
          <span className="eyebrow">YOUR VOICE MOVES THINGS FORWARD</span>
          <h2>
            Small contributions.
            <br />
            Bigger possibilities.
          </h2>
          <p>
            {ballots.length
              ? `${ballots.length} open ${ballots.length === 1 ? "decision needs" : "decisions need"} your voice. Make it count.`
              : "You’re all caught up. Find your next shared possibility."}
          </p>
          <Link
            href={ballots.length ? "#your-votes" : "/explore"}
            className="button light-button"
          >
            {ballots.length ? "See your open votes" : "Find your people"}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div />
          <div />
          <span>
            we<span>grow</span>
            <em>together.</em>
          </span>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Shared treasury"
          value={
            balances.length === 1
              ? moneyFormat(balances[0].amount, balances[0].currency)
              : balances.length
                ? `${balances.length} currencies`
                : "$0.00"
          }
          detail={
            balances.length > 1
              ? balances
                  .map((b) => moneyFormat(b.amount, b.currency))
                  .join(" · ")
              : "Across your communities · simulated"
          }
        />
        <Stat
          label="Your communities"
          value={String(memberships.length).padStart(2, "0")}
          detail={`${applications.length} pending membership applications`}
          icon="users"
        />
        <Stat
          label="Your voice is needed"
          value={String(ballots.length).padStart(2, "0")}
          detail="Open ballots awaiting your vote"
          icon="vote"
        />
      </div>
      <SectionTitle
        title="Your communities"
        href="/explore"
        label="Discover more"
      />
      {memberships.length ? (
        <div className="cards-grid">
          {memberships.map((m) => (
            <CommunityCard key={m.id} community={m.community} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your collective starts here"
          description="Join a community, or bring your own people together."
          action={
            <Link href="/explore" className="button primary">
              Explore communities
            </Link>
          }
        />
      )}
      {applications.length > 0 && (
        <section className="panel padded">
          <SectionTitle title="Your pending applications" />
          {applications.map((a) => (
            <div className="list-row" key={a.id}>
              <div>
                <strong>{a.community.name}</strong>
                <p className="muted">
                  Pledged{" "}
                  {moneyFormat(a.proposedContribution, a.community.currency)} ·
                  awaiting a recorded decision
                </p>
              </div>
              <Link
                href={`/communities/${a.community.slug}/members`}
                className="text-link"
              >
                View status ↗
              </Link>
            </div>
          ))}
        </section>
      )}
      <section id="your-votes">
        <SectionTitle title="A little input. A lasting impact." />
        {ballots.length ? (
          <div className="proposal-grid">
            {ballots.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                slug={p.community.slug}
                currency={p.community.currency}
              />
            ))}
          </div>
        ) : (
          <Empty
            title="No votes waiting on you"
            description="New decisions from your communities will appear here."
          />
        )}
      </section>
      <div className="two-column">
        <section className="panel padded">
          <SectionTitle title="Community updates" />
          {notifications.length ? (
            <>
              <div className="notification-list">
                {notifications.map((n) => (
                  <Link key={n.id} href={n.href}>
                    <span className="notification-dot" />
                    <div>
                      <p>{n.message}</p>
                      <small>{dateTime(n.createdAt)}</small>
                    </div>
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </div>
              <ActionButton
                operation="notifications"
                body={{}}
                className="text-button"
              >
                Mark all as read
              </ActionButton>
            </>
          ) : (
            <p className="muted">
              Nothing new. Your community’s next chapter is on its way.
            </p>
          )}
        </section>
        <section className="panel padded">
          <SectionTitle title="Recently decided" />
          {approved.length ? (
            approved.map((p) => (
              <Link
                key={p.id}
                href={`/communities/${p.community.slug}/proposals/${p.id}`}
                className="list-row"
              >
                <div>
                  <strong>{p.title}</strong>
                  <small className="muted">
                    {p.community.name} · {p.status.toLowerCase()}
                  </small>
                </div>
                <Clock3 size={17} />
              </Link>
            ))
          ) : (
            <p className="muted">Approved proposals will appear here.</p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="padded-bottomless">
          <SectionTitle title="Your recent contributions & payouts" />
        </div>
        <TransactionTable transactions={transactions} />
      </section>
    </>
  );
}
