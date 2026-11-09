import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../src/lib/db";
import {
  createSession,
  hashPassword,
  hashToken,
  sessionCookie,
} from "../src/lib/auth";
import { createCommunity } from "../src/lib/service";

type Check = (name: string, work: () => Promise<void>) => Promise<void>;

export async function runPaymentRecordsBrowserChecks(check: Check) {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
  );
  const origin = process.env.APP_ORIGIN!;
  const suffix = randomUUID().slice(0, 8);
  const people = await Promise.all(
    ["admin", "member", "outside"].map(async (role) =>
      db.user.create({
        data: {
          email: `payui${role}${suffix}@test.invalid`,
          username: `payui${role}${suffix}`,
          displayName: `Payment UI ${role}`,
          passwordHash: await hashPassword("PaymentBrowser!Test2026"),
        },
      }),
    ),
  );
  const [admin, member, outside] = people;
  const community = await createCommunity(admin.id, {
    name: "External payment browser community",
    slug: `payment-browser-${suffix}`,
    description:
      "An isolated community for external payment records and accessible transparent tracking.",
    purpose:
      "Validate staff attestations, correction history and member privacy through actual browser actions.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  await db.communityMembership.create({
    data: { communityId: community.id, userId: member.id },
  });
  const browser = await chromium.launch({
    channel:
      process.env.FUNDICATE_BROWSER === "chromium" ? undefined : "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const exportRequests: string[] = [];
  const exportQuotaKey = hashToken(`payments-export:${admin.id}`);
  const exportQuotaBeforeRender = await db.rateLimit.findUnique({
    where: { key: exportQuotaKey },
  });
  let exportQuotaAfterDownload = exportQuotaBeforeRender;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/payments/export")
      exportRequests.push(request.method());
  });
  const path = `/communities/${community.slug}/payments`;
  const reference = `UI-${suffix}-';DROP TABLE Users;--`;
  const note =
    "<img src=x onerror=alert('unsafe')> Staff attestation, independently unverified.";
  const local = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  async function as(userId: string) {
    const session = await createSession(userId);
    await context.clearCookies();
    await context.addCookies([
      {
        name: sessionCookie,
        value: session.token,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  async function navigate(
    expected: "payments" | "not-found" | "login" = "payments",
  ) {
    let status: number | null = null;
    try {
      // A page can be interactive while Next prefetches remain in flight.
      // Assert the actual response and rendered route instead of network silence.
      const response = await page.goto(origin + path, {
        waitUntil: "domcontentloaded",
      });
      status = response?.status() ?? null;
      assert.ok(
        status !== null && status < 500,
        `Payment route returned HTTP ${status}`,
      );
      if (expected !== "not-found") assert.equal(status, 200);
      const heading =
        expected === "payments"
          ? "A clear record of community funds."
          : expected === "not-found"
            ? "This page hasn’t found its people."
            : "Welcome to your collective.";
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      if (expected === "login") assert.ok(page.url().includes("/login"));
    } catch (error) {
      const diagnostics = await page
        .evaluate(() => ({
          readyState: document.readyState,
          headings: [...document.querySelectorAll("h1")].map(
            (node) => node.textContent,
          ),
        }))
        .catch(() => ({ readyState: "unavailable", headings: [] }));
      console.error(
        JSON.stringify({
          event: "payment_ui_navigation_failed",
          status,
          expected,
          ...diagnostics,
        }),
      );
      throw error;
    }
  }
  try {
    await as(admin.id);
    await check(
      "browser records an external payment as a staff attestation without executing a transfer",
      async () => {
        await navigate();
        assert.equal(
          await page
            .getByRole("link", { name: "NEAR testnet", exact: true })
            .count(),
          0,
        );
        const form = page.locator("form").filter({
          has: page.getByRole("button", {
            name: "Record external payment",
            exact: true,
          }),
        });
        await form.getByLabel("Amount (USD)").fill("123.45");
        await form
          .getByLabel("External reference", { exact: true })
          .fill(reference);
        await form
          .getByLabel("Payment date and time (your local time)")
          .fill(local(new Date(Date.now() - 120000)));
        await form.getByLabel("Context (optional)").fill(note);
        await form
          .getByLabel("Evidence link (optional, HTTPS)")
          .fill("https://example.org/receipt");
        await form
          .getByRole("button", { name: "Record external payment", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: /recorded|saved/i })
          .waitFor();
        await page.getByText(reference, { exact: false }).waitFor();
        const saved = await db.externalPaymentRecord.findUniqueOrThrow({
          where: {
            communityId_reference: { communityId: community.id, reference },
          },
        });
        assert.equal(saved.amount, 12345n);
        assert.equal(saved.note, note);
        assert.equal(
          await page.locator('img[src="x"]').count(),
          0,
          "Untrusted note must render as text",
        );
        const evidence = page.getByRole("link", {
          name: "Open staff-provided evidence (external site)",
        });
        assert.equal(await evidence.getAttribute("rel"), "noopener noreferrer");
        assert.equal(
          await db.ledgerTransaction.count({
            where: { communityId: community.id },
          }),
          0,
        );
      },
    );
    await check(
      "CSV downloads require a deliberate click and deliver the recorded page without speculative export requests",
      async () => {
        assert.deepEqual(
          exportRequests,
          [],
          "Rendering and refreshing records must not consume export quotas",
        );
        const beforeDownload = await db.rateLimit.findUnique({
          where: { key: exportQuotaKey },
        });
        assert.deepEqual(
          beforeDownload,
          exportQuotaBeforeRender,
          "Rendering and refreshing must leave the actual export quota unchanged",
        );
        const exported = page.waitForEvent("download");
        await page
          .getByRole("link", { name: "Export this page", exact: true })
          .click();
        const download = await exported;
        assert.equal(await download.failure(), null);
        assert.equal(
          download.suggestedFilename(),
          "fundicate-payments-page-1.csv",
        );
        const stream = await download.createReadStream();
        assert.ok(stream);
        const chunks: Buffer[] = [];
        for await (const chunk of stream)
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const csv = Buffer.concat(chunks).toString("utf8");
        assert.ok(csv.includes(reference));
        assert.ok(csv.includes("12345"));
        assert.ok(csv.includes("STAFF_RECORDED_UNVERIFIED"));
        // Native download navigations can be absent from Playwright's Page
        // request events. Verify the real server-side effect instead: this
        // deliberate download must consume exactly one export quota unit.
        exportQuotaAfterDownload = await db.rateLimit.findUnique({
          where: { key: exportQuotaKey },
        });
        assert.ok(exportQuotaAfterDownload);
        if (
          beforeDownload &&
          beforeDownload.expiresAt.getTime() ===
            exportQuotaAfterDownload.expiresAt.getTime()
        ) {
          assert.equal(
            exportQuotaAfterDownload.count,
            beforeDownload.count + 1,
          );
        } else {
          assert.equal(exportQuotaAfterDownload.count, 1);
          if (beforeDownload) {
            const [{ now }] = await db.$queryRaw<
              { now: Date }[]
            >`SELECT CURRENT_TIMESTAMP AS now`;
            assert.ok(
              beforeDownload.expiresAt <= now,
              "A live quota window cannot be replaced",
            );
          }
        }
        assert.ok(
          page.url().endsWith(path),
          "Downloading must keep the payment workspace open",
        );
      },
    );
    await check(
      "payment records remain usable and accessible at desktop, 390px and 320px",
      async () => {
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await navigate();
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `Overflow at ${width}px`,
          );
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          assert.deepEqual(
            results.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact,
            })),
            [],
          );
          await page.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
            window.scrollTo(0, 0);
          });
          mkdirSync(".local/standalone-ui", { recursive: true });
          await page.screenshot({
            path: `.local/standalone-ui/payments-${width}.png`,
            fullPage: true,
          });
          assert.deepEqual(
            await db.rateLimit.findUnique({ where: { key: exportQuotaKey } }),
            exportQuotaAfterDownload,
            "Rendering, resizing and accessibility scans must not consume export quota",
          );
        }
      },
    );
    await check(
      "browser corrections append a reversal and retain the original record",
      async () => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page
          .getByText("Correct this record with a full reversal", {
            exact: true,
          })
          .click();
        const form = page.locator("form").filter({
          has: page.getByRole("button", {
            name: "Record full reversal",
            exact: true,
          }),
        });
        await form.getByLabel("Reversal reference").fill(`reverse-${suffix}`);
        await form
          .getByLabel("Reason for correction")
          .fill(
            "This browser fixture records a full correction with preserved original history.",
          );
        await form
          .getByLabel("Correction date and time (your local time)")
          .fill(local(new Date(Date.now() - 60000)));
        await form
          .getByRole("button", { name: "Record full reversal", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: /recorded|saved|reversal/i })
          .waitFor();
        await page.getByText(`reverse-${suffix}`, { exact: false }).waitFor();
        assert.equal(
          await db.externalPaymentRecord.count({
            where: { communityId: community.id },
          }),
          2,
        );
        assert.equal(
          await page
            .getByText("Correct this record with a full reversal", {
              exact: true,
            })
            .count(),
          0,
        );
        await page.getByText("Reversed", { exact: true }).waitFor();
      },
    );
    await check(
      "members can inspect history but receive no recording or correction controls",
      async () => {
        await as(member.id);
        await navigate();
        await page.getByText(reference, { exact: false }).waitFor();
        assert.equal(
          await page
            .getByRole("button", {
              name: "Record external payment",
              exact: true,
            })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Record full reversal", exact: true })
            .count(),
          0,
        );
      },
    );
    await check(
      "foreign and anonymous visitors cannot inspect external payment records",
      async () => {
        await as(outside.id);
        await navigate("not-found");
        assert.equal(
          (await page.textContent("body"))?.includes(reference),
          false,
        );
        await context.clearCookies();
        await navigate("login");
        assert.equal(
          (await page.textContent("body"))?.includes(reference),
          false,
        );
        assert.deepEqual(runtimeErrors, []);
      },
    );
  } finally {
    await browser.close();
  }
}
