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
  await page.getByRole("heading", { name: /Good things/ }).waitFor();
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
    checks++;
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `PASS ${checks} browser layout/interaction checks, no browser runtime errors. Screenshots: ${output}`,
  );
} finally {
  await context.close();
  await browser.close();
}
