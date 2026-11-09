import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { PageHeading, Stat, Empty } from "./ui";
import { dateTime, titleCase } from "@/lib/format";
import { reputationDimensionLabel } from "@/lib/reputation-core";
import type {
  ReleaseAnalyticsReport,
  SystemFilters,
} from "@/lib/release-analytics";

export function formatAssetUnits(value: string, decimals: number) {
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    return "Unavailable";
  const number = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const fraction = decimals
    ? (number % scale).toString().padStart(decimals, "0").replace(/0+$/, "")
    : "";
  return `${new Intl.NumberFormat("en-US").format(number / scale)}${fraction ? "." + fraction : ""}`;
}
export function systemReportHref(filters: SystemFilters, page = filters.page) {
  const params = new URLSearchParams({
    community: filters.community,
    page: String(page),
    dataset: filters.dataset,
  });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  return "/analytics/system?" + params.toString();
}
export function ReleaseInsights({
  report,
}: {
  report: ReleaseAnalyticsReport;
}) {
  const { filters, scope } = report;
  const exportHref = systemReportHref(filters).replace(
    "/analytics/system?",
    "/api/analytics/system/export?",
  );
  const datasetExportHref = (dataset: SystemFilters["dataset"]) =>
    systemReportHref({ ...filters, dataset }).replace(
      "/analytics/system?",
      "/api/analytics/system/export?",
    );
  return (
    <div className="stack">
      <PageHeading
        eyebrow="CONNECTED SYSTEM INSIGHTS"
        title="The whole picture. Every source."
        description="Start with balances and activity, then inspect exact funding, voting and reputation records."
        action={
          <a className="button secondary" href={exportHref} download>
            <Download size={16} /> Export this page
          </a>
        }
      />
      <div className="row">
        <Link className="text-link" href="/analytics">
          <ArrowLeft size={16} /> Saved views and custom analytics
        </Link>
      </div>
      <section className="panel">
        <h2>Choose your scope</h2>
        <form method="get" className="form-grid" action="/analytics/system">
          <label className="field">
            <span id="system-community-label">Community</span>
            <select
              name="community"
              aria-labelledby="system-community-label"
              defaultValue={filters.community}
            >
              <option value="all">All active communities</option>
              {report.communities.map((community) => (
                <option key={community.id} value={community.slug}>
                  {community.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rounds created from</span>
            <input type="date" name="from" defaultValue={filters.from ?? ""} />
          </label>
          <label className="field">
            <span>Rounds created through</span>
            <input type="date" name="to" defaultValue={filters.to ?? ""} />
          </label>
          <div className="row">
            <button className="button" type="submit">
              Apply scope
            </button>
            <Link className="text-link" href="/analytics/system">
              Clear filters
            </Link>
          </div>
        </form>
        <p className="muted small-text">
          {scope.definition} No exchange rate is assumed. Simulated funds and
          externally recorded payments stay separate.
        </p>
      </section>
      <div className="stats-grid">
        <Stat
          label="Funding rounds"
          value={String(scope.roundCount)}
          detail={`${scope.selectedCommunities} selected communities`}
          icon="vote"
        />
        <Stat
          label="Dedicated pools"
          value={String(scope.fundedCount)}
          detail="Separate from legacy treasury funds"
        />
        <Stat
          label="Sealed contexts"
          value={String(scope.sealedCount)}
          detail="Vote choices and participation stay private"
          icon="shield"
        />
        <Stat
          label="Local asset groups"
          value={String(report.assets.length)}
          detail="Exact units; each network and asset stands alone"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PRINCIPAL RECONCILIATION</span>
            <h2>Where each funding pool stands</h2>
          </div>
        </div>
        <a className="text-link" href={datasetExportHref("funds")} download>
          Export complete local asset totals
        </a>
        <p className="muted">
          Received = held + reserved + paid + refunded. Every amount below
          covers the complete selected round cohort.
        </p>
        {!report.assets.length ? (
          <Empty
            title="No local funded rounds in this scope"
            description="Decision-only rounds remain in the election report below."
          />
        ) : (
          <div className="stack">
            {report.assets.map((asset) => (
              <details
                key={`${asset.network}:${asset.assetId}:${asset.decimals}`}
                open
              >
                <summary>
                  <strong>{asset.currency}</strong> · {asset.network} ·{" "}
                  {asset.rounds} rounds ·{" "}
                  {formatAssetUnits(asset.received, asset.decimals)} received
                </summary>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label={`${asset.currency} funding reconciliation`}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Held</th>
                        <th>Reserved</th>
                        <th>Paid</th>
                        <th>Refunded</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {(
                          [
                            "received",
                            "held",
                            "reserved",
                            "paid",
                            "refunded",
                          ] as const
                        ).map((field) => (
                          <td key={field}>
                            {formatAssetUnits(asset[field], asset.decimals)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted small-text">
                  Asset {asset.assetId} · precision {asset.decimals} decimals ·
                  local simulation
                </p>
              </details>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <span className="eyebrow">PUBLISHED RULES</span>
        <h2>How communities decide</h2>
        <p className="muted">
          Methods, power modes and allocation policies describe the frozen
          rules. An ongoing ballot’s choices, participation and outcome are
          withheld.
        </p>
        {!report.methods.length ? (
          <p>No rounds in this scope.</p>
        ) : (
          <ul>
            {report.methods.map((method) => (
              <li key={method.method}>
                {method.method.replaceAll("_", " ")}{" "}
                <strong>· {method.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <span className="eyebrow">EXTERNALLY HANDLED PAYMENTS</span>
        <h2>Staff records, with a clear boundary</h2>
        <p className="muted">
          These current totals are independently unverified staff attestations.
          Fundicate does not transfer money or grant voting power from them.
          Each community and currency stays separate. Reversed originals are
          excluded from these totals; their full correction history remains at
          the source. Round creation-date filters do not change this snapshot.
        </p>
        <a className="text-link" href={datasetExportHref("payments")} download>
          Export external-payment aggregates
        </a>
        {!report.payments.length ? (
          <p>No unreversed external-payment records in these communities.</p>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Independently unverified external-payment aggregates"
          >
            <table>
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Currency</th>
                  <th>Record kind</th>
                  <th>Unreversed originals</th>
                  <th>Recorded amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {report.payments.map((row) => (
                  <tr key={`${row.communityId}:${row.currency}:${row.kind}`}>
                    <td>{row.community}</td>
                    <td>{row.currency}</td>
                    <td>{titleCase(row.kind)}</td>
                    <td>{row.recordCount}</td>
                    <td>{formatAssetUnits(row.amount, row.decimals)}</td>
                    <td>
                      <Link className="text-link" href={row.href}>
                        Inspect payment records
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="row between">
          <div>
            <span className="eyebrow">SOURCE DRILL-DOWN</span>
            <h2>Round by round</h2>
            <p className="muted">
              Page {filters.page} of {scope.pageCount} · up to {scope.pageSize}{" "}
              source records per page. The CSV uses the same page and privacy
              boundaries.
            </p>
          </div>
        </div>
        {!report.rounds.length ? (
          <Empty
            title="Nothing in this scope yet"
            description="Change the creation dates or community to inspect other rounds."
          />
        ) : (
          <div className="stack">
            {report.rounds.map((round) => (
              <details key={round.id}>
                <summary>
                  <strong>{round.title}</strong> · {round.community} ·{" "}
                  {titleCase(round.status)}
                </summary>
                <div className="inset">
                  <p>
                    <Link className="text-link" href={round.href}>
                      Open immutable source <ArrowRight size={15} />
                    </Link>
                  </p>
                  <p>
                    Rules V{round.rulesVersion} · {titleCase(round.method)} ·{" "}
                    {titleCase(round.selectionWeight)} selection ·{" "}
                    {titleCase(round.allocationPolicy)}
                  </p>
                  <p className="muted small-text">
                    Screening power: {titleCase(round.screeningWeight)} · veto
                    power: {titleCase(round.vetoWeight)} · created{" "}
                    {dateTime(round.createdAt)}
                  </p>
                  {round.sealed ? (
                    <p>
                      <strong>Ballot context sealed.</strong> Participation and
                      results become available after selection and any veto
                      window close.
                    </p>
                  ) : (
                    <p>
                      Published participation power:{" "}
                      {round.participation ??
                        "Not recorded in this historical result"}{" "}
                      · eligible power: {round.eligiblePower ?? "Not recorded"}{" "}
                      · quorum power: {round.quorumRequired ?? "Not recorded"}
                    </p>
                  )}
                  <p>Veto: {titleCase(round.veto)}</p>
                  {round.money && (
                    <p>
                      Received{" "}
                      {formatAssetUnits(
                        round.money.received,
                        round.money.decimals,
                      )}{" "}
                      {round.money.currency} · held{" "}
                      {formatAssetUnits(round.money.held, round.money.decimals)}{" "}
                      · reserved{" "}
                      {formatAssetUnits(
                        round.money.reserved,
                        round.money.decimals,
                      )}{" "}
                      · paid{" "}
                      {formatAssetUnits(round.money.paid, round.money.decimals)}{" "}
                      · refunded{" "}
                      {formatAssetUnits(
                        round.money.refunded,
                        round.money.decimals,
                      )}
                    </p>
                  )}
                  {round.allocation && (
                    <details>
                      <summary>Inspect published allocation</summary>
                      <pre
                        role="region"
                        tabIndex={0}
                        aria-label={`${round.title} published allocation`}
                        style={{
                          background: "var(--paper)",
                          color: "var(--ink)",
                          padding: "1rem",
                          maxWidth: "100%",
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {JSON.stringify(round.allocation, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
        <nav className="row between" aria-label="System report pages">
          {filters.page > 1 ? (
            <Link
              className="button secondary"
              href={systemReportHref(filters, filters.page - 1)}
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {filters.page < scope.pageCount && (
            <Link
              className="button secondary"
              href={systemReportHref(filters, filters.page + 1)}
            >
              Next page
            </Link>
          )}
        </nav>
      </section>
      <section className="panel">
        <span className="eyebrow">CURRENT VISIBLE REPUTATION</span>
        <h2>Shared experience, with context</h2>
        <p className="muted">
          Latest visible scores only. Hidden reviews, private abuse reports and
          reviewer identities are excluded. Receipt-backed recipient experience
          confirms a payment context, not completed project delivery.
        </p>
        <a
          className="text-link"
          href={datasetExportHref("reputation")}
          download
        >
          Export visible reputation aggregates
        </a>
        {!report.reputation.length ? (
          <p>No visible scored reviews in these communities.</p>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Visible reputation aggregates"
          >
            <table>
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Target</th>
                  <th>Dimension</th>
                  <th>Review count</th>
                  <th>Average</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {report.reputation.map((row) => (
                  <tr
                    key={`${row.communityId}:${row.targetType}:${row.dimension}`}
                  >
                    <td>{row.community}</td>
                    <td>{titleCase(row.targetType)}</td>
                    <td>{reputationDimensionLabel(row.dimension)}</td>
                    <td>{row.count}</td>
                    <td>{row.average.toFixed(2)} / 5</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/communities/${row.slug}/reputation`}
                      >
                        Review context
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted small-text">
        Generated {dateTime(report.generatedAt)}. Counts describe observed
        records, not projections or investment returns.
      </p>
    </div>
  );
}
