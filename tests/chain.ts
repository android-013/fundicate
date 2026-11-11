import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { register } from "../src/lib/auth";
import { NATIVE_ASSET } from "../src/lib/chain-core";
import { prepareChainAction } from "../src/lib/chain-service";
import { db } from "../src/lib/db";
import { contributeToRound } from "../src/lib/funded-rounds";
import { NearRpc } from "../src/lib/near-rpc";
import {
  castMethodSelectionVote,
  castScreeningVote,
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
} from "../src/lib/rounds";
import { createCommunity } from "../src/lib/service";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL!).pathname,
    /^\/fundicate_test_\d+_\d+$/,
  );
  assert.equal(process.env.FUNDICATE_MODE, "near-testnet");
  const origin = process.env.APP_ORIGIN!;
  const password = "FictionalTestOnly!2026";
  const credentials = { email: "fixture@fundicate.invalid", password };
  const user = await register({
    ...credentials,
    username: "testnetfixture",
    displayName: "Testnet Fixture",
  });
  const community = await createCommunity(user.id, {
    name: "Testnet fixture",
    slug: "testnet-fixture",
    currency: "BDT",
    minimumContribution: "1",
    description: "An isolated fixture for the optional treasury workspace.",
    purpose: "Verify native pool wiring while preserving simulated balances.",
    questions: "",
  });

  const day = 86_400_000;
  const past = Date.now() - 20 * day;
  const at = (offset: number) => new Date(past + offset * day);
  await db.communityMembership.updateMany({
    where: { communityId: community.id },
    data: { joinedAt: at(-1) },
  });
  const round = await createFundingRound(
    user.id,
    {
      communityId: community.id,
      title: "Testnet source decision",
      description:
        "Vote on one qualified scheme in the disposable test database.",
      proposalPolicy: "MEMBERS",
      quorumBps: 5000,
      funded: true,
      fundedVersion: "V4",
      fundingTarget: "10",
      minimumContribution: "1",
      maximumContribution: "10",
      collectionClosesAt: at(0.5).toISOString(),
      submissionsCloseAt: at(1).toISOString(),
      expiresAt: at(10).toISOString(),
      screeningWeight: "EQUAL",
      selectionWeight: "EQUAL",
      vetoWeight: "EQUAL",
      vetoEnabled: false,
      selectionMethod: "FPTP",
      selectionSeats: 1,
      allocationPolicy: "WINNER_ALL",
      rankedSharesBps: [],
    },
    at(0),
  );
  const scope = { communityId: community.id, roundId: round.id };
  const advance = (action: string, offset: number) =>
    fundingRoundAction(user.id, { ...scope, action }, at(offset));
  await advance("open", 0);
  await contributeToRound(
    user.id,
    { ...scope, amount: "10", idempotencyKey: randomUUID() },
    at(0),
  );
  const scheme = await submitFundingScheme(
    user.id,
    {
      ...scope,
      title: "Fixture scheme",
      description: "A fictional scheme with an approved simulated request.",
      amount: "5",
      recipient: "Fixture recipient",
      category: "DONATION",
    },
    at(0.1),
  );
  await advance("screen", 1);
  await castScreeningVote(
    user.id,
    { ...scope, schemeId: scheme.id, choice: "YES" },
    at(1.1),
  );
  await advance("close-screening", 2.01);
  await castMethodSelectionVote(
    user.id,
    { ...scope, ballot: { schemeId: scheme.id } },
    at(2.1),
  );
  await advance("close-selection", 3.02);

  let cookie = "";
  function post(operation: string, body: object, requestOrigin = origin) {
    return fetch(`${origin}/api/${operation}`, {
      method: "POST",
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  }
  assert.equal((await post("wallet-challenge", {})).status, 401);
  const login = await post("login", credentials);
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  await db.session.updateMany({
    where: { userId: user.id },
    data: { reauthenticatedAt: new Date(Date.now() - 6 * 60_000) },
  });
  const challengeInput = { accountId: "fixture-controller.testnet" };
  assert.equal(
    (await post("wallet-challenge", challengeInput, "https://other.invalid"))
      .status,
    403,
  );
  assert.equal((await post("wallet-challenge", challengeInput)).status, 428);
  assert.equal((await post("reauthenticate", { password })).status, 200);
  const challenge = await post("wallet-challenge", challengeInput);
  assert.equal(challenge.status, 200);
  const { id: challengeId } = await challenge.json();
  assert.equal(
    (
      await post("wallet-verify", {
        ...challengeInput,
        challengeId,
        publicKey: "invalid",
        signature: "invalid",
      })
    ).status,
    403,
  );
  const walletPage = await fetch(origin + "/settings/wallet", {
    headers: { Cookie: cookie },
  });
  assert.match(await walletPage.text(), /Choose testnet wallet/);

  const localFunds = await db.roundSettlement.findUniqueOrThrow({
    where: { roundId: round.id },
  });
  const response = await post("chain-create", {
    ...scope,
    title: "Native pool fixture",
    collectionMinutes: 10,
    caps: [
      { schemeId: scheme.id, recipient: "recipient.testnet", request: "0.1" },
    ],
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const vaultId = body.id;
  const chainPage = await fetch(
    `${origin}/communities/${community.slug}/chain?pool=${vaultId}`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(chainPage.status, 200);
  assert.match(await chainPage.text(), /Register pool on NEAR/);

  await db.walletLink.create({
    data: {
      userId: user.id,
      accountId: challengeInput.accountId,
      network: "testnet",
      publicKey: "fixture-only",
    },
  });
  const rpc = new NearRpc("https://mock.invalid", async (_url, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    const result =
      method === "status"
        ? { chain_id: "testnet" }
        : params.request_type === "view_account"
          ? { code_hash: process.env.NEAR_CONTRACT_CODE_HASH }
          : {
              result: [
                ...Buffer.from(
                  JSON.stringify(
                    params.method_name === "get_round"
                      ? null
                      : {
                          network: "testnet",
                          asset_id: NATIVE_ASSET,
                          controller: challengeInput.accountId,
                          solvent_including_in_flight: true,
                        },
                  ),
                ),
              ],
            };
    return Response.json({ result });
  });
  const prepared = await prepareChainAction(
    user.id,
    {
      communityId: community.id,
      vaultId,
      action: "register",
      ...challengeInput,
      idempotencyKey: randomUUID(),
    },
    new Date(),
    rpc,
  );
  assert.equal(prepared.method, "register_round");
  assert.equal(prepared.args.asset_id, NATIVE_ASSET);
  assert.equal(prepared.deposit, "0");
  assert.equal(
    (
      await post("chain-submitted", {
        operationId: prepared.operationId,
        transactionHash: "A".repeat(43),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await db.chainOperation.findUniqueOrThrow({
        where: { id: prepared.operationId },
      })
    ).status,
    "PREPARED",
  );
  assert.deepEqual(
    await db.roundSettlement.findUniqueOrThrow({
      where: { roundId: round.id },
    }),
    localFunds,
  );
  console.log(
    "PASS isolated NEAR wallet gating, funded decision bridge, reviewed contract handoff, hash guard and simulated ledger preservation.",
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}
