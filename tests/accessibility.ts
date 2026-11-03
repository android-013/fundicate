import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({
  channel: process.env.FUNDICATE_BROWSER === "chromium" ? undefined : "msedge",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const reports = [];
try {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(origin + path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    reports.push({ path, violations: results.violations });
  }
  await page.goto(origin + "/login");
  await page.getByLabel("Email address").fill("amara@fundicate.demo");
  await page.getByLabel("Password", { exact: true }).fill("FundicateDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  for (const path of [
    "/dashboard",
    "/explore",
    "/communities/new",
    "/communities/campus-collective",
    "/communities/campus-collective/treasury",
    "/communities/campus-collective/members",
    "/communities/campus-collective/proposals",
    "/communities/campus-collective/proposals/new",
    "/communities/campus-collective/governance",
    "/communities/campus-collective/activity",
    "/settings/profile",
    "/settings/security",
  ]) {
    await page.goto(origin + path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    reports.push({ path, violations: results.violations });
  }
  await page.goto(origin + "/communities/campus-collective/proposals");
  const detail = await page
    .locator(".proposal-card")
    .first()
    .getAttribute("href");
  if (detail) {
    await page.goto(origin + detail);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    reports.push({ path: detail, violations: results.violations });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/dashboard",
    "/explore",
    "/communities/campus-collective/treasury",
  ]) {
    await page.goto(origin + path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    reports.push({ path: `${path} (mobile)`, violations: results.violations });
  }
  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/accessibility.json", JSON.stringify(reports, null, 2));
  console.log(
    JSON.stringify(
      reports.map((r) => ({
        path: r.path,
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes
            .slice(0, 5)
            .map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      })),
      null,
      2,
    ),
  );
  if (reports.some((r) => r.violations.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
