import Link from "next/link";
import {
  ArrowUpRight,
  Database,
  Vote,
  Wallet,
  Network,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import { type AnalyticsReport } from "@/lib/analytics";
import {
  analyticsHref,
  type AnalyticsSection,
  type AnalyticsFilters,
} from "@/lib/analytics-core";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { Avatar, Empty, Status } from "./ui";
import {
  CashFlowRows,
  Definition,
  Distribution,
  Metric,
  NetworkGraph,
  PanelHeading,
  RecordExplorer,
  SavedViews,
  TrendChart,
} from "./analytics-ui";
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
export function AnalyticsSections({
  report: r,
  section,
  userId,
}: {
  report: AnalyticsReport;
  section: AnalyticsSection;
  userId: string;
}) {
  const f = r.filters;
  const record = (
    dataset: "transactions" | "proposals" | "votes" | "members" | "activity",
    changes: Partial<AnalyticsFilters> = {},
  ) =>
    analyticsHref("records", f, {
      dataset,
      page: 1,
      q: "",
      status: "",
      type: "",
      person: undefined,
      cohort: "events",
      ...changes,
    });
  const trend = r.activityTrend;
  if (section === "records")
    return (
      <section className="panel padded">
        <PanelHeading
          title="Follow the data."
          description="Filter, inspect, and export the records behind every metric."
        />
        <RecordExplorer report={r} />
      </section>
    );
  if (section === "treasury")
    return (
      <>
        <div className="analytics-metric-grid">
          {r.money.map((m) => (
            <Metric
              key={m.currency}
              label={`Current treasury · ${m.currency}`}
              value={moneyFormat(m.current, m.currency)}
              detail={`Period-end balance: ${moneyFormat(m.closing, m.currency)}`}
              href={record("transactions")}
              accent="cyan"
            />
          ))}
        </div>
        {r.money.map((m) => (
          <section key={m.currency} className="panel padded">
            <PanelHeading
              title={`${m.currency} treasury, over time`}
              description="Exact opening balance plus the posted net movement in each period."
              href={record("transactions")}
            />
            <div className="chart-summary">
              <div>
                <small>Opening</small>
                <strong>{moneyFormat(m.opening, m.currency)}</strong>
              </div>
              <div>
                <small>Inflows</small>
                <strong className="positive">
                  +{moneyFormat(m.incoming, m.currency)}
                </strong>
              </div>
              <div>
                <small>Outflows</small>
                <strong>{moneyFormat(m.outgoing, m.currency)}</strong>
              </div>
              <div>
                <small>Period close</small>
                <strong>{moneyFormat(m.closing, m.currency)}</strong>
              </div>
            </div>
            <TrendChart
              title={`${m.currency} treasury balance`}
              points={m.trend}
              currency={m.currency}
              filters={f}
            />
            <Definition>
              Opening and closing balances use recorded ledger entries. “Current
              treasury” is the live account balance and can differ when you
              select a historical period.
            </Definition>
          </section>
        ))}
        <div className="analytics-two-col">
          <section className="panel padded">
            <PanelHeading
              title="The shape of a contribution"
              description="Each currency remains separate."
            />
            {r.money.map((m) => (
              <dl className="analysis-facts" key={m.currency}>
                <div>
                  <dt>Unique contributors · {m.currency}</dt>
                  <dd>{m.contributors}</dd>
                </div>
                <div>
                  <dt>Average contribution</dt>
                  <dd>{moneyFormat(m.average, m.currency)}</dd>
                </div>
                <div>
                  <dt>Median contribution</dt>
                  <dd>{moneyFormat(m.median, m.currency)}</dd>
                </div>
                <div>
                  <dt>Unexecuted approved funding, created in period</dt>
                  <dd>{moneyFormat(m.approved, m.currency)}</dd>
                </div>
                <div>
                  <dt>Contribution change vs. preceding equal-length period</dt>
                  <dd>
                    {m.change === null
                      ? "No comparable baseline"
                      : `${m.change > 0 ? "+" : ""}${m.change}%`}
                  </dd>
                </div>
              </dl>
            ))}
            <Definition>
              Averages and even-sized medians round to the nearest minor unit,
              with halves rounded up. Approval does not reserve funds.
            </Definition>
          </section>
          <section className="panel padded">
            <PanelHeading
              title="Contributors, in focus"
              href={record("transactions", { type: "CONTRIBUTION" })}
            />
            <div className="ranking-list">
              {r.contributors.slice(0, 10).map((c, i) => (
                <Link
                  key={c.user.id + c.slug}
                  href={record("transactions", {
                    person: c.user.id,
                    type: "CONTRIBUTION",
                    community: c.slug,
                  })}
                >
                  <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                  <Avatar
                    name={c.user.displayName}
                    url={c.user.avatarUrl}
                    small
                  />
                  <span>
                    <strong>{c.user.displayName}</strong>
                    <small>
                      {c.community} · {c.count} contributions
                    </small>
                  </span>
                  <b>{moneyFormat(c.amount, c.currency)}</b>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
            {!r.contributors.length && (
              <p className="muted">The next contribution starts a new story.</p>
            )}
          </section>
        </div>
      </>
    );
  if (section === "governance")
    return (
      <>
        <div className="analytics-metric-grid">
          <Metric
            label="Ballot participation"
            value={pct(r.governance.turnout)}
            detail={`${r.governance.cast} ballots / ${r.governance.eligible} voter slots`}
            icon="vote"
            href={record("votes", { cohort: "decisions" })}
          />
          <Metric
            label="Approval rate"
            value={pct(r.governance.approvalRate)}
            detail={`${r.governance.passed} passed / ${r.governance.decided} decided`}
            icon="vote"
            accent="cyan"
            href={record("proposals")}
          />
          <Metric
            label="Proposals created"
            value={String(r.proposals.length)}
            detail="Funding, membership, growth, and governance"
            icon="activity"
            href={record("proposals")}
          />
          <Metric
            label="Votes cast in period"
            value={String(r.votes.length)}
            detail="Includes votes on decisions created earlier"
            icon="users"
            accent="pink"
            href={record("votes")}
          />
        </div>
        <div className="analytics-two-col">
          <section className="panel padded">
            <PanelHeading
              title="Every voice has a direction"
              description="Ballots on the decisions created in this period."
            />
            <Distribution
              caption="Yes, no and abstention ballots"
              items={[
                {
                  label: "In favor",
                  count: r.governance.yes,
                  tone: "cyan",
                  href: record("votes", { type: "YES", cohort: "decisions" }),
                },
                {
                  label: "Against",
                  count: r.governance.no,
                  tone: "pink",
                  href: record("votes", { type: "NO", cohort: "decisions" }),
                },
                {
                  label: "Abstained",
                  count: r.governance.abstain,
                  tone: "violet",
                  href: record("votes", {
                    type: "ABSTAIN",
                    cohort: "decisions",
                  }),
                },
              ]}
            />
            <Definition>
              Abstentions count toward quorum, but not the approval denominator.
              Participation is weighted by eligible voter slots across
              proposals, not an average of percentages.
            </Definition>
          </section>
          <section className="panel padded">
            <PanelHeading title="The decision pipeline" />
            <Distribution
              caption="Proposal lifecycle distribution"
              items={[
                "DRAFT",
                "OPEN",
                "APPROVED",
                "REJECTED",
                "EXECUTED",
                "CANCELLED",
              ].map((status) => ({
                label: titleCase(status),
                count: r.proposals.filter((p) => p.status === status).length,
                href: record("proposals", { status }),
              }))}
            />
          </section>
        </div>
        {trend && (
          <section className="panel padded">
            <PanelHeading
              title="Participation in motion"
              description="Every recorded vote in the selected time window."
              href={record("votes")}
            />
            <TrendChart
              title="Votes recorded over time"
              points={trend}
              metric="votes"
              currency="USD"
              filters={f}
            />
          </section>
        )}
        <section className="panel padded">
          <PanelHeading
            title="Go proposal by proposal"
            description="Audit the exact electorate, votes, quorum and outcome."
          />
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Proposal governance analysis"
          >
            <table>
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Status</th>
                  <th>Participation</th>
                  <th>Quorum</th>
                  <th>Yes / no / abstain</th>
                  <th>Recorded outcome</th>
                </tr>
              </thead>
              <tbody>
                {r.proposals.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/communities/${p.community.slug}/proposals/${p.id}`}
                      >
                        <strong>{p.title}</strong>
                        <small>{p.community.name}</small>
                      </Link>
                    </td>
                    <td>
                      <Status value={p.status} />
                    </td>
                    <td>
                      {p.votes.length}/{p._count.eligibleVoters}
                    </td>
                    <td>
                      {p.outcome.quorumMet ? "Met" : "Not met"} ·{" "}
                      {p.outcome.quorumRequired} needed
                    </td>
                    <td>
                      {p.outcome.yes} / {p.outcome.no} / {p.outcome.abstain}
                    </td>
                    <td>
                      {["APPROVED", "REJECTED", "EXECUTED"].includes(p.status)
                        ? titleCase(p.status)
                        : "Not finalized"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Definition>
            Approval rate excludes drafts, open, closed-but-unfinalized, and
            cancelled decisions. Live totals do not predict a final result.
          </Definition>
        </section>
      </>
    );
  if (section === "network")
    return (
      <>
        <div className="analytics-metric-grid">
          <Metric
            label="Connected peers"
            value={String(r.peers.length)}
            detail="Distinct active co-members, excluding you"
            icon="network"
            accent="cyan"
          />
          <Metric
            label="Communities"
            value={String(r.selected.length)}
            detail="Your active memberships in this selection"
            icon="users"
          />
          <Metric
            label="New memberships"
            value={String(r.joined.length)}
            detail="Membership records established during the period"
            icon="users"
            accent="pink"
            href={record("members")}
          />
          <Metric
            label="Community bridges"
            value={String(r.edges.length)}
            detail="Pairs connected by a shared active peer"
            icon="network"
          />
        </div>
        <section className="panel padded">
          <PanelHeading
            title="Your collective is a network."
            description="Follow a community node to analyze that community."
          />
          <NetworkGraph report={r} />
        </section>
        {trend && (
          <section className="panel padded">
            <PanelHeading
              title="New connections, over time"
              description="New membership records by joining date."
              href={record("members")}
            />
            <TrendChart
              title="New memberships"
              points={trend}
              metric="members"
              currency="USD"
              filters={f}
            />
            <Definition>
              Joining history counts memberships, including historical
              memberships. Current active counts reflect today’s state; they are
              not reconstructed historical headcounts.
            </Definition>
          </section>
        )}
        <section className="panel padded">
          <PanelHeading
            title="People powering your collective"
            description="Recorded contributions and votes in the selected period; never a reputation score."
          />
          <div className="peer-grid">
            {r.peers.map((p) => (
              <div className="peer-card" key={p.user.id}>
                <Avatar name={p.user.displayName} url={p.user.avatarUrl} />
                <h3>{p.user.displayName}</h3>
                <span>@{p.user.username}</span>
                <small>
                  {p.communities.length} shared{" "}
                  {p.communities.length === 1 ? "community" : "communities"}
                </small>
                <div>
                  <Link href={record("votes", { person: p.user.id })}>
                    {p.votes} votes ↗
                  </Link>
                  <Link
                    href={record("transactions", {
                      person: p.user.id,
                      type: "CONTRIBUTION",
                    })}
                  >
                    {p.contributions} contributions ↗
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {!r.peers.length && (
            <p className="muted">
              Your shared network will grow as others join your communities.
            </p>
          )}
        </section>
      </>
    );
  if (section === "personal")
    return (
      <>
        <div className="analytics-metric-grid">
          {r.money.map((m) => (
            <Metric
              label={`Your contributions · ${m.currency}`}
              value={moneyFormat(m.own, m.currency)}
              detail="Your recorded inflows during the selected period"
              icon="wallet"
              key={m.currency}
              href={record("transactions", {
                person: userId,
                type: "CONTRIBUTION",
              })}
              accent="cyan"
            />
          ))}
          <Metric
            label="Your participation"
            value={
              r.personal.eligible
                ? `${Math.round((r.personal.votes * 10000) / r.personal.eligible) / 100}%`
                : "—"
            }
            detail={`${r.personal.votes} votes / ${r.personal.eligible} eligible voter slots`}
            icon="vote"
            href={record("votes", { person: userId, cohort: "decisions" })}
          />
          <Metric
            label="Ideas you brought forward"
            value={String(r.personal.proposals.length)}
            detail="Your proposals created in this period"
            icon="activity"
            href={record("proposals", { person: userId })}
          />
        </div>
        <div className="analytics-two-col">
          <section className="panel padded">
            <PanelHeading
              title="Your voice, on the record"
              href={record("votes", { person: userId })}
            />
            {r.personal.voteActivity.slice(0, 12).map((v) => (
              <Link
                className="list-row"
                key={v.id}
                href={`/analytics/inspect/votes/${v.id}`}
              >
                <div>
                  <strong>{v.proposal.title}</strong>
                  <small>
                    {v.proposal.community.name} · {dateTime(v.createdAt)}
                  </small>
                </div>
                <span className="choice-chip">{v.choice}</span>
                <ArrowUpRight size={14} />
              </Link>
            ))}
            {!r.personal.voteActivity.length && (
              <p className="muted">Your recorded votes will appear here.</p>
            )}
          </section>
          <section className="panel padded">
            <PanelHeading
              title="Your funding trail"
              href={record("transactions", { person: userId })}
            />
            {r.personal.transactions.slice(0, 12).map((t) => (
              <Link
                className="list-row"
                key={t.id}
                href={`/analytics/inspect/transactions/${t.id}`}
              >
                <div>
                  <strong>{titleCase(t.type)}</strong>
                  <small>
                    {t.community.name} · {dateTime(t.createdAt)}
                  </small>
                </div>
                <b>{moneyFormat(t.amount, t.currency)}</b>
                <ArrowUpRight size={14} />
              </Link>
            ))}
            {!r.personal.transactions.length && (
              <p className="muted">
                Make a contribution to start your personal funding trail.
              </p>
            )}
          </section>
        </div>
        <Definition>
          Your contribution totals exclude payouts you initiated as staff. Your
          funding trail includes both, with each transaction explicitly labeled.
        </Definition>
      </>
    );
  return (
    <>
      <div className="analytics-intro">
        <div>
          <span className="eyebrow">THE BIG PICTURE. EVERY LITTLE DETAIL.</span>
          <h2>
            Your collective,
            <br />
            <span>in perspective.</span>
          </h2>
          <p>
            A clear view of shared resources, community decisions, and the
            people moving things forward.
          </p>
        </div>
        <div className="analysis-pulse">
          <span className="pulse-ring" />
          <Database size={35} />
          <small>COLLECTIVE ACTIVITY</small>
          <strong>
            {r.transactions.length + r.votes.length + r.activity.length}
          </strong>
          <span>records of shared progress in this period</span>
        </div>
      </div>
      <div className="analytics-metric-grid">
        {r.money.map((m) => (
          <Metric
            key={m.currency}
            label={`Current treasury · ${m.currency}`}
            value={moneyFormat(m.current, m.currency)}
            detail={`${moneyFormat(m.incoming, m.currency)} contributed this period`}
            href={analyticsHref("treasury", f)}
            accent="cyan"
          />
        ))}
        <Metric
          label="Voting participation"
          value={pct(r.governance.turnout)}
          detail={`${r.governance.cast} recorded / ${r.governance.eligible} eligible slots`}
          icon="vote"
          href={analyticsHref("governance", f)}
        />
        <Metric
          label="Connected peers"
          value={String(r.peers.length)}
          detail={`${r.joined.length} memberships established in period`}
          icon="network"
          accent="pink"
          href={analyticsHref("network", f)}
        />
      </div>
      <div className="analytics-two-col">
        <section className="panel padded">
          <PanelHeading
            title="Shared resources, growing together"
            description={
              r.money.length > 1
                ? "One series per currency. Choose a currency to focus."
                : "Treasury movement from posted ledger records."
            }
            href={analyticsHref("treasury", f)}
          />
          {r.money.map((m) => (
            <div key={m.currency} className="currency-chart">
              <div className="row between">
                <span className="currency-label">{m.currency}</span>
                <strong>
                  {moneyFormat(m.closing, m.currency)} at period end
                </strong>
              </div>
              <TrendChart
                title={`${m.currency} treasury trend`}
                points={m.trend}
                currency={m.currency}
                filters={f}
              />
            </div>
          ))}
          {!r.money.length && (
            <Empty
              title="A new network of possibility"
              description="Join or create a community to begin building a recorded history."
            />
          )}
        </section>
        <section className="panel padded">
          <PanelHeading
            title="Where the money moved"
            href={analyticsHref("treasury", f)}
          />
          <CashFlowRows report={r} />
          <Definition>
            Amounts in different currencies are never added together or
            converted using an assumed exchange rate.
          </Definition>
        </section>
      </div>
      <div className="deep-dive-grid">
        {[
          {
            section: "treasury",
            title: "Follow the funding.",
            text: "Balances, contribution patterns, contributors, and source ledger entries.",
            icon: Wallet,
          },
          {
            section: "governance",
            title: "Understand the decisions.",
            text: "Turnout, thresholds, vote composition, and proposal-by-proposal outcomes.",
            icon: Vote,
          },
          {
            section: "network",
            title: "See your connections.",
            text: "Shared peers, community bridges, and membership growth.",
            icon: Network,
          },
          {
            section: "personal",
            title: "Measure your impact.",
            text: "Your contributions, your voice, and the ideas you brought forward.",
            icon: TrendingUp,
          },
          {
            section: "records",
            title: "Go all the way to the source.",
            text: "Search, filter, inspect and export the records behind the charts.",
            icon: Database,
          },
        ].map((item) => (
          <Link
            className="deep-dive-card"
            key={item.section}
            href={analyticsHref(item.section as AnalyticsSection, f)}
          >
            <item.icon size={23} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <span>
              Open analysis <ArrowUpRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      <div className="analytics-two-col">
        <section className="panel padded">
          <PanelHeading
            title="Your saved rabbit holes"
            description="An easy way back to the questions that matter."
          />
          <SavedViews report={r} />
        </section>
        <section className="panel padded">
          <PanelHeading title="A transparent view of the numbers" />
          <div className="rule">
            <span className="rule-icon">
              <ShieldCheck size={17} />
            </span>
            <div>
              <h3>Recorded, never invented.</h3>
              <p>
                Every chart comes from application records. Empty periods remain
                empty. Local simulation never becomes a claimed blockchain
                transaction.
              </p>
            </div>
          </div>
          <Link className="text-link" href={record("activity")}>
            Inspect the audit history <ArrowUpRight size={14} />
          </Link>
        </section>
      </div>
    </>
  );
}
