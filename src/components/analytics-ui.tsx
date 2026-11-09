import Link from "next/link";
import { ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Database,
  Download,
  Info,
  ShieldCheck,
  Network,
  Vote,
  Wallet,
  Users,
  Activity,
} from "lucide-react";
import {
  analyticsHref,
  type AnalyticsFilters,
  type AnalyticsSection,
  type TrendPoint,
} from "@/lib/analytics-core";
import { type AnalyticsReport, reportRecords } from "@/lib/analytics";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { Empty, Status } from "./ui";
import { ActionButton } from "./forms";
import { SaveAnalyticsView } from "./analytics-controls";

export function Metric({
  label,
  value,
  detail,
  href,
  accent = "violet",
  icon = "wallet",
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  accent?: string;
  icon?: string;
}) {
  const Icon =
    icon === "vote"
      ? Vote
      : icon === "users"
        ? Users
        : icon === "network"
          ? Network
          : icon === "activity"
            ? Activity
            : Wallet;
  const content = (
    <>
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${accent}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      {href && (
        <span className="metric-drill">
          Explore data <ArrowUpRight size={13} />
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={`metric-card ${accent}`}>
      {content}
    </Link>
  ) : (
    <div className={`metric-card ${accent}`}>{content}</div>
  );
}
export function AnalyticsNav({
  section,
  filters,
}: {
  section: AnalyticsSection;
  filters: AnalyticsFilters;
}) {
  return (
    <nav className="analysis-tabs" aria-label="Analysis areas">
      {[
        { id: "overview", name: "Overview", icon: Activity },
        { id: "treasury", name: "Treasury", icon: Wallet },
        { id: "governance", name: "Governance", icon: Vote },
        { id: "network", name: "Network & growth", icon: Network },
        { id: "personal", name: "My impact", icon: Users },
        { id: "records", name: "Data explorer", icon: Database },
      ].map((item) => (
        <Link
          href={analyticsHref(item.id as AnalyticsSection, filters, {
            page: 1,
          })}
          className={section === item.id ? "active" : ""}
          aria-current={section === item.id ? "page" : undefined}
          key={item.id}
        >
          <item.icon size={15} />
          {item.name}
        </Link>
      ))}
      <Link href="/analytics/system">
        <Database size={15} />
        System insights
      </Link>
    </nav>
  );
}
export function ReportFilters({
  report,
  section,
}: {
  report: AnalyticsReport;
  section: AnalyticsSection;
}) {
  const f = report.filters;
  return (
    <div className="analysis-toolbar">
      <form
        className="report-filters"
        action={`/analytics${section === "overview" ? "" : "/" + section}`}
      >
        <label>
          <span>Community</span>
          <select name="community" defaultValue={f.community}>
            <option value="all">All my communities</option>
            {report.memberships.map((m) => (
              <option key={m.communityId} value={m.community.slug}>
                {m.community.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Time period</span>
          <select name="range" defaultValue={f.range}>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last 365 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates (UTC)</option>
          </select>
        </label>
        <label>
          <span>Currency</span>
          <select name="currency" defaultValue={f.currency}>
            <option value="all">All currencies · separate</option>
            {["USD", "BDT", "EUR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <details className="custom-dates" open={f.range === "custom"}>
          <summary>Custom dates</summary>
          <label>
            <span>From (UTC)</span>
            <input type="date" name="from" defaultValue={f.from} />
          </label>
          <label>
            <span>Through (UTC)</span>
            <input type="date" name="to" defaultValue={f.to} />
          </label>
        </details>
        {section === "records" && (
          <>
            {(
              ["dataset", "cohort", "q", "status", "type", "person"] as const
            ).map(
              (key) =>
                f[key] && (
                  <input key={key} type="hidden" name={key} value={f[key]} />
                ),
            )}
          </>
        )}
        <button className="button primary" type="submit">
          Apply filters
        </button>
      </form>
      <SaveAnalyticsView filters={f} section={section} />
    </div>
  );
}
export function PanelHeading({
  title,
  description,
  href,
  label = "Explore data",
}: {
  title: string;
  description?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="chart-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {href && (
        <Link className="text-link" href={href}>
          {label}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
export function Definition({ children }: { children: ReactNode }) {
  return (
    <div className="metric-definition">
      <Info size={14} />
      <span>{children}</span>
    </div>
  );
}
export function TrendChart({
  points,
  currency,
  metric = "balance",
  filters,
  title,
}: {
  points: TrendPoint[];
  currency: string;
  metric?: "balance" | "incoming" | "votes" | "members";
  filters: AnalyticsFilters;
  title: string;
}) {
  const vals = points.map((p) =>
    metric === "votes"
      ? BigInt(p.votes)
      : metric === "members"
        ? BigInt(p.members)
        : p[metric],
  );
  const max = vals.reduce((a, b) => (a > b ? a : b), 1n);
  const min = vals.reduce((a, b) => (a < b ? a : b), 0n);
  const span = max - min || 1n;
  const x = (i: number) => 32 + (i / Math.max(1, points.length - 1)) * 656;
  const y = (v: bigint) => 190 - Number(((v - min) * 15000n) / span) / 100;
  const line = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const money = metric === "balance" || metric === "incoming";
  const endOfBucket = (date: string) => {
    const d = new Date(
      date.length === 7 ? date + "-01T00:00:00Z" : date + "T00:00:00Z",
    );
    if (date.length === 7) d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCDate(d.getUTCDate() + 1);
    return new Date(d.getTime() - 1).toISOString().slice(0, 10);
  };
  return (
    <>
      <div className="chart-canvas">
        <svg viewBox="0 0 720 238" role="group" aria-label={title}>
          {[40, 90, 140, 190].map((n) => (
            <line
              key={n}
              x1="30"
              x2="698"
              y1={n}
              y2={n}
              stroke="var(--chart-grid)"
            />
          ))}
          <polygon
            points={`32,200 ${line} ${x(vals.length - 1)},200`}
            fill="var(--chart-area)"
          />
          <polyline
            points={line}
            fill="none"
            stroke="var(--chart-line)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <a
              key={p.date}
              href={analyticsHref("records", filters, {
                dataset:
                  metric === "votes"
                    ? "votes"
                    : metric === "members"
                      ? "members"
                      : "transactions",
                range: "custom",
                from: p.date.length === 7 ? p.date + "-01" : p.date,
                to: endOfBucket(p.date),
                page: 1,
              })}
              aria-label={`${p.label}: ${money ? moneyFormat(vals[i], currency) : vals[i].toString()}. Inspect this period.`}
            >
              <rect
                x={x(i) - Math.max(3, 320 / points.length)}
                y="25"
                width={Math.max(6, 640 / points.length)}
                height="182"
                fill="transparent"
              />
              <circle
                cx={x(i)}
                cy={y(vals[i])}
                r={points.length > 90 ? 2 : 3}
                fill="var(--chart-line)"
              />
              {(i === 0 ||
                i === points.length - 1 ||
                i % Math.max(1, Math.floor(points.length / 5)) === 0) && (
                <text
                  x={x(i)}
                  y="227"
                  textAnchor={
                    i === 0
                      ? "start"
                      : i === points.length - 1
                        ? "end"
                        : "middle"
                  }
                  fill="var(--text-muted)"
                  fontSize="10"
                >
                  {p.label}
                </text>
              )}
              <title>{`${p.label}: ${money ? moneyFormat(vals[i], currency) : vals[i].toString()}`}</title>
            </a>
          ))}
        </svg>
      </div>
      <details className="chart-data">
        <summary>View exact chart values</summary>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${title} data`}
        >
          <table>
            <thead>
              <tr>
                <th>Period (UTC)</th>
                <th>{money ? `Amount (${currency})` : "Count"}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>
                    {money
                      ? moneyFormat(vals[i], currency)
                      : vals[i].toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function Distribution({
  items,
  caption,
}: {
  items: { label: string; count: number; href?: string; tone?: string }[];
  caption: string;
}) {
  const sum = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="distribution">
      <div className="segmented-bar" role="img" aria-label={caption}>
        {items
          .filter((i) => i.count)
          .map((i, n) => (
            <span
              key={i.label}
              className={i.tone ?? ["violet", "cyan", "pink", "muted"][n % 4]}
              style={{ width: `${sum ? (i.count / sum) * 100 : 0}%` }}
            />
          ))}
      </div>
      {items.map((i, n) => {
        const child = (
          <>
            <span
              className={`legend-dot ${i.tone ?? ["violet", "cyan", "pink", "muted"][n % 4]}`}
            />
            <span>{i.label}</span>
            <strong>{i.count}</strong>
            <small>{sum ? Math.round((i.count / sum) * 100) : 0}%</small>
            {i.href && <ArrowUpRight size={12} />}
          </>
        );
        return i.href ? (
          <Link href={i.href} key={i.label} className="distribution-row">
            {child}
          </Link>
        ) : (
          <div key={i.label} className="distribution-row">
            {child}
          </div>
        );
      })}
      {!sum && (
        <p className="muted small-text">No activity in this selection yet.</p>
      )}
    </div>
  );
}
export function NetworkGraph({ report }: { report: AnalyticsReport }) {
  const list = report.selected.slice(0, 12);
  const position = (i: number) => ({
    x:
      list.length === 1
        ? 340
        : 340 + 205 * Math.cos((i * 2 * Math.PI) / list.length),
    y:
      list.length === 1
        ? 150
        : 135 + 85 * Math.sin((i * 2 * Math.PI) / list.length),
  });
  return (
    <div className="network-plot">
      {!list.length ? (
        <Empty
          title="Your network starts here"
          description="Join a community to see the connections you share."
        />
      ) : (
        <svg
          viewBox="0 0 680 330"
          role="group"
          aria-label="Community connections based on shared active peers"
        >
          {report.edges
            .filter(
              (e) =>
                list.some((c) => c.communityId === e.source) &&
                list.some((c) => c.communityId === e.target),
            )
            .map((e) => {
              const a = position(
                  list.findIndex((c) => c.communityId === e.source),
                ),
                b = position(list.findIndex((c) => c.communityId === e.target));
              return (
                <g key={e.source + e.target}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#6f78c6"
                    strokeWidth={Math.min(6, 1 + e.shared)}
                  />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 10}
                    fill="#c8cfea"
                    textAnchor="middle"
                    fontSize="11"
                  >
                    {e.shared} shared {e.shared === 1 ? "peer" : "peers"}
                  </text>
                </g>
              );
            })}
          {list.map((m, i) => {
            const p = position(i);
            const count = report.members.filter(
              (member) =>
                member.communityId === m.communityId &&
                member.status === "ACTIVE",
            ).length;
            return (
              <a
                key={m.communityId}
                href={analyticsHref("network", report.filters, {
                  community: m.community.slug,
                })}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="42"
                  fill="#19233d"
                  stroke={i % 2 ? "#68dee8" : "#aaa1ff"}
                  strokeWidth="2"
                />
                <text
                  x={p.x}
                  y={p.y + 7}
                  fill="#f1f4ff"
                  textAnchor="middle"
                  fontSize="22"
                >
                  {count}
                </text>
                <text
                  x={p.x}
                  y={p.y + 68}
                  fill="#d4dcf3"
                  textAnchor="middle"
                  fontSize="12"
                >
                  {m.community.name.slice(0, 30)}
                </text>
                <text
                  x={p.x}
                  y={p.y + 86}
                  fill="#aebbd5"
                  textAnchor="middle"
                  fontSize="10"
                >
                  ACTIVE MEMBERS
                </text>
              </a>
            );
          })}
        </svg>
      )}
      <Definition>
        Connections mean shared active members, excluding you. This is a
        community network, not a visualization of blockchain transactions.
        {report.selected.length > 12 &&
          " The graph shows the first 12 communities; totals include all selected communities."}
      </Definition>
    </div>
  );
}
export function SavedViews({ report }: { report: AnalyticsReport }) {
  return (
    <div className="saved-views">
      {report.savedViews.length ? (
        report.savedViews.map((v) => {
          const saved = v.filters as { href?: string };
          return (
            <div key={v.id} className="saved-view-item">
              <Link
                href={
                  saved.href?.startsWith("/analytics")
                    ? saved.href
                    : "/analytics"
                }
              >
                <span className="saved-view-symbol">
                  <Database size={15} />
                </span>
                <span>
                  <strong>{v.name}</strong>
                  <small>Saved analysis</small>
                </span>
                <ArrowUpRight size={14} />
              </Link>
              <ActionButton
                operation="analytics-delete-view"
                body={{ id: v.id }}
                className="text-button"
                confirm={`Remove the saved view “${v.name}”?`}
              >
                Remove
              </ActionButton>
            </div>
          );
        })
      ) : (
        <p className="muted small-text">
          Save a filtered analysis to return to it in one click.
        </p>
      )}
    </div>
  );
}
export function RecordExplorer({ report }: { report: AnalyticsReport }) {
  const f = report.filters;
  const all = reportRecords(report);
  const rows = all.slice((f.page - 1) * 25, f.page * 25);
  const base = analyticsHref("records", f, { page: 1 });
  return (
    <>
      <div className="records-controls">
        <form action="/analytics/records">
          <input type="hidden" name="community" value={f.community} />
          <input type="hidden" name="range" value={f.range} />
          <input type="hidden" name="currency" value={f.currency} />
          {f.dataset === "votes" ? (
            <label className="field">
              <span>Vote scope</span>
              <select name="cohort" defaultValue={f.cohort}>
                <option value="events">Votes cast in period</option>
                <option value="decisions">Decisions created in period</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="cohort" value="events" />
          )}
          {f.from && <input type="hidden" name="from" value={f.from} />}{" "}
          {f.to && <input type="hidden" name="to" value={f.to} />}
          <label className="field">
            <span>Dataset</span>
            <select name="dataset" defaultValue={f.dataset}>
              {[
                "transactions",
                "proposals",
                "votes",
                "members",
                "activity",
              ].map((v) => (
                <option value={v} key={v}>
                  {titleCase(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search records</span>
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Name, title, record ID…"
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={f.status}>
              <option value="">All statuses</option>
              {[
                "CONFIRMED",
                "OPEN",
                "APPROVED",
                "EXECUTED",
                "REJECTED",
                "DRAFT",
                "CANCELLED",
                "ACTIVE",
                "SUSPENDED",
                "REMOVED",
                "LEFT",
                "RECORDED",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type / choice</span>
            <input
              name="type"
              defaultValue={f.type}
              placeholder="e.g. CONTRIBUTION"
            />
          </label>
          {f.person && <input type="hidden" name="person" value={f.person} />}
          <button className="button primary" type="submit">
            Explore
          </button>
        </form>
        <a
          className="button secondary"
          href={`/api/analytics/export${base.slice(base.indexOf("?"))}`}
        >
          <Download size={15} />
          Export CSV
        </a>
      </div>
      <div className="record-caption">
        <span>
          {all.length.toLocaleString()} matching records · 25 per page
        </span>
        <span>Up to 10,000 rows per export</span>
      </div>
      {f.person && (
        <p className="active-filter">
          Person filter: {all[0]?.person ?? "selected account"}{" "}
          <Link
            href={analyticsHref("records", f, { person: undefined, page: 1 })}
          >
            Clear person filter ×
          </Link>
        </p>
      )}
      {f.dataset === "votes" && f.cohort === "decisions" && (
        <Definition>
          These are all ballots on decisions created in the selected period. A
          vote’s own timestamp can fall outside that period. This scope
          reconciles exactly to proposal-cohort participation and vote
          composition.
        </Definition>
      )}
      {rows.length ? (
        <div
          className="table-scroll"
          role="region"
          tabIndex={0}
          aria-label="Analytics source records"
        >
          <table className="analysis-records">
            <thead>
              <tr>
                <th>Record / source</th>
                <th>Community</th>
                <th>Person</th>
                <th>Type · status</th>
                <th>Timestamp (UTC)</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={r.href}>
                      <strong>{r.title}</strong>
                      <small className="mono">
                        {r.id.slice(0, 8)} <ArrowUpRight size={11} />
                      </small>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/communities/${r.slug}`}>{r.community}</Link>
                  </td>
                  <td>{r.person}</td>
                  <td>
                    <small>{titleCase(r.type)}</small>
                    <Status value={r.status} />
                  </td>
                  <td>{dateTime(r.date)}</td>
                  <td>
                    {r.amount === null
                      ? "—"
                      : moneyFormat(r.amount, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No matching records"
          description="Try a wider period or clear the status and type filters."
        />
      )}
      <div className="pagination">
        <span>
          Page {f.page} of {Math.max(1, Math.ceil(all.length / 25))}
        </span>
        <div>
          {f.page > 1 && (
            <Link
              className="button secondary"
              href={analyticsHref("records", f, { page: f.page - 1 })}
            >
              Previous
            </Link>
          )}
          {f.page * 25 < all.length && (
            <Link
              className="button secondary"
              href={analyticsHref("records", f, { page: f.page + 1 })}
            >
              Next <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
      <Definition>
        Exports include exactly the current dataset and filters, across all
        matching pages. Amounts include both decimal and integer minor-unit
        columns. A spreadsheet formula prefix is escaped in user-entered text.
      </Definition>
    </>
  );
}
export function CashFlowRows({ report }: { report: AnalyticsReport }) {
  return (
    <div className="cashflow-rows">
      {report.money.map((m) => (
        <div key={m.currency}>
          <div className="row between">
            <span className="currency-label">{m.currency}</span>
            <strong>{moneyFormat(m.net, m.currency)} net</strong>
          </div>
          <div className="cashflow-item">
            <ArrowDownLeft size={17} />
            <span>Contributions / inflows</span>
            <b>{moneyFormat(m.incoming, m.currency)}</b>
          </div>
          <div className="cashflow-item outgoing">
            <ArrowUpRight size={17} />
            <span>Payouts / outflows</span>
            <b>{moneyFormat(m.outgoing, m.currency)}</b>
          </div>
        </div>
      ))}
    </div>
  );
}
export function IntegrityNote() {
  return (
    <span className="integrity-note">
      <ShieldCheck size={14} />
      Recorded data · simulated funds · no chain confirmations
    </span>
  );
}
