import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { AppError, ensure } from "@/lib/errors";
import { getReleaseAnalytics, parseSystemFilters, releaseAnalyticsCsv } from "@/lib/release-analytics";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const user = await currentUser();
    ensure(user, "Sign in to export system analysis.", 401);
    await rateLimit(`system-export:${user.id}`, 10, 60);
    const params: Record<string, string | string[]> = {};
    for (const key of new Set(request.nextUrl.searchParams.keys())) {
      const values = request.nextUrl.searchParams.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }
    const report = await getReleaseAnalytics(user.id, parseSystemFilters(params));
    return new NextResponse(releaseAnalyticsCsv(report), { headers: {
      ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fundicate-system-${report.filters.dataset}-page-${report.filters.page}.csv"`, "X-Record-Count": String(report.filters.dataset === "rounds" ? report.rounds.length : report.filters.dataset === "funds" ? report.assets.length : report.filters.dataset === "reputation" ? report.reputation.length : report.chain.groups.length + report.chain.observations.length), "X-Total-Record-Count": String(report.filters.dataset === "rounds" ? report.scope.roundCount : report.filters.dataset === "funds" ? report.assets.length : report.filters.dataset === "reputation" ? report.reputation.length : report.chain.groups.length + report.chain.observations.length),
    } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: error instanceof AppError ? error.message : error instanceof ZodError ? "Invalid system report filters." : "System analysis could not be exported." }, { status, headers: privateHeaders });
  }
}
