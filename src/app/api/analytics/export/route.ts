import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { getAnalytics, reportRecords } from "@/lib/analytics";
import { csvDocument, decimalMinor, parseFilters } from "@/lib/analytics-core";
import { AppError, ensure } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    ensure(user, "Sign in to export your analysis.", 401);
    await rateLimit(`analytics-export:${user.id}`, 10, 60);
    const params: Record<string, string | string[]> = {};
    for (const key of new Set(request.nextUrl.searchParams.keys())) {
      const values = request.nextUrl.searchParams.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }
    const filters = parseFilters(params);
    const report = await getAnalytics(user.id, filters);
    const records = reportRecords(report);
    ensure(
      records.length <= 10000,
      "This export exceeds 10,000 rows. Narrow your filters before exporting.",
      422,
    );
    const csv = csvDocument(
      [
        "Record ID",
        "Timestamp UTC",
        "Community",
        "Title",
        "Person",
        "Type",
        "Status",
        "Amount",
        "Amount minor units",
        "Currency",
        "Source record",
      ],
      records.map((r) => [
        r.id,
        r.date.toISOString(),
        r.community,
        r.title,
        r.person,
        r.type,
        r.status,
        r.amount === null ? "" : decimalMinor(r.amount),
        r.amount?.toString() ?? "",
        r.currency,
        r.href,
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fundicate-${filters.dataset}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Record-Count": String(records.length),
      },
    });
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof ZodError
              ? "Invalid report filters."
              : "The export could not be generated.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
