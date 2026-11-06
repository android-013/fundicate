import { databaseReady } from "@/lib/readiness";
import { assertRuntimeReady } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await assertRuntimeReady(databaseReady);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
