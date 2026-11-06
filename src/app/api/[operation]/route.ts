import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import {
  currentUser,
  createSession,
  hashToken,
  login,
  rateLimit,
  register,
  sessionCookie,
} from "@/lib/auth";
import { AppError, ensure } from "@/lib/errors";
import { db } from "@/lib/db";
import {
  contributeToRound,
  prepareRoundSettlement,
  processRoundSettlement,
  reconcileRoundSettlement,
} from "@/lib/funded-rounds";
import { castRoundVetoVote, closeRoundVeto } from "@/lib/rounds-v3";
import * as service from "@/lib/service";
import * as reputation from "@/lib/reputation";
import { profileSchema, uuid } from "@/lib/validation";
import { saveAnalyticsView, saveDashboardPreference } from "@/lib/analytics";
import {
  createFundingRound,
  submitFundingScheme,
  fundingRoundAction,
  castScreeningVote,
  castSelectionVote,
  castMethodSelectionVote,
} from "@/lib/rounds";

export const runtime = "nodejs";
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  try {
    const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
    ensure(
      req.headers.get("origin") === origin,
      "Request origin is not allowed.",
      403,
    );
    ensure(
      req.headers.get("content-type")?.startsWith("application/json"),
      "Use a JSON request.",
      415,
    );
    ensure(
      Number(req.headers.get("content-length") ?? 0) <= 250000,
      "Request too large.",
      413,
    );
    const raw = await req.text();
    ensure(raw.length <= 250000, "Request too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError("Invalid JSON.");
    }
    const { operation } = await context.params;
    let result: unknown;
    if (operation === "login" || operation === "register") {
      // No untrusted forwarding header: use a deployment-provided trusted client IP when adding a reverse proxy.
      await rateLimit("auth:global", 1000, 900);
      const email = z
        .object({ email: z.string().max(200) })
        .parse(body)
        .email.toLowerCase();
      await rateLimit(`auth:${email}`, operation === "login" ? 10 : 5, 900);
      const user =
        operation === "register" ? await register(body) : await login(body);
      const session = await createSession(user.id);
      const res = NextResponse.json({
        redirect:
          operation === "register" ? "/explore?welcome=1" : "/dashboard",
      });
      ensure(
        process.env.NODE_ENV !== "production" ||
          origin.startsWith("https://") ||
          ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
        "Production requires an HTTPS application origin.",
        500,
      );
      res.cookies.set(sessionCookie, session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        expires: session.expiresAt,
        path: "/",
      });
      return res;
    }
    const user = await currentUser();
    ensure(user, "Please sign in to continue.", 401);
    await rateLimit(`mutation:${user.id}`, 180, 60);
    if (
      [
        "vote",
        "contribute",
        "proposal-action",
        "application",
        "round-screen-vote",
        "round-selection-vote",
        "round-method-vote",
        "reputation-create",
        "reputation-edit",
        "reputation-report",
        "reputation-moderate",
        "reputation-appeal",
        "round-action",
        "round-scheme",
        "round-contribute",
        "round-settle",
        "round-process",
        "round-reconcile",
        "round-veto",
        "round-veto-close",
      ].includes(operation)
    )
      await rateLimit(`${operation}:${user.id}`, 30, 60);
    switch (operation) {
      case "round-method-vote":
        await castMethodSelectionVote(user.id, body);
        result = {
          message: "Your complete selection ballot is sealed and recorded.",
        };
        break;
      case "reputation-create":
        await reputation.createReputationReview(user.id, body);
        result = { message: "Review recorded." };
        break;
      case "reputation-edit":
        await reputation.editReputationReview(user.id, body);
        result = {
          message: "Review revision recorded; earlier versions preserved.",
        };
        break;
      case "reputation-report":
        await reputation.reportReputationReview(user.id, body);
        result = { message: "Abuse report recorded." };
        break;
      case "reputation-moderate":
        await reputation.moderateReputationReview(user.id, body);
        result = { message: "Moderation decision recorded with its reason." };
        break;
      case "reputation-appeal":
        await reputation.appealReputationReview(user.id, body);
        result = { message: "Appeal recorded." };
        break;
      case "round-veto":
        await castRoundVetoVote(user.id, body);
        result = {
          message: "Your rejection-window ballot is sealed and recorded.",
        };
        break;
      case "round-veto-close":
        await closeRoundVeto(user.id, body);
        result = {
          message:
            "The full rejection window has closed and its decision is recorded.",
        };
        break;
      case "round-reconcile":
        await reconcileRoundSettlement(user.id, body);
        result = {
          message:
            "Local atomic ledger reconciliation completed. Retry only the existing plan.",
        };
        break;
      case "declare-contribution":
        await service.declareContribution(user.id, body);
        result = {
          message:
            "Your prospective contribution declaration is recorded. No money moved.",
        };
        break;
      case "round-contribute":
        await contributeToRound(user.id, body);
        result = {
          message:
            "Local simulated round deposit recorded. No real money moved.",
        };
        break;
      case "round-settle":
        await prepareRoundSettlement(user.id, body);
        result = { message: "The round settlement plan is locked." };
        break;
      case "round-process":
        await processRoundSettlement(user.id, body);
        result = {
          message: "Local simulated settlement operations processed.",
        };
        break;
      case "funding-round": {
        const round = await createFundingRound(user.id, body);
        const community = await db.community.findUniqueOrThrow({
          where: { id: round.communityId },
          select: { slug: true },
        });
        result = {
          redirect: `/communities/${community.slug}/rounds/${round.id}`,
        };
        break;
      }
      case "round-scheme":
        await submitFundingScheme(user.id, body);
        result = { message: "Scheme submitted to the round." };
        break;
      case "round-action":
        await fundingRoundAction(user.id, body);
        result = { message: "Funding round updated." };
        break;
      case "round-screen-vote":
        await castScreeningVote(user.id, body);
        result = { message: "Your screening ballot is sealed and recorded." };
        break;
      case "round-selection-vote":
        await castSelectionVote(user.id, body);
        result = { message: "Your selection ballot is sealed and recorded." };
        break;
      case "dashboard-preferences":
        await saveDashboardPreference(user.id, body);
        result = { message: "Your dashboard layout is saved." };
        break;
      case "analytics-save-view":
        await saveAnalyticsView(user.id, body);
        result = { message: "Analysis saved to your workspace." };
        break;
      case "analytics-delete-view": {
        const { id } = z.object({ id: uuid }).parse(body);
        const deleted = await db.savedAnalyticsView.deleteMany({
          where: { id, userId: user.id },
        });
        ensure(deleted.count, "Saved view not found.", 404);
        result = { message: "Saved view removed." };
        break;
      }
      case "logout": {
        const token = req.cookies.get(sessionCookie)?.value;
        if (token)
          await db.session.updateMany({
            where: { tokenHash: hashToken(token), userId: user.id },
            data: { revokedAt: new Date() },
          });
        const res = NextResponse.json({ redirect: "/" });
        res.cookies.delete(sessionCookie);
        return res;
      }
      case "community": {
        const c = await service.createCommunity(user.id, body);
        result = { redirect: `/communities/${c.slug}` };
        break;
      }
      case "application":
        await service.applyForMembership(user.id, body);
        result = {
          message:
            "Application submitted. Your proposed contribution is a pledge; no funds were transferred.",
        };
        break;
      case "review":
        await service.reviewApplication(user.id, body);
        result = { message: "Membership decision recorded." };
        break;
      case "proposal": {
        const p = await service.createProposal(user.id, body);
        const c = await db.community.findUniqueOrThrow({
          where: { id: p.communityId },
        });
        result = { redirect: `/communities/${c.slug}/proposals/${p.id}` };
        break;
      }
      case "vote":
        await service.castVote(user.id, body);
        result = { message: "Your vote is recorded and cannot be changed." };
        break;
      case "proposal-action":
        await service.proposalAction(user.id, body);
        result = {
          message: "Proposal updated. See its outcome and audit history below.",
        };
        break;
      case "contribute":
        await service.contribute(user.id, body);
        result = {
          message: "Simulated contribution recorded. No real money moved.",
        };
        break;
      case "member":
        await service.manageMember(user.id, body);
        result = { message: "Membership action recorded in the audit log." };
        break;
      case "profile": {
        const data = profileSchema.parse(body);
        await db.user.update({
          where: { id: user.id },
          data: { ...data, avatarUrl: data.avatarUrl || null },
        });
        result = { message: "Profile saved." };
        break;
      }
      case "revoke-sessions": {
        const token = req.cookies.get(sessionCookie)?.value;
        await db.session.updateMany({
          where: {
            userId: user.id,
            tokenHash: { not: hashToken(token ?? "") },
          },
          data: { revokedAt: new Date() },
        });
        result = { message: "All other sessions have been revoked." };
        break;
      }
      case "revoke-session": {
        const { sessionId } = z.object({ sessionId: uuid }).parse(body);
        await db.session.updateMany({
          where: { id: sessionId, userId: user.id },
          data: { revokedAt: new Date() },
        });
        result = { message: "Session revoked." };
        break;
      }
      case "notifications":
        await db.notification.updateMany({
          where: { userId: user.id, readAt: null },
          data: { readAt: new Date() },
        });
        result = { message: "Notifications marked as read." };
        break;
      default:
        throw new AppError("Action not found.", 404);
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((v) => `${v.path.join(".")}: ${v.message}`)
            .join(" "),
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return NextResponse.json(
        { error: "This email, username, slug or record already exists." },
        { status: 409 },
      );
    console.error(
      "Fundicate action failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "The action could not be completed. Please try again." },
      { status: 500 },
    );
  }
}
