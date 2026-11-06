import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../src/lib/db";
import { createSession, sessionCookie } from "../src/lib/auth";
import { createCommunity } from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castMethodSelectionVote,
} from "../src/lib/rounds";
import { contributeToRound } from "../src/lib/funded-rounds";
import {
  METHODS,
  methodPairs,
  type MethodBallot,
} from "../src/lib/methods-core";
type Check = (name: string, fn: () => Promise<void>) => Promise<void>;
export async function runMethodBrowserChecks(check: Check) {
  const suffix = randomUUID().slice(0, 8),
    origin = process.env.APP_ORIGIN!;
  const actors = await Promise.all(
    [0, 1, 2].map((index) =>
      db.user.create({
        data: {
          username: `methodui${suffix}${index}`,
          email: `methodui${suffix}${index}@test.invalid`,
          displayName: `Method UI ${index}`,
          passwordHash: "isolated-no-password",
        },
      }),
    ),
  );
  const [admin, voter, third] = actors;
  const c = await createCommunity(admin.id, {
    name: "Method ballot browser",
    slug: `method-browser-${suffix}`,
    description:
      "A community for complete and accessible method ballot interaction.",
    purpose: "Verify sealed ranked and pairwise choices across every method.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  await db.communityMembership.createMany({
    data: actors
      .slice(1)
      .map((actor) => ({ communityId: c.id, userId: actor.id })),
  });
  const now = new Date(),
    day = 86400000,
    start = new Date(now.getTime() - 2 * day),
    sub = new Date(now.getTime() - day),
    screening = new Date(now.getTime() - 2 * 3600000),
    selection = new Date(now.getTime() - 3600000);
  const scope = (roundId: string) => ({ communityId: c.id, roundId });
  const fixtures = [];
  for (const method of METHODS) {
    const r = await createFundingRound(
      admin.id,
      {
        communityId: c.id,
        title: `Browser ${method} method round`,
        description:
          "A complete immutable election method with accessible sealed choices.",
        proposalPolicy: "MEMBERS",
        quorumBps: 5000,
        funded: true,
        fundedVersion: "V4",
        fundingTarget: "1",
        minimumContribution: "0.01",
        maximumContribution: "10",
        submissionsCloseAt: sub.toISOString(),
        collectionClosesAt: sub.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * day).toISOString(),
        selectionMethod: method,
        selectionSeats: method === "STV" ? 2 : 1,
        screeningWeight: "EQUAL",
        selectionWeight: "EQUAL",
        vetoWeight: "EQUAL",
        allocationPolicy: "PROPORTIONAL",
        rankedSharesBps: [],
        vetoEnabled: false,
      },
      start,
    );
    await fundingRoundAction(
      admin.id,
      { ...scope(r.id), action: "open" },
      start,
    );
    await contributeToRound(
      admin.id,
      { ...scope(r.id), amount: "1", idempotencyKey: randomUUID() },
      start,
    );
    const schemes = [];
    // Seven Glicko schemes exercise the second comparison page (21 pairs).
    for (let index = 0; index < (method === "GLICKO_2" ? 7 : 3); index++)
      schemes.push(
        await submitFundingScheme(
          index < 5 ? admin.id : third.id,
          {
            ...scope(r.id),
            title: `${method} project ${index + 1}`,
            description:
              "A detailed useful shared project with a published recipient and fixed cap.",
            amount: "1",
            recipient: `Method UI recipient ${index + 1}`,
            category: "DONATION",
            supportingUrl: "",
          },
          start,
        ),
      );
    await fundingRoundAction(
      admin.id,
      { ...scope(r.id), action: "screen" },
      screening,
    );
    for (const scheme of schemes)
      for (const actor of actors)
        await castScreeningVote(
          actor.id,
          { ...scope(r.id), schemeId: scheme.id, choice: "YES" },
          new Date(screening.getTime() + 60000),
        );
    await fundingRoundAction(
      admin.id,
      { ...scope(r.id), action: "close-screening" },
      selection,
    );
    schemes.sort((a, b) => (a.id < b.id ? -1 : 1));
    fixtures.push({ r, method, schemes });
  }
  const session = await createSession(voter.id),
    browser = await chromium.launch({ headless: true });
  const scans: {
      method: string;
      width: number;
      state: string;
      violations: number;
    }[] = [],
    errors: string[] = [];
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: sessionCookie,
        value: session.token,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    for (const fixture of fixtures)
      await check(
        `V4 ${fixture.method} complete browser ballot, sealed/revealed boundaries and responsive accessibility`,
        async () => {
          const { r, method, schemes } = fixture,
            route = `${origin}/communities/${c.slug}/rounds/${r.id}`;
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.goto(route);
          await page.locator(".method-ballot").waitFor();
          if (method === "FPTP") {
            const rulesContext = await browser.newContext(),
              rulesPage = await rulesContext.newPage();
            await rulesPage.goto(route);
            await rulesPage
              .getByText("Explore voting and allocation rules", { exact: true })
              .click();
            await rulesPage
              .getByRole("link", {
                name: "Read the full published method specification",
              })
              .first()
              .click();
            const text = await rulesPage
              .locator(".method-specification")
              .innerText();
            for (const term of [
              "tau0.5",
              "K=32",
              "lexicographically greatest",
              "inclusive Gregory",
              "1,225",
              "RANK_POINTS_V1",
            ])
              assert.ok(
                text.includes(term),
                `Anonymous pre-vote rules include ${term}`,
              );
            await rulesContext.close();
          }
          const form = page.locator(".method-ballot");
          if (method === "FPTP")
            await form
              .getByRole("combobox", {
                name: "Your chosen scheme",
                exact: true,
              })
              .selectOption(schemes[0].id);
          else if (method === "IRV" || method === "STV")
            for (const [i, scheme] of schemes.entries())
              await form
                .getByRole("combobox", {
                  name: `Preference for ${scheme.title}`,
                  exact: true,
                })
                .selectOption(String(i + 1));
          else {
            const pairs = methodPairs(schemes.map((s) => s.id)),
              names = Object.fromEntries(schemes.map((s) => [s.id, s.title]));
            if (pairs.length > 20) {
              await form
                .getByRole("button", { name: "Seal my method ballot" })
                .click();
              assert.match(
                await form.getByRole("alert").innerText(),
                /Complete every assigned comparison/,
              );
            }
            for (let index = 0; index < pairs.length; index++) {
              if (index && index % 20 === 0)
                await form
                  .getByRole("button", { name: "Next comparisons" })
                  .click();
              const pair = pairs[index];
              await form
                .getByRole("combobox", {
                  name: `${names[pair.a]} versus ${names[pair.b]}`,
                  exact: true,
                })
                .selectOption("A");
            }
            if (pairs.length > 20) {
              await form
                .getByRole("button", { name: "Previous comparisons" })
                .click();
              assert.equal(
                await form.locator("select").first().inputValue(),
                "A",
              );
              await form.locator("select").first().selectOption("");
              assert.match(await form.innerText(), /20 complete/);
              await form.locator("select").first().selectOption("A");
              assert.match(await form.innerText(), /21 complete/);
              await form
                .getByRole("button", { name: "Next comparisons" })
                .click();
            }
          }
          for (const width of [1280, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              true,
              `${method} fits ${width}`,
            );
            const scan = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            assert.equal(
              scan.violations.length,
              0,
              JSON.stringify(scan.violations),
            );
            scans.push({ method, width, state: "ballot", violations: 0 });
            if (method === "IRV" || method === "GLICKO_2") {
              mkdirSync("test-results", { recursive: true });
              await page.evaluate(() => {
                (document.activeElement as HTMLElement)?.blur();
                window.scrollTo({ top: 0, behavior: "instant" });
              });
              await page.waitForFunction(() => scrollY === 0);
              await page.screenshot({
                path: `test-results/fundicate-method-${method}-${width}.png`,
                fullPage: true,
              });
            }
          }
          const response = page.waitForResponse(
            (res) =>
              res.url().endsWith("/api/round-method-vote") &&
              res.request().method() === "POST",
          );
          await form
            .getByRole("button", { name: "Seal my method ballot" })
            .click();
          assert.equal((await response).status(), 200);
          await page
            .getByText("Your recorded method ballot", { exact: true })
            .waitFor();
          assert.equal(
            await page
              .getByText("Election replay, seats and calculation details", {
                exact: true,
              })
              .count(),
            0,
          );
          const anonymous = await browser.newContext();
          const publicPage = await anonymous.newPage();
          await publicPage.goto(route);
          assert.equal(
            await publicPage
              .getByText("Published method ballots", { exact: true })
              .count(),
            0,
          );
          assert.equal(
            await publicPage
              .getByText("Your recorded method ballot", { exact: true })
              .count(),
            0,
          );
          await anonymous.close();
          const ballot: MethodBallot =
            method === "FPTP"
              ? { schemeId: schemes[0].id }
              : method === "IRV" || method === "STV"
                ? { ranking: schemes.map((s) => s.id) }
                : {
                    pairs: methodPairs(schemes.map((s) => s.id)).map((p) => ({
                      ...p,
                      choice: "A",
                    })),
                  };
          for (const actor of [admin, third])
            await castMethodSelectionVote(actor.id, { ...scope(r.id), ballot });
          await fundingRoundAction(admin.id, {
            ...scope(r.id),
            action: "close-selection",
          });
          await page.reload();
          await page
            .getByText("Election replay, seats and calculation details", {
              exact: true,
            })
            .waitFor();
          await page
            .getByText("Election replay, seats and calculation details", {
              exact: true,
            })
            .click();
          assert.equal(
            await page
              .getByText("Published method ballots", { exact: true })
              .count(),
            1,
          );
          const scan = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          assert.equal(
            scan.violations.length,
            0,
            JSON.stringify(scan.violations),
          );
          scans.push({ method, width: 320, state: "published", violations: 0 });
        },
      );
    const adminSession = await createSession(admin.id);
    await context.addCookies([
      {
        name: sessionCookie,
        value: adminSession.token,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto(`${origin}/communities/${c.slug}/rounds/new`);
    await page
      .getByLabel("Collect a dedicated funding pool for this round")
      .check();
    await page.getByLabel("Funded rules version").selectOption("V4");
    for (const method of METHODS) {
      await page
        .getByRole("combobox", { name: "Selection method", exact: true })
        .selectOption(method);
      if (method === "STV") {
        assert.equal(
          await page.getByLabel("STV seats", { exact: true }).inputValue(),
          "2",
        );
        assert.equal(
          await page
            .getByRole("spinbutton", { name: "STV seats", exact: true })
            .getAttribute("step"),
          "1",
        );
      }
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    mkdirSync(".local", { recursive: true });
    writeFileSync(
      ".local/methods-accessibility.json",
      JSON.stringify(scans, null, 2),
    );
    console.log(
      `PASS ${scans.length} V4 method WCAG A/AA scans, all six browser ballots, no runtime errors.`,
    );
  } finally {
    await browser.close();
  }
}
