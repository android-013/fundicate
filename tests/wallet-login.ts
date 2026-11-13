import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { db } from "../src/lib/db";
import { register, hashToken } from "../src/lib/auth";
import {
  createWalletLoginChallenge,
  verifyWalletLogin,
} from "../src/lib/wallet-login";
import { nep413Hash } from "../src/lib/wallet-core";
import { requireRecentAuthentication } from "../src/lib/session-security";
import { revokeWalletLink } from "../src/lib/wallet";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL!).pathname,
    /^\/fundicate_test_\d+_\d+$/,
  );
  const user = await register({
    email: "wallet@fixture.invalid",
    username: "walletfixture",
    displayName: "Wallet Fixture",
    password: "FixturePassword!2026",
  });
  const pair = generateKeyPairSync("ed25519");
  const raw = pair.publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt(`0x${raw.toString("hex")}`),
    encoded = "";
  while (n) {
    encoded = alphabet[Number(n % 58n)] + encoded;
    n /= 58n;
  }
  for (const byte of raw) {
    if (byte) break;
    encoded = "1" + encoded;
  }
  const publicKey = `ed25519:${encoded}`,
    accountId = "fundicate-fixture.testnet";
  const link = await db.walletLink.create({
    data: { userId: user.id, network: "testnet", accountId, publicKey },
  });
  const origin = process.env.APP_ORIGIN!;
  const post = (
    operation: string,
    body: object,
    cookie = "",
    requestOrigin = origin,
  ) =>
    fetch(`${origin}/api/${operation}`, {
      method: "POST",
      headers: {
        origin: requestOrigin,
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify(body),
    });
  const loginPage = await fetch(`${origin}/login`);
  const loginHtml = await loginPage.text();
  assert.match(loginHtml, /Continue with NEAR testnet/);
  assert.doesNotMatch(loginHtml, /type="(?:email|password)"/);
  for (const op of ["login", "register", "reauthenticate"])
    assert.equal((await post(op, {})).status, 404);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/login`);
      await page
        .getByRole("button", {
          name: "Continue with NEAR testnet",
          exact: true,
        })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
        [],
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  assert.equal(
    (
      await post(
        "wallet-login-challenge",
        { accountId },
        "",
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal((await post("chain-create", {})).status, 404);
  const response = await post("wallet-login-challenge", { accountId });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const challenge = await response.json();
  const invalid = {
    challengeId: challenge.id,
    accountId,
    publicKey,
    signature: "A".repeat(86) + "==",
  };
  assert.equal((await post("wallet-login-verify", invalid)).status, 401);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await post("wallet-login-verify", invalid, cookie)).status,
    403,
  );

  // Real PostgreSQL + Ed25519 signatures, with explicitly simulated RPC replies.
  // This fixture never claims the generated key exists on external testnet.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      result:
        body.method === "status"
          ? { chain_id: "testnet" }
          : { permission: "FullAccess" },
    });
  };
  try {
    const token = "f".repeat(64);
    const c = await createWalletLoginChallenge({ accountId }, token);
    const proof = {
      challengeId: c.id,
      accountId,
      publicKey,
      signature: sign(
        null,
        nep413Hash(c.message, Buffer.from(c.nonce, "base64"), c.recipient),
        pair.privateKey,
      ).toString("base64"),
    };
    const attempts = await Promise.allSettled([
      verifyWalletLogin(proof, token),
      verifyWalletLogin(proof, token),
    ]);
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
    const success = attempts.find(
      (x) => x.status === "fulfilled",
    )! as PromiseFulfilledResult<{ token: string }>;
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(success.value.token) },
    });
    assert.equal(session.userId, user.id);
    assert.ok(session.reauthenticatedAt);
    await assert.rejects(verifyWalletLogin(proof, token));
    const c2 = await createWalletLoginChallenge({ accountId }, token);
    await db.walletLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    await assert.rejects(
      verifyWalletLogin(
        {
          ...proof,
          challengeId: c2.id,
          signature: sign(
            null,
            nep413Hash(
              c2.message,
              Buffer.from(c2.nonce, "base64"),
              c2.recipient,
            ),
            pair.privateKey,
          ).toString("base64"),
        },
        token,
      ),
    );
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    const newAccountId = "new-user-fixture.testnet";
    const before = await db.user.count();
    const newProof = async () => {
      const c = await createWalletLoginChallenge(
        { accountId: newAccountId },
        token,
      );
      return {
        challengeId: c.id,
        accountId: newAccountId,
        publicKey,
        signature: sign(
          null,
          nep413Hash(c.message, Buffer.from(c.nonce, "base64"), c.recipient),
          pair.privateKey,
        ).toString("base64"),
      };
    };
    const first = await newProof(),
      second = await newProof();
    assert.equal(await db.user.count(), before);
    const signedIn = await Promise.all([
      verifyWalletLogin(first, token),
      verifyWalletLogin(second, token),
    ]);
    assert.equal(await db.user.count(), before + 1);
    const newLink = await db.walletLink.findUniqueOrThrow({
      where: {
        network_accountId: { network: "testnet", accountId: newAccountId },
      },
      include: { user: true },
    });
    assert.equal(newLink.user.email, null);
    assert.equal(newLink.user.passwordHash, null);
    assert.equal(
      await db.session.count({ where: { userId: newLink.userId } }),
      2,
    );
    await requireRecentAuthentication(newLink.userId, signedIn[0].token);
    await assert.rejects(
      revokeWalletLink(newLink.userId, signedIn[0].token, { id: newLink.id }),
      /last sign-in wallet/,
    );
    await assert.rejects(verifyWalletLogin(first, token));
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "Wallet authentication HTTP/isolation, signed ownership, concurrent replay and revocation checks passed; RPC simulated.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
