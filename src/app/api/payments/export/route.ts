import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { currentUser, rateLimit } from "@/lib/auth";
import { AppError, ensure } from "@/lib/errors";
import { listExternalPayments } from "@/lib/payment-records";
import { csvDocument } from "@/lib/analytics-core";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    const user = await currentUser();
    ensure(user, "Sign in to export payment records.", 401);
    await rateLimit(`payments-export:${user.id}`, 10, 60);
    const params = request.nextUrl.searchParams;
    ensure(
      [...params.keys()].every((key) => params.getAll(key).length === 1),
      "Use each filter only once.",
    );
    const { communityId, page } = z
      .object({
        communityId: z.string().uuid(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .parse(Object.fromEntries(params));
    const view = await listExternalPayments(user.id, communityId, page);
    const csv = csvDocument(
      [
        "Record ID",
        "Kind",
        "Amount minor units",
        "Currency",
        "Reference",
        "Note",
        "Evidence URL",
        "Occurred UTC",
        "Recorder",
        "Reverses record",
        "Reversed by",
        "Verification",
      ],
      view.records.map((r) => [
        r.id,
        r.kind,
        r.amount,
        r.currency,
        r.reference,
        r.note,
        r.evidenceUrl ?? "",
        r.occurredAt,
        r.recordedByName,
        r.reversesId ?? "",
        r.reversedById ?? "",
        "STAFF_RECORDED_UNVERIFIED",
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fundicate-payments-page-${page}.csv"`,
        "X-Record-Count": String(view.records.length),
        "X-Total-Record-Count": String(view.total),
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
              ? "Invalid payment record filters."
              : "Payment records could not be exported.",
      },
      {
        status,
        headers: {
          ...headers,
          ...(error instanceof AppError && error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
