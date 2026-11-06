import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { createCommunity } from "../src/lib/service";
import { createFundingRound, fundingRoundAction, submitFundingScheme, castScreeningVote, castMethodSelectionVote } from "../src/lib/rounds";
import { contributeToRound, prepareRoundSettlement, processRoundSettlement } from "../src/lib/funded-rounds";
import { createReputationReview, moderateReputationReview } from "../src/lib/reputation";
import { saveRoundTemplate, instantiateRoundTemplate, archiveRoundTemplate, getRoundTemplates } from "../src/lib/round-templates";
import { getReleaseAnalytics, releaseAnalyticsCsv } from "../src/lib/release-analytics";
import { castRoundVetoVote } from "../src/lib/rounds-v3";

const origin = process.env.APP_ORIGIN!;
const day = 86400000;
let checks = 0;
async function check(name: string, work: () => Promise<void>) { await work(); console.log(`PASS ${++checks}. ${name}`); }
async function post(operation: string, body: unknown, cookie = "", expected = 200, requestOrigin = origin) {
  const response = await fetch(`${origin}/api/${operation}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify(body), redirect: "manual" });
  const value = await response.json();
  assert.equal(response.status, expected, JSON.stringify(value));
  return value;
}
async function actor(name: string) {
  const response = await fetch(origin + "/api/register", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email: `${name}@insights.invalid`, username: name, displayName: name, password: "InsightsSecurePassword!2026" }) });
  assert.equal(response.status, 200, await response.text());
  return { user: await db.user.findUniqueOrThrow({ where: { email: `${name}@insights.invalid` } }), cookie: response.headers.get("set-cookie")!.split(";")[0] };
}
async function main() {
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"), "Release checks require an isolated throwaway database.");
  const [admin, member, moderator, outside] = await Promise.all(["insightadmin", "insightmember", "insightmod", "insightoutside"].map(actor));
  async function community(name: string, slug: string, currency: string, owner = admin) {
    return createCommunity(owner.user.id, { name, slug, currency, description: "A complete community for scoped system insights and reusable governance.", purpose: "Track exact funds and preserve the context of every community decision.", minimumContribution: "0", questions: "" });
  }
  const bdt = await community("BDT insights collective", "bdt-insights", "BDT");
  const usd = await community("USD insights collective", "usd-insights", "USD");
  const foreign = await community("Foreign insights collective", "foreign-insights", "EUR", outside);
  await db.communityMembership.createMany({ data: [member, moderator].map((person) => ({ communityId: bdt.id, userId: person.user.id, role: person === moderator ? "MODERATOR" as const : "MEMBER" as const })) });
  const old = new Date(Date.now() - 6 * day);
  const at = (days: number) => new Date(old.getTime() + days * day);
  const scope = (roundId: string) => ({ communityId: bdt.id, roundId });
  const sourceInput = {
    communityId: bdt.id, title: "Source rules for recurring community grants", description: "A funded community choice with attributable contributions, a request cap and preserved exact outcomes.", proposalPolicy: "MEMBERS", quorumBps: 1, submissionsCloseAt: at(1).toISOString(), funded: true, fundedVersion: "V4", fundingTarget: "1.00", minimumContribution: "0.01", maximumContribution: "1000.00", collectionClosesAt: at(0.5).toISOString(), expiresAt: at(12).toISOString(), selectionMethod: "IRV", selectionSeats: 1, screeningWeight: "EQUAL", selectionWeight: "CONTRIBUTION", vetoWeight: "EQUAL", allocationPolicy: "WINNER_ALL", rankedSharesBps: [], vetoEnabled: false,
  };
  const source = await createFundingRound(admin.user.id, sourceInput, old);
  await fundingRoundAction(admin.user.id, { ...scope(source.id), action: "open" }, old);
  for (const [person, amount] of [[admin, "60.00"], [member, "40.00"]] as const)
    await contributeToRound(person.user.id, { ...scope(source.id), amount, idempotencyKey: randomUUID() }, old);
  const scheme = await submitFundingScheme(moderator.user.id, { ...scope(source.id), title: "A capped shared-space project", description: "A real isolated fixture scheme whose allocation is capped below the received pool.", amount: "60.00", recipient: "Recorded isolated recipient", category: "DONATION" }, old);
  await fundingRoundAction(admin.user.id, { ...scope(source.id), action: "screen" }, at(1));
  for (const person of [admin, member]) await castScreeningVote(person.user.id, { ...scope(source.id), schemeId: scheme.id, choice: "YES" }, at(1.01));
  await fundingRoundAction(admin.user.id, { ...scope(source.id), action: "close-screening" }, at(2.01));
  for (const person of [admin, member]) await castMethodSelectionVote(person.user.id, { ...scope(source.id), ballot: { ranking: [scheme.id] } }, at(2.02));
  await fundingRoundAction(admin.user.id, { ...scope(source.id), action: "close-selection" }, at(3.02));
  await prepareRoundSettlement(admin.user.id, scope(source.id), at(3.03));
  await processRoundSettlement(admin.user.id, scope(source.id), at(3.03));
  await createFundingRound(admin.user.id, { ...sourceInput, communityId: usd.id, title: "Separate USD funding pool", selectionMethod: "FPTP", selectionWeight: "EQUAL" }, old);
  const open = await createFundingRound(admin.user.id, { ...sourceInput, title: "Sealed selection source", funded: false, fundedVersion: undefined, fundingTarget: undefined, minimumContribution: undefined, maximumContribution: undefined, collectionClosesAt: undefined, expiresAt: undefined, selectionMethod: undefined, selectionSeats: undefined, screeningWeight: undefined, selectionWeight: undefined, vetoWeight: undefined, allocationPolicy: undefined, rankedSharesBps: undefined, vetoEnabled: undefined }, old);
  await fundingRoundAction(admin.user.id, { ...scope(open.id), action: "open" }, old);

  let saved!: Awaited<ReturnType<typeof saveRoundTemplate>>;
  await check("staff save complete versioned source rules without ballots or financial history", async () => {
    saved = await saveRoundTemplate(admin.user.id, { communityId: bdt.id, name: "Recurring community grants", description: "A reusable setup with paid ranked choice and a fixed request cap policy.", sourceRoundId: source.id });
    assert.equal(saved.revision.number, 1);
    const rules = saved.revision.rules as { round: Record<string, unknown>; schedule: Record<string, unknown> };
    assert.equal(rules.round.fundedVersion, "V4");
    assert.equal(rules.round.selectionMethod, "IRV");
    assert.equal(rules.round.selectionWeight, "CONTRIBUTION");
    assert.equal(rules.round.fundingTarget, "1.00");
    assert.equal(rules.schedule.collectionBeforeSubmissionMs, day / 2);
    assert.equal(JSON.stringify(rules).includes(scheme.id), false);
    assert.equal(JSON.stringify(rules).includes("2026-"), false);
  });
  await check("ordinary members and foreign source rounds cannot edit a community template", async () => {
    await assert.rejects(saveRoundTemplate(member.user.id, { communityId: bdt.id, name: "Unauthorized setup", description: "This member may not override the staff template library.", sourceRoundId: source.id }));
    await assert.rejects(saveRoundTemplate(outside.user.id, { communityId: foreign.id, name: "Borrowed foreign setup", description: "A different community cannot borrow hidden round configuration.", sourceRoundId: source.id }));
  });
  await check("concurrent staff edits append ordered immutable revisions", async () => {
    await Promise.all(["Second", "Third"].map((label) => saveRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id, name: "Recurring community grants", description: `${label} immutable template revision from the same real round.`, sourceRoundId: source.id })));
    assert.deepEqual((await db.roundTemplateRevision.findMany({ where: { templateId: saved.template.id }, orderBy: { number: "asc" }, select: { number: true } })).map((r) => r.number), [1, 2, 3]);
    assert.deepEqual((await db.roundTemplateRevision.findUniqueOrThrow({ where: { id: saved.revision.id } })).rules, saved.revision.rules);
  });
  await check("direct SQL cannot rewrite or delete an immutable template revision", async () => {
    await assert.rejects(db.$executeRaw`UPDATE "RoundTemplateRevision" SET rules='{}'::jsonb WHERE id=${saved.revision.id}::uuid`);
    await assert.rejects(db.$executeRaw`DELETE FROM "RoundTemplateRevision" WHERE id=${saved.revision.id}::uuid`);
  });
  await check("instantiating an earlier revision makes a fresh unfunded draft bound atomically to that revision", async () => {
    const deadline = new Date(Date.now() + 7 * day);
    const draft = await instantiateRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id, revision: 1, submissionsCloseAt: deadline.toISOString(), title: "A fresh repeatable grant decision" });
    assert.equal(draft.templateRevisionId, saved.revision.id);
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.rulesVersion, 4);
    const settlement = await db.roundSettlement.findUniqueOrThrow({ where: { roundId: draft.id } });
    assert.equal(settlement.received, 0n);
    assert.equal(settlement.collectionClosesAt.getTime(), deadline.getTime() - day / 2);
    assert.equal(settlement.expiresAt.getTime(), deadline.getTime() + 11 * day);
    assert.equal(await db.roundMethodBallot.count({ where: { roundId: draft.id } }), 0);
  });
  await check("stale shifted collection cutoffs fail before any draft is committed", async () => {
    const count = await db.fundingRound.count();
    await assert.rejects(instantiateRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id, revision: 1, submissionsCloseAt: new Date(Date.now() + 60000).toISOString() }));
    assert.equal(await db.fundingRound.count(), count);
  });
  await check("template API preserves same-origin, sign-in and community staff boundaries", async () => {
    const input = { communityId: bdt.id, name: "HTTP protected setup", description: "Only authorized signed-in community staff can save this setup.", sourceRoundId: source.id };
    await post("template-save", input, "", 401);
    await post("template-save", input, admin.cookie, 403, "https://foreign.invalid");
    await post("template-save", input, member.cookie, 403);
    await post("template-save", input, admin.cookie);
  });
  await check("template library supports active member inspection but denies foreign memberships", async () => {
    const view = await getRoundTemplates(member.user.id, bdt.id);
    assert.equal(view.canManage, false);
    assert.equal(view.templates.find((row) => row.id === saved.template.id)?.revisions.length, 3);
    await assert.rejects(getRoundTemplates(outside.user.id, bdt.id));
  });
  await check("current asset totals reconcile exact received, held, reserved, paid and source refunds", async () => {
    const report = await getReleaseAnalytics(admin.user.id);
    const group = report.assets.find((asset) => asset.assetId === "fiat:BDT")!;
    assert.equal(group.received, "10000");
    assert.equal(group.held, "0");
    assert.equal(group.reserved, "0");
    assert.equal(group.paid, "6000");
    assert.equal(group.refunded, "4000");
    assert.equal(report.assets.find((asset) => asset.assetId === "fiat:USD")?.received, "0");
    assert.equal(report.assets.some((asset) => asset.currency === "EUR"), false);
  });
  await check("system report and CSV expose no open-context participation, voter IDs or raw ballots", async () => {
    const report = await getReleaseAnalytics(admin.user.id);
    const hidden = report.rounds.find((r) => r.id === open.id)!;
    assert.equal(hidden.sealed, true);
    assert.equal(hidden.participation, null);
    assert.equal(hidden.allocation, null);
    const published = report.rounds.find((r) => r.id === source.id)!;
    assert.equal(published.sealed, false);
    assert.equal(published.participation, "10000");
    assert.equal(published.eligiblePower, "10000");
    const csv = releaseAnalyticsCsv(report);
    assert.equal(csv.includes(member.user.id), false);
    assert.equal(csv.includes('"ballot"'), false);
    assert.equal(csv.includes(published.href), true);
  });
  await check("scope filters reject unauthorized communities and show complete cohorts only", async () => {
    await assert.rejects(getReleaseAnalytics(admin.user.id, { community: foreign.slug }));
    await assert.rejects(getReleaseAnalytics(outside.user.id, { community: bdt.slug }));
    const report = await getReleaseAnalytics(admin.user.id, { community: usd.slug });
    assert.equal(report.scope.roundCount, 1);
    assert.equal(report.assets.length, 1);
    assert.equal(report.assets[0].currency, "USD");
  });
  await check("visible reputation aggregate uses latest real scores and removes hidden reviews without leaking text", async () => {
    const review = await createReputationReview(member.user.id, { communityId: bdt.id, targetType: "SCHEME", targetId: scheme.id, dimension: "PRESENTATION", contextType: "ROUND", contextId: source.id, score: 4, text: "Specific participation evidence that must never appear in system analytics." });
    const visible = await getReleaseAnalytics(admin.user.id);
    assert.equal(visible.reputation[0].count, 1);
    assert.equal(visible.reputation[0].average, 4);
    assert.equal(JSON.stringify(visible.reputation).includes("Specific participation"), false);
    await moderateReputationReview(admin.user.id, { communityId: bdt.id, reviewId: review.id, action: "HIDE", reason: "Hide this isolated review to test aggregate visibility integrity." });
    assert.equal((await getReleaseAnalytics(admin.user.id)).reputation.length, 0);
    assert.equal(await db.reputationRevision.count({ where: { reviewId: review.id } }), 1);
  });
  await check("scoped CSV endpoints enforce membership, repeated-filter rejection and private caching", async () => {
    assert.equal((await fetch(origin + "/api/analytics/system/export", { redirect: "manual" })).status, 401);
    assert.equal((await fetch(origin + `/api/analytics/system/export?community=${foreign.slug}`, { headers: { Cookie: admin.cookie } })).status, 403);
    assert.equal((await fetch(origin + "/api/analytics/system/export?community=all&community=all", { headers: { Cookie: admin.cookie } })).status, 400);
    for (const dataset of ["rounds", "funds", "reputation", "chain"]) {
      const response = await fetch(origin + `/api/analytics/system/export?community=${bdt.slug}&dataset=${dataset}`, { headers: { Cookie: admin.cookie } });
      assert.equal(response.status, 200, await response.clone().text());
      assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      assert.equal(response.headers.get("vary"), "Cookie");
      assert.equal((await response.text()).includes(member.user.id), false);
    }
  });
  await check("pending veto participation and published selection details stay absent from system analysis and CSV", async () => {
    const base = new Date(Date.now() - 3.1 * day);
    const when = (days: number) => new Date(base.getTime() + days * day);
    const pending = await createFundingRound(admin.user.id, { ...sourceInput, title: "Still-sealed veto context", vetoEnabled: true, submissionsCloseAt: when(1).toISOString(), collectionClosesAt: when(0.5).toISOString(), expiresAt: when(12).toISOString() }, base);
    await fundingRoundAction(admin.user.id, { ...scope(pending.id), action: "open" }, base);
    await contributeToRound(member.user.id, { ...scope(pending.id), amount: "100.00", idempotencyKey: randomUUID() }, base);
    const candidate = await submitFundingScheme(moderator.user.id, { ...scope(pending.id), title: "A pending-veto grant candidate", description: "A protected ongoing rejection ballot whose participation must not leak into analytics.", amount: "50.00", recipient: "Pending-veto isolated recipient", category: "DONATION" }, base);
    await fundingRoundAction(admin.user.id, { ...scope(pending.id), action: "screen" }, when(1));
    for (const person of [admin, member]) await castScreeningVote(person.user.id, { ...scope(pending.id), schemeId: candidate.id, choice: "YES" }, when(1.01));
    await fundingRoundAction(admin.user.id, { ...scope(pending.id), action: "close-screening" }, when(2.01));
    await castMethodSelectionVote(member.user.id, { ...scope(pending.id), ballot: { ranking: [candidate.id] } }, when(2.02));
    await fundingRoundAction(admin.user.id, { ...scope(pending.id), action: "close-selection" }, when(3.02));
    const before = await getReleaseAnalytics(admin.user.id);
    const first = before.rounds.find((round) => round.id === pending.id)!;
    await castRoundVetoVote(admin.user.id, { ...scope(pending.id), choice: "REJECT" });
    const after = await getReleaseAnalytics(admin.user.id);
    const last = after.rounds.find((round) => round.id === pending.id)!;
    assert.equal(last.sealed, true);
    assert.equal(last.participation, null);
    assert.equal(last.eligiblePower, null);
    assert.equal(last.allocation, null);
    assert.equal(last.veto, "OPEN_SEALED");
    assert.deepEqual(last, first);
    assert.equal(releaseAnalyticsCsv(after).includes(candidate.id), false);
  });
  await check("browser template creation, instantiation and system drill-down work at desktop,390 and320 with zero accessibility violations", async () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(".local/browsers");
    const { chromium } = await import("@playwright/test");
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const browser = await chromium.launch({ headless: true });
    const scans: { route: string; width: number; violations: number }[] = [];
    const errors: string[] = [];
    mkdirSync("test-results", { recursive: true });
    try {
      const context = await browser.newContext();
      const split = admin.cookie.indexOf("=");
      await context.addCookies([{ name: admin.cookie.slice(0, split), value: admin.cookie.slice(split + 1), url: origin }]);
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      const templatesRoute = `/communities/${bdt.slug}/templates`;
      await page.goto(origin + templatesRoute, { waitUntil: "networkidle" });
      await page.getByText("Save a new template from an existing round", { exact: true }).click();
      await page.getByRole("textbox", { name: "Template name", exact: true }).fill("Browser grant playbook");
      await page.getByRole("textbox", { name: "When should this template be used?", exact: true }).fill("A browser-created reusable grant configuration with preserved exact rules.");
      await page.getByRole("combobox", { name: "Source round", exact: true }).selectOption(source.id);
      const savedResponse = page.waitForResponse((response) => response.url().endsWith("/api/template-save") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Save template", exact: true }).click();
      assert.equal((await savedResponse).status(), 200);
      await page.waitForLoadState("networkidle");
      const card = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Browser grant playbook", exact: true }) });
      await card.getByText("Create a new draft from this template", { exact: true }).click();
      await card.getByRole("textbox", { name: "New round title for Browser grant playbook", exact: true }).fill("A browser-instantiated grant draft");
      const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/template-instantiate") && response.request().method() === "POST");
      await card.getByRole("button", { name: "Create draft from template", exact: true }).click();
      assert.equal((await createdResponse).status(), 200);
      await page.waitForLoadState("networkidle");
      assert.equal(await db.fundingRound.count({ where: { title: "A browser-instantiated grant draft", templateRevisionId: { not: null }, status: "DRAFT" } }), 1);
      for (const route of [templatesRoute, "/analytics/system"]) {
        await page.goto(origin + route, { waitUntil: "networkidle" });
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}`);
          const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
          assert.equal(scan.violations.length, 0, JSON.stringify(scan.violations));
          scans.push({ route, width, violations: 0 });
          if (width !== 320) await page.screenshot({ path: `test-results/fundicate-${route.includes("templates") ? "templates" : "system-insights"}-${width}.png`, fullPage: true });
        }
      }
      await page.getByRole("button", { name: "Apply scope", exact: true }).click();
      await page.waitForLoadState("networkidle");
      await page.getByText(source.title, { exact: true }).click();
      await page.getByText("Inspect published allocation", { exact: true }).click();
      assert.ok(await page.getByRole("region", { name: `${source.title} published allocation`, exact: true }).isVisible());
      assert.deepEqual(errors, []);
      writeFileSync("test-results/release-accessibility.json", JSON.stringify({ scans, errors }, null, 2));
      console.log(`PASS release-accessibility ${scans.length} zero-violation scans`);
    } finally { await browser.close(); }
  });
  await check("archive is idempotent, preserves old snapshots and prevents new instantiation", async () => {
    const before = await db.roundTemplateRevision.count({ where: { templateId: saved.template.id } });
    await archiveRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id });
    await archiveRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id });
    await assert.rejects(instantiateRoundTemplate(admin.user.id, { communityId: bdt.id, templateId: saved.template.id, revision: 1, submissionsCloseAt: new Date(Date.now() + 7 * day).toISOString() }));
    assert.equal(await db.roundTemplateRevision.count({ where: { templateId: saved.template.id } }), before);
    assert.ok((await getRoundTemplates(member.user.id, bdt.id)).templates.find((t) => t.id === saved.template.id)?.archivedAt);
  });
  console.log(`Release insights/templates: ${checks} checks passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
