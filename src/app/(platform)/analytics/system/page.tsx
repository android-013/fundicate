import { ZodError } from "zod";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getReleaseAnalytics, parseSystemFilters, type ReleaseAnalyticsReport } from "@/lib/release-analytics";
import { ReleaseInsights } from "@/components/release-insights";
import { PageHeading } from "@/components/ui";

export default async function SystemAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  let report: ReleaseAnalyticsReport | undefined;
  let message = "";
  try {
    const filters = parseSystemFilters(await searchParams);
    report = await getReleaseAnalytics(user.id, filters);
  } catch (error) {
    if (!(error instanceof ZodError || error instanceof AppError)) throw error;
    message = error instanceof AppError ? error.message : "Choose valid, nonrepeated community and date filters.";
  }
  if (!report) return <><PageHeading eyebrow="SYSTEM INSIGHTS" title="Adjust this report’s scope." description={message} /><section className="panel"><Link className="button" href="/analytics/system">Reset report scope</Link></section></>;
  return <ReleaseInsights report={report} />;
}
