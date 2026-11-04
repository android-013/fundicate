import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError, z } from "zod";
import { ArrowLeft, ArrowUpRight, Database } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAnalytics, inspectAnalyticsRecord } from "@/lib/analytics";
import {
  analyticsSections,
  parseFilters,
  type AnalyticsSection,
  type SearchValues,
} from "@/lib/analytics-core";
import { AppError } from "@/lib/errors";
import { dateTime, moneyFormat } from "@/lib/format";
import {
  AnalyticsNav,
  Definition,
  IntegrityNote,
  ReportFilters,
} from "@/components/analytics-ui";
import { AnalyticsSections } from "@/components/analytics-sections";
import { PageHeading, Status } from "@/components/ui";

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<SearchValues>;
}) {
  const user = await requireUser();
  const parts = (await params).path ?? [];
  if (parts[0] === "inspect") {
    if (
      parts.length !== 3 ||
      !["transactions", "votes", "activity"].includes(parts[1]) ||
      !z.string().uuid().safeParse(parts[2]).success
    )
      notFound();
    const result = await inspectAnalyticsRecord(
      user.id,
      parts[1],
      parts[2],
    ).catch((e) => {
      if (e instanceof AppError && e.status === 404) notFound();
      throw e;
    });
    const record = result.record;
    const community =
      "community" in record
        ? record.community
        : "proposal" in record
          ? record.proposal?.community
          : null;
    return (
      <>
        <Link href="/analytics/records?range=all" className="back-link">
          <ArrowLeft size={15} />
          Back to the data explorer
        </Link>
        <PageHeading
          eyebrow="FOLLOW IT TO THE SOURCE"
          title="Nothing hidden in the details."
          description="An authorized view of the original record behind the numbers."
        />
        <section className="panel padded record-inspector">
          <div className="row between">
            <span className="record-kind">
              <Database size={18} />
              {parts[1]}
            </span>
            {"status" in record && <Status value={record.status} />}
          </div>
          <dl className="detail-list">
            <div>
              <dt>Record identifier</dt>
              <dd className="mono">{record.id}</dd>
            </div>
            <div>
              <dt>Recorded at</dt>
              <dd>{dateTime(record.createdAt)}</dd>
            </div>
            {community && (
              <div>
                <dt>Community</dt>
                <dd>
                  <Link href={`/communities/${community.slug}`}>
                    {community.name} ↗
                  </Link>
                </dd>
              </div>
            )}
            {"amount" in record && (
              <div>
                <dt>Amount</dt>
                <dd>
                  {moneyFormat(record.amount, record.currency)}{" "}
                  <small>({record.amount.toString()} minor units)</small>
                </dd>
              </div>
            )}
            {"choice" in record && (
              <div>
                <dt>Recorded choice</dt>
                <dd>{record.choice}</dd>
              </div>
            )}
            {"user" in record && (
              <div>
                <dt>Voter</dt>
                <dd>{record.user.displayName}</dd>
              </div>
            )}
            {"initiatedBy" in record && (
              <div>
                <dt>Initiated by</dt>
                <dd>{record.initiatedBy.displayName}</dd>
              </div>
            )}
            {"actor" in record && (
              <div>
                <dt>Actor</dt>
                <dd>{record.actor.displayName}</dd>
              </div>
            )}
            {"action" in record && (
              <div>
                <dt>Action</dt>
                <dd>{record.action}</dd>
              </div>
            )}
            {"type" in record && (
              <div>
                <dt>Transaction type</dt>
                <dd>{record.type}</dd>
              </div>
            )}
            {"network" in record && (
              <>
                <div>
                  <dt>Network</dt>
                  <dd>{record.network}</dd>
                </div>
                <div>
                  <dt>Blockchain reference</dt>
                  <dd>
                    {record.externalReference ?? "None · local simulation"}
                  </dd>
                </div>
                <div>
                  <dt>Replay protection key</dt>
                  <dd className="mono">{record.idempotencyKey}</dd>
                </div>
              </>
            )}
          </dl>
          {"entries" in record && (
            <>
              <h2>Balanced ledger entries</h2>
              <div
                className="table-scroll"
                role="region"
                tabIndex={0}
                aria-label="Source ledger entries"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Account ID</th>
                      <th>Signed amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{e.account.kind}</td>
                        <td className="mono">{e.accountId}</td>
                        <td>{moneyFormat(e.amount, record.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Definition>
                Signed entries sum to{" "}
                {moneyFormat(
                  record.entries.reduce((s, e) => s + e.amount, 0n),
                  record.currency,
                )}
                . A confirmed simulation is a local database record, not a chain
                receipt.
              </Definition>
            </>
          )}
          {"details" in record && (
            <details open>
              <summary>Immutable audit metadata</summary>
              <pre>{JSON.stringify(record.details, null, 2)}</pre>
            </details>
          )}
          {"proposal" in record && record.proposal && community && (
            <Link
              className="button secondary"
              href={`/communities/${community.slug}/proposals/${record.proposal.id}`}
            >
              Open the proposal <ArrowUpRight size={15} />
            </Link>
          )}
          <IntegrityNote />
        </section>
      </>
    );
  }
  if (
    parts.length > 1 ||
    (parts.length === 1 &&
      !analyticsSections.includes(parts[0] as AnalyticsSection))
  )
    notFound();
  const section = (parts[0] ?? "overview") as AnalyticsSection;
  const loaded = await loadReport(user.id, await searchParams);
  if (!loaded.ok) return <ReportFailure error={loaded.error} />;
  const { filters, report } = loaded;
  return (
    <>
      <PageHeading
        eyebrow="YOUR COLLECTIVE INTELLIGENCE"
        title={
          section === "overview"
            ? "Start simple. Go deep."
            : section === "treasury"
              ? "Follow the flow."
              : section === "governance"
                ? "Every voice. Every decision."
                : section === "network"
                  ? "Connection is the multiplier."
                  : section === "personal"
                    ? "Your part in the bigger picture."
                    : "The story behind every number."
        }
        description="A clear overview when you need it. The underlying detail when you want it."
      />
      <AnalyticsNav section={section} filters={filters} />
      <ReportFilters report={report} section={section} />
      <div className="report-context">
        <span>{report.period.label}</span>
        <IntegrityNote />
      </div>
      <AnalyticsSections report={report} section={section} userId={user.id} />
      <p className="report-freshness">
        Generated {dateTime(report.asOf)} · dates use UTC · scope: active
        community memberships · chart points link to source periods
      </p>
    </>
  );
}
async function loadReport(userId: string, raw: SearchValues) {
  try {
    const filters = parseFilters(raw);
    return {
      ok: true as const,
      filters,
      report: await getAnalytics(userId, filters),
    };
  } catch (e) {
    if (e instanceof ZodError || e instanceof AppError)
      return { ok: false as const, error: e };
    throw e;
  }
}
function ReportFailure({ error: e }: { error: ZodError | AppError }) {
  return (
    <section className="panel padded">
      <h1>
        {e instanceof AppError && e.status === 403
          ? "This report is outside your workspace."
          : "Adjust your report filters."}
      </h1>
      <p role="alert">
        {e instanceof ZodError
          ? e.issues.map((i) => i.message).join(" ")
          : e.message}
      </p>
      <Link className="button primary" href="/analytics">
        Reset analytics filters
      </Link>
    </section>
  );
}
