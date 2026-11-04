import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  ArrowRight,
  Clock3,
  Vote,
  Network,
  ChartNoAxesCombined,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { parseFilters, analyticsHref } from "@/lib/analytics-core";
import {
  CommunityCard,
  Empty,
  PageHeading,
  ProposalCard,
  SectionTitle,
  TransactionTable,
} from "@/components/ui";
import {
  CashFlowRows,
  Definition,
  Metric,
  PanelHeading,
  SavedViews,
  TrendChart,
} from "@/components/analytics-ui";
import { CustomizeDashboard } from "@/components/analytics-controls";
import { NetworkArt } from "@/components/network-art";
import { ActionButton } from "@/components/forms";
import { dateTime, moneyFormat } from "@/lib/format";
export default async function Dashboard() {
  const user = await requireUser();
  const report = await getAnalytics(user.id, parseFilters({}));
  const ids = report.ids;
  const now = new Date();
  const needed = {
    communityId: { in: ids },
    status: "OPEN" as const,
    opensAt: { lte: now },
    closesAt: { gt: now },
    eligibleVoters: { some: { userId: user.id } },
    votes: { none: { userId: user.id } },
  };
  const [ballots, ballotCount, applications, notifications, transactions] =
    await Promise.all([
      db.proposal.findMany({
        where: needed,
        include: {
          community: true,
          votes: true,
          _count: { select: { votes: true, eligibleVoters: true } },
        },
        orderBy: { closesAt: "asc" },
        take: 3,
      }),
      db.proposal.count({ where: needed }),
      db.membershipApplication.findMany({
        where: { userId: user.id, status: "PENDING" },
        include: { community: true },
      }),
      db.notification.findMany({
        where: { userId: user.id, readAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.ledgerTransaction.findMany({
        where: { initiatedById: user.id, communityId: { in: ids } },
        include: {
          initiatedBy: { select: { displayName: true } },
          proposal: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
  const show = (name: string) =>
    report.widgets.includes(name as (typeof report.widgets)[number]);
  const firstMoney = report.money[0];
  return (
    <>
      <PageHeading
        eyebrow="YOUR NETWORK. YOUR NEXT CHAPTER."
        title={`Good to see you, ${user.displayName.split(" ")[0]}.`}
        description="A simple pulse on your communities. A deeper view whenever you want it."
        action={
          <div className="heading-actions">
            <CustomizeDashboard widgets={report.widgets} />
            <Link href="/communities/new" className="button primary">
              <Plus size={16} />
              Create community
            </Link>
          </div>
        }
      />
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="protocol-kicker">
            <span className="live-dot" />
            COLLECTIVE POTENTIAL, CONNECTED
          </span>
          <h2>
            More than a network.
            <br />
            <span>A force for growth.</span>
          </h2>
          <p>
            Bring people together. Give ideas a voice. Build a shared future
            with a clear view of every decision.
          </p>
          <div className="row">
            <Link href="/analytics" className="button primary">
              Explore your analytics <ArrowUpRight size={17} />
            </Link>
            <Link
              href={ballotCount ? "#your-votes" : "/explore"}
              className="hero-secondary"
            >
              {ballotCount
                ? `${ballotCount} decisions need you`
                : "Find your people"}{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-microcopy">
            <span>
              <Network size={13} />
              {report.selected.length} communities
            </span>
            <span>
              <Vote size={13} />
              {report.governance.cast} ballots in 30 days
            </span>
            <span>
              <ChartNoAxesCombined size={13} />
              Every number, traceable
            </span>
          </div>
        </div>
        <NetworkArt compact />
      </section>
      <div className="analytics-metric-grid dashboard-metrics">
        {show("treasury") &&
          report.money.map((m) => (
            <Metric
              key={m.currency}
              label={`Shared treasury · ${m.currency}`}
              value={moneyFormat(m.current, m.currency)}
              detail={`${moneyFormat(m.incoming, m.currency)} contributed in 30 days`}
              href={analyticsHref("treasury", report.filters, {
                currency: m.currency as "USD" | "BDT" | "EUR",
              })}
              accent="cyan"
            />
          ))}
        {show("votes") && (
          <Metric
            label="Your voice is needed"
            value={String(ballotCount).padStart(2, "0")}
            detail="Open, eligible decisions awaiting your vote"
            icon="vote"
            href="#your-votes"
          />
        )}
        {show("network") && (
          <Metric
            label="Your connected collective"
            value={String(report.peers.length).padStart(2, "0")}
            detail="Distinct active peers across your communities"
            icon="network"
            href="/analytics/network"
            accent="pink"
          />
        )}
        {show("communities") && (
          <Metric
            label="Communities you belong to"
            value={String(report.selected.length).padStart(2, "0")}
            detail={`${applications.length} pending membership applications`}
            icon="users"
            href="/explore"
          />
        )}
      </div>
      {show("treasury") && (
        <div className="dashboard-analysis-grid">
          <section className="panel padded">
            <PanelHeading
              title="Your collective, in motion"
              description={
                firstMoney
                  ? `${firstMoney.currency} treasury · last 30 days`
                  : "Your recorded history starts with a contribution."
              }
              href="/analytics/treasury"
              label="Go deeper"
            />
            {firstMoney ? (
              <>
                <div className="trend-headline">
                  <strong>
                    {moneyFormat(firstMoney.closing, firstMoney.currency)}
                  </strong>
                  <span>period-end balance</span>
                </div>
                <TrendChart
                  points={firstMoney.trend}
                  currency={firstMoney.currency}
                  filters={report.filters}
                  title="30-day treasury movement"
                />
                {report.money.length > 1 && (
                  <Definition>
                    This chart shows {firstMoney.currency}. Other currencies are
                    reported separately in Treasury analytics.
                  </Definition>
                )}
              </>
            ) : (
              <Empty
                title="The next chapter is yours"
                description="Join a community to start following its treasury."
              />
            )}
          </section>
          <section className="panel padded">
            <PanelHeading
              title="Follow the flow"
              description="30 days of collective funding"
              href="/analytics/treasury"
            />
            <CashFlowRows report={report} />
            <Link href="/analytics/records" className="source-link">
              <span className="source-icon">
                <ChartNoAxesCombined size={17} />
              </span>
              <span>
                <strong>A number is just the beginning.</strong>
                <small>Inspect the records behind it.</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
          </section>
        </div>
      )}
      {show("communities") && (
        <>
          <SectionTitle
            title="Your communities"
            href="/explore"
            label="Discover your next connection"
          />
          {report.memberships.length ? (
            <div className="cards-grid">
              {report.memberships.map((m) => (
                <CommunityCard
                  key={m.id}
                  community={{
                    ...m.community,
                    _count: {
                      memberships: report.members.filter(
                        (member) =>
                          member.communityId === m.communityId &&
                          member.status === "ACTIVE",
                      ).length,
                      proposals: report.proposals.filter(
                        (p) => p.communityId === m.communityId,
                      ).length,
                    },
                  }}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="Find your people. Build your future."
              description="Join a community or start one around a shared purpose."
              action={
                <Link href="/explore" className="button primary">
                  Explore communities
                </Link>
              }
            />
          )}
        </>
      )}
      {applications.length > 0 && (
        <section className="panel padded">
          <PanelHeading
            title="Your next connections"
            description="Membership applications awaiting a recorded decision."
          />
          {applications.map((a) => (
            <Link
              key={a.id}
              className="list-row"
              href={`/communities/${a.community.slug}/members`}
            >
              <span>
                <strong>{a.community.name}</strong>
                <small>
                  Pledged{" "}
                  {moneyFormat(a.proposedContribution, a.community.currency)}
                </small>
              </span>
              <span className="badge neutral">Pending</span>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </section>
      )}
      {show("votes") && (
        <section id="your-votes">
          <SectionTitle
            title="Your voice moves the network."
            href="/analytics/governance"
            label="Understand the decisions"
          />
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
              title="You’re up to date."
              description="Open decisions that need your vote will appear here."
            />
          )}
        </section>
      )}
      <div className="analytics-two-col">
        {show("activity") && (
          <section className="panel padded">
            <PanelHeading
              title="Signals from your communities"
              href="/analytics/records?dataset=activity"
            />
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
              <p className="muted">You’re caught up with your collective.</p>
            )}
          </section>
        )}
        <section className="panel padded">
          <PanelHeading
            title="A shortcut to your next insight"
            description="Pick up a saved analysis, or start a new question."
            href="/analytics"
            label="Open Analytics"
          />
          <SavedViews report={report} />
          <Link href="/analytics" className="analysis-cta">
            <span>
              Simple on the surface.
              <br />
              <strong>As deep as you want to go.</strong>
            </span>
            <ArrowUpRight size={24} />
          </Link>
        </section>
      </div>
      {show("contributions") && (
        <section className="panel">
          <div className="padded-bottomless">
            <PanelHeading
              title="Your personal funding trail"
              href="/analytics/personal"
              label="Explore your impact"
            />
          </div>
          <TransactionTable transactions={transactions} />
        </section>
      )}
      <div className="dashboard-bottomline">
        <span>
          <Clock3 size={13} />
          Overview: last 30 days · live treasury balances
        </span>
        <Link href="/analytics">
          Want more detail? Follow the data <ArrowRight size={14} />
        </Link>
      </div>
    </>
  );
}
