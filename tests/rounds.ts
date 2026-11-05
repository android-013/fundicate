import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { createCommunity } from "../src/lib/service";
import {
  createFundingRound,
  submitFundingScheme,
  fundingRoundAction,
  castScreeningVote,
  castSelectionVote,
  getFundingRoundView,
} from "../src/lib/rounds";
import { ROUND_STAGE_MS as day } from "../src/lib/rounds-core";
const origin = process.env.APP_ORIGIN!;
let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
async function post(
  operation: string,
  body: unknown,
  cookie = "",
  status = 200,
  requestOrigin = origin,
) {
  const res = await fetch(origin + "/api/" + operation, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const json = await res.json();
  assert.equal(res.status, status, JSON.stringify(json));
  return json;
}
async function account(name: string) {
  const res = await fetch(origin + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: `${name}@rounds.invalid`,
      username: name,
      displayName: name,
      password: "RoundsSecurePassword!2026",
    }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return {
    user: await db.user.findUniqueOrThrow({
      where: { email: `${name}@rounds.invalid` },
    }),
    cookie,
  };
}
async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
  );
  const [admin, member, outsider, late] = await Promise.all(
    ["roundadmin", "roundmember", "roundoutside", "roundlate"].map(account),
  );
  const c = await createCommunity(admin.user.id, {
    name: "Shared Possibilities",
    slug: "shared-possibilities",
    description: "A community for transparent and collective funding choices.",
    purpose: "Choose among useful plans with clear rules and fair voting.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  // Isolated membership fixture; the existing admission workflow has its own regression suite.
  await db.communityMembership.create({
    data: { communityId: c.id, userId: member.user.id },
  });
  const old = new Date(Date.now() - 2 * day);
  const input = {
    communityId: c.id,
    title: "The next chapter, chosen together",
    description:
      "Submit practical schemes that build a more connected neighborhood.",
    proposalPolicy: "EVERYONE",
    quorumBps: 5000,
    submissionsCloseAt: new Date(old.getTime() + day).toISOString(),
  };
  const schemeInput = {
    communityId: c.id,
    title: "A useful plan for everyone",
    description: "A practical and detailed scheme for our shared neighborhood.",
    amount: "150.25",
    recipient: "Community project",
    supportingUrl: "https://example.com/plan",
  };
  async function submittedRound(title: string, policy = "EVERYONE") {
    const r = await createFundingRound(
      admin.user.id,
      { ...input, title, proposalPolicy: policy },
      old,
    );
    await fundingRoundAction(
      admin.user.id,
      { communityId: c.id, roundId: r.id, action: "open" },
      old,
    );
    return r;
  }
  const r = await submittedRound("Choose our neighborhood’s next project");
  const base = { communityId: c.id, roundId: r.id };
  let a: Awaited<ReturnType<typeof submitFundingScheme>>,
    b: typeof a,
    d: typeof a;
  await check(
    "staff-only creation, same-origin protection and validated immutable configuration",
    async () => {
      const future = {
        ...input,
        title: "PRIVATE_DRAFT_ONLY visitor exclusion check",
        submissionsCloseAt: new Date(Date.now() + day).toISOString(),
      };
      await post("funding-round", future, "", 401);
      await post("funding-round", future, member.cookie, 403);
      await post("funding-round", future, outsider.cookie, 403);
      await post(
        "funding-round",
        future,
        admin.cookie,
        403,
        "https://forged.invalid",
      );
      await post(
        "funding-round",
        { ...future, quorumBps: 0 },
        admin.cookie,
        400,
      );
      await post(
        "funding-round",
        { ...future, creatorId: outsider.user.id },
        admin.cookie,
        400,
      );
      const data = await post("funding-round", future, admin.cookie);
      const id = data.redirect.split("/").at(-1);
      assert.equal(
        (await db.fundingRound.findUniqueOrThrow({ where: { id } })).creatorId,
        admin.user.id,
      );
      const publicDraft = await fetch(origin + data.redirect);
      // Next returns 200 for a not-found boundary after layout streaming starts.
      assert.ok([200, 404].includes(publicDraft.status));
      const draftHtml = await publicDraft.text();
      assert.ok(draftHtml.includes("This page hasn’t found its people."));
      assert.ok(!draftHtml.includes("PRIVATE_DRAFT_ONLY"));
      await assert.rejects(
        () => getFundingRoundView(c.id, id),
        (e) =>
          Boolean(
            e && typeof e === "object" && "status" in e && e.status === 404,
          ),
      );
    },
  );
  await check(
    "new-round page requires sign-in and submission deadlines cannot be bypassed",
    async () => {
      const page = await fetch(origin + `/communities/${c.slug}/rounds/new`, {
        redirect: "manual",
      });
      assert.equal(page.status, 307);
      await post(
        "funding-round",
        { ...input, now: old.toISOString() },
        admin.cookie,
        400,
      );
      const x = await createFundingRound(admin.user.id, {
        ...input,
        title: "An open submission window stays open",
        submissionsCloseAt: new Date(Date.now() + day).toISOString(),
      });
      await post(
        "round-action",
        { communityId: c.id, roundId: x.id, action: "open" },
        admin.cookie,
      );
      await post(
        "round-action",
        { communityId: c.id, roundId: x.id, action: "screen" },
        admin.cookie,
        400,
      );
    },
  );
  await check(
    "public scheme submission supports non-members without granting voting membership",
    async () => {
      a = await submitFundingScheme(
        outsider.user.id,
        { ...schemeInput, ...base, title: "A welcoming shared workshop" },
        old,
      );
      b = await submitFundingScheme(
        member.user.id,
        { ...schemeInput, ...base, title: "A neighborhood tool library" },
        old,
      );
      d = await submitFundingScheme(
        admin.user.id,
        { ...schemeInput, ...base, title: "A community skills exchange" },
        old,
      );
      assert.equal(
        await db.communityMembership.count({
          where: { communityId: c.id, userId: outsider.user.id },
        }),
        0,
      );
    },
  );
  await check(
    "published rules, scheme content and staff cancellation are locked",
    async () => {
      await assert.rejects(() =>
        db.fundingRound.update({
          where: { id: r.id },
          data: { quorumBps: 10000 },
        }),
      );
      await assert.rejects(() =>
        db.fundingScheme.update({ where: { id: a.id }, data: { amount: 1n } }),
      );
      await post(
        "round-action",
        { ...base, action: "cancel" },
        admin.cookie,
        400,
      );
    },
  );
  const other = await submittedRound(
    "Members-only separate funding round",
    "MEMBERS",
  );
  await check(
    "submission policies, caps and cross-community identifiers are enforced",
    async () => {
      await assert.rejects(
        () =>
          submitFundingScheme(
            outsider.user.id,
            { ...schemeInput, roundId: other.id },
            old,
          ),
        /active community members/,
      );
      for (let i = 0; i < 5; i++)
        await submitFundingScheme(
          admin.user.id,
          {
            ...schemeInput,
            roundId: other.id,
            title: `Member scheme number ${i + 1}`,
          },
          old,
        );
      await assert.rejects(
        () =>
          submitFundingScheme(
            admin.user.id,
            { ...schemeInput, roundId: other.id },
            old,
          ),
        /five schemes/,
      );
      await post(
        "round-action",
        { ...base, communityId: other.id, action: "screen" },
        admin.cookie,
        404,
      );
      await post(
        "round-scheme",
        { ...schemeInput, ...base },
        outsider.cookie,
        400,
      ); // Submission deadline has passed.
    },
  );
  await check(
    "screening freezes the electorate and rejects non-staff stage changes",
    async () => {
      await post(
        "round-action",
        { ...base, action: "screen" },
        member.cookie,
        403,
      );
      await post("round-action", { ...base, action: "screen" }, admin.cookie);
      assert.equal(
        await db.roundElectorate.count({ where: { roundId: r.id } }),
        2,
      );
      const row = await db.fundingRound.findUniqueOrThrow({
        where: { id: r.id },
      });
      assert.equal(
        row.screeningClosesAt!.getTime() - row.screeningOpensAt!.getTime(),
        day,
      );
      await post(
        "round-action",
        { ...base, action: "close-screening" },
        admin.cookie,
        400,
      );
    },
  );
  await check(
    "screening privacy includes anonymous views, other members and public audit details",
    async () => {
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "YES" },
        admin.cookie,
      );
      const publicView = await getFundingRoundView(c.id, r.id);
      const otherView = await getFundingRoundView(c.id, r.id, member.user.id);
      assert.equal(publicView.screeningResults, null);
      assert.equal(publicView.screeningBallots, null);
      assert.deepEqual(publicView.ownScreens, {});
      assert.deepEqual(otherView.ownScreens, {});
      assert.equal(
        (await getFundingRoundView(c.id, r.id, admin.user.id)).ownScreens[a.id],
        "YES",
      );
      const events = await db.auditEvent.findMany({
        where: { entityId: r.id },
      });
      assert.ok(
        events.every((e) => !JSON.stringify(e.details).includes('"choice"')),
      );
    },
  );
  await check(
    "duplicate, ineligible, late-member and cross-round screening votes fail",
    async () => {
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "NO" },
        admin.cookie,
        409,
      );
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "YES" },
        outsider.cookie,
        403,
      );
      await db.communityMembership.create({
        data: { communityId: c.id, userId: late.user.id },
      });
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "YES" },
        late.cookie,
        403,
      );
      const foreign = await db.fundingScheme.findFirstOrThrow({
        where: { roundId: other.id },
      });
      await post(
        "round-screen-vote",
        { ...base, schemeId: foreign.id, choice: "YES" },
        member.cookie,
        404,
      );
    },
  );
  await check(
    "screening ballots and voter snapshots are immutable in PostgreSQL",
    async () => {
      await assert.rejects(() =>
        db.schemeScreeningVote.updateMany({
          where: { roundId: r.id },
          data: { choice: "NO" },
        }),
      );
      await assert.rejects(() =>
        db.schemeScreeningVote.deleteMany({ where: { roundId: r.id } }),
      );
      await assert.rejects(() =>
        db.roundElectorate.deleteMany({ where: { roundId: r.id } }),
      );
      await assert.rejects(() =>
        db.roundElectorate.create({
          data: { roundId: r.id, userId: late.user.id },
        }),
      );
    },
  );
  await check(
    "suspended voters cannot vote and restored frozen members can continue",
    async () => {
      const key = {
        communityId_userId: { communityId: c.id, userId: member.user.id },
      };
      await db.communityMembership.update({
        where: key,
        data: { status: "SUSPENDED" },
      });
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "YES" },
        member.cookie,
        403,
      );
      await db.communityMembership.update({
        where: key,
        data: { status: "ACTIVE" },
      });
      await post(
        "round-screen-vote",
        { ...base, schemeId: a.id, choice: "YES" },
        member.cookie,
      );
    },
  );
  await check(
    "screening and selection are separate elections; ties fail strict screening majority",
    async () => {
      for (const [scheme, person, choice] of [
        [b, admin, "YES"],
        [b, member, "NO"],
        [d, admin, "YES"],
        [d, member, "YES"],
      ] as const)
        await post(
          "round-screen-vote",
          { ...base, schemeId: scheme.id, choice },
          person.cookie,
        );
      await post(
        "round-action",
        { ...base, action: "close-screening" },
        admin.cookie,
      );
      const view = await getFundingRoundView(c.id, r.id);
      assert.equal(view.round.status, "SELECTION");
      assert.equal(view.screeningBallots!.length, 6);
      assert.deepEqual(
        view.round.schemes
          .filter((s) => s.status === "QUALIFIED")
          .map((s) => s.id)
          .sort(),
        [a.id, d.id].sort(),
      );
      assert.equal(view.selectionResults, null);
      assert.equal(view.selectionBallots, null);
      await post(
        "round-selection-vote",
        { ...base, schemeId: b.id },
        admin.cookie,
        400,
      );
      await post(
        "round-screen-vote",
        { ...base, schemeId: b.id, choice: "YES" },
        member.cookie,
        400,
      );
    },
  );
  await check(
    "selection preserves secrecy, one ballot per voter and frozen eligibility",
    async () => {
      await post(
        "round-selection-vote",
        { ...base, schemeId: a.id },
        admin.cookie,
      );
      await post(
        "round-selection-vote",
        { ...base, schemeId: d.id },
        admin.cookie,
        409,
      );
      await post(
        "round-selection-vote",
        { ...base, schemeId: a.id },
        late.cookie,
        403,
      );
      await post(
        "round-action",
        { ...base, action: "close-selection" },
        admin.cookie,
        400,
      );
      const view = await getFundingRoundView(c.id, r.id, member.user.id);
      assert.equal(view.ownSelection, null);
      assert.equal(view.selectionResults, null);
      assert.equal(view.selectionBallots, null);
    },
  );
  await check(
    "tied selection publishes ballots and leaves the treasury unchanged",
    async () => {
      await post(
        "round-selection-vote",
        { ...base, schemeId: d.id },
        member.cookie,
      );
      await post(
        "round-action",
        { ...base, action: "close-selection" },
        admin.cookie,
      );
      const view = await getFundingRoundView(c.id, r.id);
      assert.equal(view.round.outcome, "TIED");
      assert.equal(view.round.winnerSchemeId, null);
      assert.equal(view.selectionBallots!.length, 2);
      await assert.rejects(() =>
        db.roundSelectionVote.updateMany({
          where: { roundId: r.id },
          data: { schemeId: d.id },
        }),
      );
      await post(
        "round-action",
        { ...base, action: "close-selection" },
        admin.cookie,
        400,
      );
      assert.equal(
        await db.ledgerTransaction.count({ where: { communityId: c.id } }),
        0,
      );
    },
  );
  const voters = [admin, member, late];
  async function qualifiedRound(title: string) {
    const round = await submittedRound(title);
    const scheme = await submitFundingScheme(
      outsider.user.id,
      { ...schemeInput, roundId: round.id },
      old,
    );
    const x = { communityId: c.id, roundId: round.id };
    await fundingRoundAction(admin.user.id, { ...x, action: "screen" });
    for (const p of voters)
      await castScreeningVote(p.user.id, {
        ...x,
        schemeId: scheme.id,
        choice: "YES",
      });
    await fundingRoundAction(admin.user.id, {
      ...x,
      action: "close-screening",
    });
    return { round, scheme, x };
  }
  const winner = await qualifiedRound(
    "A complete decision, with a recorded winner",
  );
  await check(
    "unique FPTP winner is final without creating a payment or legacy proposal",
    async () => {
      for (const p of voters)
        await castSelectionVote(p.user.id, {
          ...winner.x,
          schemeId: winner.scheme.id,
        });
      await fundingRoundAction(admin.user.id, {
        ...winner.x,
        action: "close-selection",
      });
      const row = await db.fundingRound.findUniqueOrThrow({
        where: { id: winner.round.id },
      });
      assert.equal(row.outcome, "WINNER_SELECTED");
      assert.equal(row.winnerSchemeId, winner.scheme.id);
      await assert.rejects(() =>
        db.fundingRound.update({
          where: { id: row.id },
          data: { winnerSchemeId: a.id },
        }),
      );
      await post(
        "proposal-action",
        { communityId: c.id, proposalId: row.id, action: "execute" },
        admin.cookie,
        404,
      );
      assert.equal(
        await db.ledgerTransaction.count({ where: { communityId: c.id } }),
        0,
      );
      assert.equal(
        await db.proposal.count({ where: { communityId: c.id } }),
        0,
      );
    },
  );
  await check(
    "deadline boundaries reject late ballots and no-quorum selection picks no winner",
    async () => {
      const x = await qualifiedRound(
        "A selection that does not reach participation quorum",
      );
      const row = await db.fundingRound.findUniqueOrThrow({
        where: { id: x.round.id },
      });
      await assert.rejects(
        () =>
          castSelectionVote(
            admin.user.id,
            { ...x.x, schemeId: x.scheme.id },
            row.selectionClosesAt!,
          ),
        /not open/,
      );
      await fundingRoundAction(
        admin.user.id,
        { ...x.x, action: "close-selection" },
        row.selectionClosesAt!,
      );
      assert.equal(
        (await db.fundingRound.findUniqueOrThrow({ where: { id: x.round.id } }))
          .outcome,
        "NO_QUORUM",
      );
    },
  );
  await check(
    "empty rounds and rejected schemes conclude without a winner",
    async () => {
      const empty = await submittedRound(
        "An empty round can finish after submissions",
      );
      await fundingRoundAction(admin.user.id, {
        communityId: c.id,
        roundId: empty.id,
        action: "screen",
      });
      assert.equal(
        (await db.fundingRound.findUniqueOrThrow({ where: { id: empty.id } }))
          .outcome,
        "NO_QUALIFIED",
      );
      const x = await submittedRound("A screening where no scheme qualifies");
      const scheme = await submitFundingScheme(
        outsider.user.id,
        { ...schemeInput, roundId: x.id },
        old,
      );
      const base = { communityId: c.id, roundId: x.id };
      await fundingRoundAction(admin.user.id, { ...base, action: "screen" });
      for (const p of voters)
        await castScreeningVote(p.user.id, {
          ...base,
          schemeId: scheme.id,
          choice: "NO",
        });
      await fundingRoundAction(admin.user.id, {
        ...base,
        action: "close-screening",
      });
      const view = await getFundingRoundView(c.id, x.id);
      assert.equal(view.round.outcome, "NO_QUALIFIED");
      assert.equal(view.round.selectionOpensAt, null);
    },
  );
  // Browser checks use this same throwaway database, never the demonstration database.
  const pending = await submittedRound(
    "Screening stays private until its stage closes",
  );
  const pendingScheme = await submitFundingScheme(
    outsider.user.id,
    { ...schemeInput, roundId: pending.id },
    old,
  );
  await fundingRoundAction(admin.user.id, {
    communityId: c.id,
    roundId: pending.id,
    action: "screen",
  });
  const selectionPending = await qualifiedRound(
    "Choose a qualified scheme in a separate election",
  );
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
  process.env.TEMP = resolve(".local/browser-temp");
  process.env.TMP = process.env.TEMP;
  mkdirSync(process.env.TEMP, { recursive: true });
  mkdirSync("test-results", { recursive: true });
  const { chromium } = await import("@playwright/test");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const scans: { path: string; violations: unknown[] }[] = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const split = admin.cookie.indexOf("=");
    await context.addCookies([
      {
        name: admin.cookie.slice(0, split),
        value: admin.cookie.slice(split + 1),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    const root = `/communities/${c.slug}/rounds`;
    const noOverflow = async () =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        page.url(),
      );
    const scan = async (path: string) => {
      await noOverflow();
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      scans.push({ path, violations: r.violations });
      assert.equal(
        r.violations.length,
        0,
        JSON.stringify(
          r.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
        ),
      );
    };
    await check(
      "browser creates and opens a round, then submits a scheme",
      async () => {
        await page.goto(origin + root + "/new", { waitUntil: "networkidle" });
        await scan("new round");
        await page
          .getByLabel("Round title", { exact: true })
          .fill("An idea becomes a shared decision");
        await page
          .getByLabel("Purpose and submission requirements")
          .fill(
            "Bring practical ideas that strengthen our shared community and create lasting connections.",
          );
        await page
          .getByRole("button", { name: "Create draft round", exact: true })
          .click();
        await page.waitForURL(/\/rounds\/[a-f0-9-]{36}$/);
        await page
          .getByRole("button", { name: "Open submissions", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "Bring an idea to the round.",
            exact: true,
          })
          .waitFor();
        await page
          .getByLabel("Scheme title", { exact: true })
          .fill("A shared garden for our neighborhood");
        await page
          .getByLabel("Your plan and expected impact")
          .fill(
            "Turn an unused area into a welcoming garden where neighbors can grow food and meet.",
          );
        await page
          .getByLabel("Requested amount (USD)", { exact: true })
          .fill("250");
        await page
          .getByLabel("Recipient or project name")
          .fill("Neighborhood garden team");
        await page
          .getByRole("button", { name: "Submit scheme", exact: true })
          .click();
        await page
          .getByRole("heading", {
            name: "A shared garden for our neighborhood",
            exact: true,
          })
          .waitFor();
        await scan("submissions");
        await page.screenshot({
          path: "test-results/fundicate-round-submissions.png",
          fullPage: true,
        });
      },
    );
    await check(
      "browser records a sealed screening ballot and shows only the voter’s own choice",
      async () => {
        await page.goto(origin + root + "/" + pending.id, {
          waitUntil: "networkidle",
        });
        await page
          .getByLabel(`Screen ${pendingScheme.title}`)
          .selectOption("YES");
        await page
          .getByRole("button", { name: "Seal screening vote", exact: true })
          .click();
        await page
          .getByText("Your recorded screening choice: YES", { exact: true })
          .waitFor();
        await scan("sealed screening");
        await page.screenshot({
          path: "test-results/fundicate-round-screening.png",
          fullPage: true,
        });
        const publicPage = await browser.newPage();
        await publicPage.goto(origin + root + "/" + pending.id, {
          waitUntil: "networkidle",
        });
        assert.equal(
          await publicPage
            .getByText("Your recorded screening choice: YES", { exact: true })
            .count(),
          0,
        );
        assert.equal(
          await publicPage
            .getByText("Published individual ballots", { exact: true })
            .count(),
          0,
        );
        await publicPage.close();
      },
    );
    await check(
      "browser records a selection while keeping other selection ballots hidden",
      async () => {
        await page.goto(origin + root + "/" + selectionPending.round.id, {
          waitUntil: "networkidle",
        });
        await page
          .getByLabel("Your chosen scheme")
          .selectOption(selectionPending.scheme.id);
        await page
          .getByRole("button", { name: "Seal my selection", exact: true })
          .click();
        await page
          .getByText(
            `Your recorded selection: ${selectionPending.scheme.title}`,
            { exact: true },
          )
          .waitFor();
        await scan("sealed selection");
        await page.screenshot({
          path: "test-results/fundicate-round-selection.png",
          fullPage: true,
        });
        const visitor = await browser.newPage();
        await visitor.goto(origin + root + "/" + selectionPending.round.id, {
          waitUntil: "networkidle",
        });
        assert.equal(
          await visitor
            .getByRole("heading", { name: "Selection results", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await visitor
            .getByRole("heading", { name: "Selection ballots", exact: true })
            .count(),
          0,
        );
        await visitor.close();
      },
    );
    await check(
      "round list, published results and existing proposal navigation render on desktop and phones",
      async () => {
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 1000 : 844,
          });
          for (const route of [
            root,
            root + "/new",
            root + "/" + pending.id,
            root + "/" + selectionPending.round.id,
            root + "/" + winner.round.id,
          ]) {
            await page.goto(origin + route, { waitUntil: "networkidle" });
            await noOverflow();
            if (width !== 320) await scan(`${route} (${width})`);
            if (route === root && width === 1440)
              await page.screenshot({
                path: "test-results/fundicate-round-list.png",
                fullPage: true,
              });
            if (route.endsWith(winner.round.id) && width !== 320) {
              await page
                .getByText("Published individual ballots", { exact: true })
                .click();
              await page.screenshot({
                path: `test-results/fundicate-round-decision-${width}.png`,
                fullPage: true,
              });
            }
          }
        }
        await page
          .getByRole("link", { name: "Proposals", exact: true })
          .click();
        await page.waitForURL("**/proposals");
        assert.equal(errors.length, 0, errors.join("\n"));
      },
    );
    writeFileSync(
      ".local/rounds-accessibility.json",
      JSON.stringify(scans, null, 2),
    );
    console.log(
      `PASS ${scans.length} funding-round WCAG A/AA scans; no violations.`,
    );
  } finally {
    await browser.close();
  }
  console.log(
    `PASS ${checks} funding-round integrity, authorization, privacy, HTTP and browser checks.`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
