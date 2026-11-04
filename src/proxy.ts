import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("fundicate_session")?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    try {
      const session = await db.session.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date())
        return NextResponse.next();
    } catch {
      return NextResponse.json(
        { error: "Authentication is temporarily unavailable." },
        { status: 503 },
      );
    }
  }
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/communities/new",
    "/communities/:slug/proposals/new",
  ],
};
