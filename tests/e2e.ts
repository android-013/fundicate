import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { parseFilters } from "../src/lib/analytics-core";
const origin = process.env.APP_ORIGIN!;
let checks = 0;
async function post(
  operation: string,
  body: unknown,
  cookie = "",
  expected = 200,
  requestOrigin = origin,
) {
  const res = await fetch(`${origin}/api/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const data = await res.json();
  assert.equal(res.status, expected, JSON.stringify(data));
  return { res, data };
}
async function page(path: string, cookie = "", status = 200) {
  const res = await fetch(origin + path, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  assert.equal(res.status, status, `${path}: ${res.status}`);
  return res;
}
async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
  );
  await page("/dashboard", "", 307);
  await page("/communities/new", "", 307);
  checks += 2;
  const create = async (name: string) => {
    const { res } = await post("register", {
      email: `${name}@test.invalid`,
      username: name,
      displayName: name === "alex" ? "Alex Test" : "Taylor Test",
      password: "LongTestPassword!2026",
    });
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    assert.ok(res.headers.get("set-cookie")!.includes("HttpOnly"));
    return cookie;
  };
  const admin = await create("alex");
  const candidate = await create("taylor");
  checks += 2;
  const community = {
    name: "Shared Futures",
    slug: "shared-futures",
    description:
      "Build a brighter community through shared projects and fair decisions.",
    purpose:
      "Pool resources, vote on useful local projects, and preserve a clear financial record.",
    currency: "USD",
    minimumContribution: "5",
    questions: "What would you like to make happen?",
  };
  await post("community", community, admin);
  await post(
    "community",
    { ...community, name: "Taylor’s Collective", slug: "taylors-collective" },
    candidate,
  );
  checks += 2;
  const c = await db.community.findUniqueOrThrow({
    where: { slug: community.slug },
    include: { questions: true },
  });
  await post(
    "application",
    {
      communityId: c.id,
      introduction:
        "I’d like to help grow a stronger community and contribute to our shared projects.",
      proposedContribution: "50",
      answers: {
        [c.questions[0].id]:
          "I want to build shared tools and organize volunteer sessions.",
      },
    },
    candidate,
  );
  const app = await db.membershipApplication.findFirstOrThrow({
    where: { communityId: c.id },
  });
  await post(
    "review",
    {
      communityId: c.id,
      applicationId: app.id,
      decision: "approve",
      reason: "We should follow the member vote.",
    },
    admin,
    403,
  );
  await post(
    "review",
    {
      communityId: c.id,
      applicationId: app.id,
      decision: "ballot",
      reason: "A clear application ready for voting.",
    },
    admin,
  );
  const admission = await db.proposal.findUniqueOrThrow({
    where: { applicationId: app.id },
  });
  await post(
    "vote",
    { communityId: c.id, proposalId: admission.id, choice: "YES" },
    admin,
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId: admission.id, action: "finalize" },
    admin,
  );
  assert.equal(
    (
      await db.membershipApplication.findUniqueOrThrow({
        where: { id: app.id },
      })
    ).status,
    "APPROVED",
  );
  checks += 5;
  const key = randomUUID();
  await post(
    "contribute",
    { communityId: c.id, amount: "100", idempotencyKey: key },
    candidate,
  );
  await post(
    "contribute",
    { communityId: c.id, amount: "100", idempotencyKey: key },
    candidate,
  );
  checks += 2;
  const proposalBody = {
    communityId: c.id,
    title: "Shared tools for a shared future",
    description:
      "Buy a small set of tools for community volunteers and publish an accessible inventory for everyone.",
    type: "FUNDING",
    amount: "25",
    recipient: "Volunteer toolkit",
    quorumBps: 5000,
    thresholdBps: 5001,
    opensAt: new Date(Date.now() - 3600000).toISOString(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
    publish: true,
  };
  const { data: created } = await post("proposal", proposalBody, candidate);
  const proposalId = String(created.redirect).split("/").at(-1)!;
  assert.equal(
    (await db.proposal.findUniqueOrThrow({ where: { id: proposalId } })).status,
    "DRAFT",
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId, action: "open" },
    candidate,
    403,
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId, action: "open" },
    admin,
  );
  for (const cookie of [admin, candidate])
    await post(
      "vote",
      { communityId: c.id, proposalId, choice: "YES" },
      cookie,
    );
  await post(
    "vote",
    { communityId: c.id, proposalId, choice: "NO" },
    candidate,
    409,
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId, action: "finalize" },
    admin,
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId, action: "execute" },
    admin,
  );
  await post(
    "proposal-action",
    { communityId: c.id, proposalId, action: "execute" },
    admin,
  );
  const treasury = await db.treasuryAccount.findUniqueOrThrow({
    where: { communityId_kind: { communityId: c.id, kind: "TREASURY" } },
  });
  assert.equal(treasury.balance, 7500n);
  const execution = await db.fundingExecution.findUniqueOrThrow({
    where: { proposalId },
    include: { transaction: { include: { entries: true } } },
  });
  assert.equal(execution.transactionHash, null);
  assert.equal(execution.transaction.simulated, true);
  assert.equal(
    execution.transaction.entries.reduce((s, e) => s + e.amount, 0n),
    0n,
  );
  checks += 9;
  await post(
    "contribute",
    { communityId: c.id, amount: "10", idempotencyKey: randomUUID() },
    candidate,
    403,
    "https://untrusted.invalid",
  );
  await post(
    "contribute",
    { communityId: c.id, amount: "10", idempotencyKey: randomUUID() },
    "",
    401,
  );
  await post(
    "member",
    { communityId: c.id, userId: c.adminId, action: "moderator" },
    candidate,
    403,
  );
  checks += 3;
  const paths = [
    "/",
    "/explore",
    "/login",
    "/register",
    "/dashboard",
    "/communities/new",
    `/communities/${c.slug}`,
    `/communities/${c.slug}/members`,
    `/communities/${c.slug}/treasury`,
    `/communities/${c.slug}/proposals`,
    `/communities/${c.slug}/proposals/new`,
    `/communities/${c.slug}/proposals/${proposalId}`,
    `/communities/${c.slug}/governance`,
    `/communities/${c.slug}/activity`,
    "/settings/profile",
    "/settings/security",
    "/analytics",
    "/analytics/treasury",
    "/analytics/governance",
    "/analytics/network",
    "/analytics/personal",
    "/analytics/records",
  ];
  for (const path of paths) {
    const res = await page(path, admin);
    const html = await res.text();
    assert.ok(!html.includes("Internal Server Error"), path);
    checks++;
  }
  assert.ok(
    (await db.auditEvent.count({
      where: { communityId: c.id, action: "SIMULATED_PAYOUT" },
    })) === 1,
  );
  await page("/analytics", "", 307);
  checks++;
  await post(
    "dashboard-preferences",
    { widgets: ["treasury", "votes"] },
    admin,
  );
  assert.deepEqual(
    (
      await db.dashboardPreference.findUniqueOrThrow({
        where: { userId: c.adminId },
      })
    ).widgets,
    ["treasury", "votes"],
  );
  checks++;
  await post(
    "dashboard-preferences",
    { widgets: ["treasury", "treasury"] },
    admin,
    400,
  );
  checks++;
  const candidateUser = await db.user.findUniqueOrThrow({
    where: { email: "taylor@test.invalid" },
  });
  await post(
    "dashboard-preferences",
    { userId: c.adminId, widgets: ["activity"] },
    candidate,
  );
  assert.deepEqual(
    (
      await db.dashboardPreference.findUniqueOrThrow({
        where: { userId: c.adminId },
      })
    ).widgets,
    ["treasury", "votes"],
  );
  assert.deepEqual(
    (
      await db.dashboardPreference.findUniqueOrThrow({
        where: { userId: candidateUser.id },
      })
    ).widgets,
    ["activity"],
  );
  checks++;
  await post(
    "analytics-save-view",
    {
      name: "Funding source view",
      section: "treasury",
      filters: parseFilters({ community: c.slug, range: "all" }),
    },
    admin,
  );
  const saved = await db.savedAnalyticsView.findUniqueOrThrow({
    where: { userId_name: { userId: c.adminId, name: "Funding source view" } },
  });
  await post("analytics-delete-view", { id: saved.id }, candidate, 404);
  await post("analytics-delete-view", { id: saved.id }, admin);
  checks += 3;
  const csv = await fetch(
    origin +
      `/api/analytics/export?community=${c.slug}&range=all&dataset=transactions`,
    { headers: { Cookie: admin } },
  );
  assert.equal(csv.status, 200);
  assert.ok(csv.headers.get("content-type")?.startsWith("text/csv"));
  assert.equal(csv.headers.get("x-record-count"), "2");
  assert.ok((await csv.text()).includes(execution.transactionId));
  checks++;
  const unauthorized = await fetch(origin + "/api/analytics/export");
  assert.equal(unauthorized.status, 401);
  checks++;
  const forbidden = await fetch(
    origin + "/api/analytics/export?community=taylors-collective",
    { headers: { Cookie: admin } },
  );
  assert.equal(forbidden.status, 403);
  checks++;
  const inspected = await page(
    `/analytics/inspect/transactions/${execution.transactionId}`,
    admin,
  );
  assert.ok((await inspected.text()).includes("Balanced ledger entries"));
  checks++;
  const invalid = await page(
    "/analytics?range=custom&from=2026-02-30&to=2026-03-01",
    admin,
  );
  assert.ok((await invalid.text()).includes("Adjust your report filters."));
  checks++;
  await post("logout", {}, candidate);
  await page("/dashboard", candidate, 307);
  checks += 2;
  console.log(
    `PASS ${checks} HTTP end-to-end checks: register → create communities → apply → admission vote → member draft → open → vote → approve → execute simulation → treasury/audit → logout.`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
