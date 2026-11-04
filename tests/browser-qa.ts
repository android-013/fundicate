import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
const output = process.env.QA_OUTPUT_DIR ?? "test-results";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.FUNDICATE_BROWSER === "chromium" ? undefined : "msedge",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
let checks = 0;
async function noOverflow() {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    `Horizontal overflow on ${page.url()}`,
  );
  checks++;
}
try {
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /A network of people/ }).waitFor();
  await noOverflow();
  await page.screenshot({
    path: `${output}/fundicate-landing-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("amara@fundicate.demo");
  await page.getByLabel("Password", { exact: true }).fill("FundicateDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("heading", { name: /Good to see you, Amara/ }).waitFor();
  checks++;
  await noOverflow();
  await page.screenshot({ path: `${output}/fundicate-dashboard-preview.png` });
  await page.screenshot({
    path: `${output}/fundicate-dashboard-desktop.png`,
    fullPage: true,
  });
  for (const route of [
    "/explore",
    "/communities/campus-collective",
    "/communities/campus-collective/members",
    "/communities/campus-collective/treasury",
    "/communities/campus-collective/proposals",
    "/communities/campus-collective/governance",
    "/communities/campus-collective/activity",
    "/settings/profile",
    "/settings/security",
    "/analytics",
    "/analytics/treasury",
    "/analytics/governance",
    "/analytics/network",
    "/analytics/personal",
    "/analytics/records",
  ]) {
    await page.goto(origin + route, { waitUntil: "networkidle" });
    await noOverflow();
    const alerts = await page.getByRole("alert").allTextContents();
    assert.ok(
      alerts.every((text) => !text.trim()),
      `${route}: ${alerts.join(" | ")}`,
    );
    checks++;
  }
  await page.goto(origin + "/communities/campus-collective/proposals/new", {
    waitUntil: "networkidle",
  });
  await page.getByLabel("Decision type").selectOption("GOVERNANCE");
  await page.getByLabel("Proposed admission policy").waitFor();
  checks++;
  await page.goto(origin + "/dashboard", { waitUntil: "networkidle" });
  await page.locator(".customize-dashboard>summary").click();
  const inputs = page.locator(".customize-panel input[type=checkbox]");
  const original = await inputs.evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLInputElement).checked),
  );
  await page.getByLabel("Network & growth", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Save dashboard", exact: true })
    .click();
  await page.getByText("Dashboard saved", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByText("Your connected collective", { exact: true }).count(),
    0,
  );
  await page.locator(".customize-dashboard>summary").click();
  for (let i = 0; i < original.length; i++)
    await inputs.nth(i).setChecked(original[i]);
  await page
    .getByRole("button", { name: "Save dashboard", exact: true })
    .click();
  await page.getByText("Dashboard saved", { exact: true }).waitFor();
  checks++;
  await page.goto(origin + "/analytics/treasury?range=all", {
    waitUntil: "networkidle",
  });
  const viewName = `Browser QA ${Date.now()}`;
  await page.locator(".save-view>summary").click();
  await page.getByLabel("View name", { exact: true }).fill(viewName);
  await page
    .getByRole("button", { name: "Save analysis", exact: true })
    .click();
  await page.getByText("View saved", { exact: true }).waitFor();
  await page.goto(origin + "/analytics", { waitUntil: "networkidle" });
  const saved = page.locator(".saved-view-item").filter({ hasText: viewName });
  await saved.getByRole("link").click();
  await page.waitForURL("**/analytics/treasury?**");
  assert.ok(page.url().includes("range=all"));
  await page.goto(origin + "/analytics", { waitUntil: "networkidle" });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(".saved-view-item")
    .filter({ hasText: viewName })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page.waitForFunction(
    (name) =>
      ![...document.querySelectorAll(".saved-view-item")].some((el) =>
        el.textContent?.includes(name),
      ),
    viewName,
  );
  checks += 2;
  await page.goto(
    origin + "/analytics/records?range=all&dataset=transactions",
    { waitUntil: "networkidle" },
  );
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV", exact: true }).click();
  assert.ok((await download).suggestedFilename().endsWith(".csv"));
  await page
    .locator('a[href^="/analytics/inspect/transactions/"]')
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Balanced ledger entries", exact: true })
    .waitFor();
  await noOverflow();
  checks += 2;
  await page.goto(origin + "/analytics", { waitUntil: "networkidle" });
  await page.screenshot({
    path: `${output}/fundicate-analytics-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/dashboard",
    "/explore",
    "/communities/campus-collective",
    "/communities/campus-collective/members",
    "/communities/campus-collective/treasury",
    "/communities/campus-collective/proposals",
    "/communities/campus-collective/proposals/new",
    "/settings/profile",
    "/analytics",
    "/analytics/treasury",
    "/analytics/governance",
    "/analytics/network",
    "/analytics/personal",
    "/analytics/records",
  ]) {
    await page.goto(origin + route, { waitUntil: "networkidle" });
    await noOverflow();
    if (route === "/dashboard")
      await page.screenshot({
        path: `${output}/fundicate-dashboard-mobile.png`,
        fullPage: true,
      });
    if (route === "/")
      await page.screenshot({
        path: `${output}/fundicate-landing-mobile.png`,
        fullPage: true,
      });
    if (route === "/analytics")
      await page.screenshot({
        path: `${output}/fundicate-analytics-mobile.png`,
        fullPage: true,
      });
    checks++;
  }
  await page.setViewportSize({ width: 320, height: 740 });
  for (const route of ["/", "/dashboard", "/analytics", "/analytics/records"]) {
    await page.goto(origin + route, { waitUntil: "networkidle" });
    await noOverflow();
  }
  await page.goto(origin + "/dashboard", { waitUntil: "networkidle" });
  await page.locator(".customize-dashboard>summary").click();
  const panel = await page.locator(".customize-panel").boundingBox();
  assert.ok(
    panel && panel.x >= 0 && panel.x + panel.width <= 321,
    "Dashboard customization remains inside a narrow phone viewport",
  );
  checks++;
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `PASS ${checks} browser layout/interaction checks, no browser runtime errors. Screenshots: ${output}`,
  );
} finally {
  await context.close();
  await browser.close();
}
