import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { db } from "../src/lib/db";
import { createCommunity } from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castSelectionVote,
} from "../src/lib/rounds";
import {
  contributeToRound,
  prepareRoundSettlement,
  processRoundSettlement,
} from "../src/lib/funded-rounds";
import { castRoundVetoVote } from "../src/lib/rounds-v3";

type Check = (name: string, work: () => Promise<void>) => Promise<void>;
type Observation = {
  status: string;
  mode?: string;
  processed?: number;
  action?: string;
  entityId?: string;
  failures?: number;
};
const day = 86400000;

/** Execute the shipped CLI with its real clock against only the caller's isolated test DB. */
function maintenance(actorId: string, mode: "--dry-run" | "--apply") {
  const args = ["scripts/maintenance.mjs", "--actor", actorId, mode, "--once"];
  const result = spawnSync(process.execPath, args, {
    env: { ...process.env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(
    result.error,
    undefined,
    "Maintenance CLI must finish normally.",
  );
  assert.equal(result.status, 0, result.stderr);
  const observations = result.stdout
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Observation);
  const summary = observations.at(-1);
  assert.equal(summary?.status, "ok");
  assert.equal(summary?.mode, mode === "--apply" ? "apply" : "dry-run");
  assert.equal(summary?.failures, 0);
  console.log(
    JSON.stringify({
      maintenanceCommand: ["node", ...args],
      exitCode: result.status,
      observations,
    }),
  );
  return { observations, summary: summary! };
}

export async function runMaintenanceChecks(check: Check) {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Maintenance checks require an isolated throwaway database.",
  );
  const suffix = randomUUID().slice(0, 8);
  const [admin, member, foreignAdmin] = await Promise.all(
    ["admin", "member", "foreign"].map((role) =>
      db.user.create({
        data: {
          email: `maint${role}${suffix}@test.invalid`,
          username: `maint${role}${suffix}`,
          displayName: `Maintenance ${role}`,
          passwordHash: "unused-maintenance-test-login",
        },
      }),
    ),
  );
  const communityInput = {
    name: "Isolated lifecycle maintenance",
    slug: `maintenance-${suffix}`,
    currency: "BDT",
    description:
      "Verify real command-line lifecycle processing without modifying demo data.",
    purpose:
      "Keep explicit staff authority, stage deadlines, original history and full veto holds.",
    minimumContribution: "0",
    questions: "",
  };
  const community = await createCommunity(admin.id, communityInput);
  await createCommunity(foreignAdmin.id, {
    ...communityInput,
    name: "Foreign maintenance authority",
    slug: `maintenance-foreign-${suffix}`,
  });
  await db.communityMembership.create({
    data: { communityId: community.id, userId: member.id },
  });
  const old = new Date(Date.now() - 4 * day);
  const at = (offset: number) => new Date(old.getTime() + offset * day);
  const base = {
    communityId: community.id,
    title: "Due published community decision",
    description:
      "A published round whose submission cutoff is already due for real CLI processing.",
    proposalPolicy: "MEMBERS",
    quorumBps: 5000,
    submissionsCloseAt: at(1).toISOString(),
    funded: false,
  };
  const due = await createFundingRound(admin.id, base, old);
  const dueScope = { communityId: community.id, roundId: due.id };
  await fundingRoundAction(admin.id, { ...dueScope, action: "open" }, old);
  await submitFundingScheme(
    member.id,
    {
      ...dueScope,
      title: "Published maintenance candidate",
      description:
        "A legitimate scheme keeps screening open for its full ordinary lifecycle.",
      amount: "1.00",
      recipient: "Isolated maintenance recipient",
      category: "DONATION",
    },
    old,
  );
  const snapshot = async () => ({
    round: await db.fundingRound.findUniqueOrThrow({ where: { id: due.id } }),
    eligibility: await db.roundElectorate.findMany({
      where: { roundId: due.id },
      orderBy: { userId: "asc" },
    }),
    auditCount: await db.auditEvent.count({ where: { entityId: due.id } }),
  });

  await check(
    "real maintenance dry-run reports the due stage and leaves all round state unchanged",
    async () => {
      const before = await snapshot();
      const { observations, summary } = maintenance(admin.id, "--dry-run");
      assert.equal(summary.processed, 1);
      assert.ok(
        observations.some(
          (row) =>
            row.status === "dry-run" &&
            row.entityId === due.id &&
            row.action === "screen",
        ),
      );
      assert.deepEqual(await snapshot(), before);
    },
  );
  await check(
    "real maintenance cannot act under a nonstaff member or foreign administrator",
    async () => {
      const before = await snapshot();
      for (const person of [member, foreignAdmin]) {
        const { summary, observations } = maintenance(person.id, "--apply");
        assert.equal(summary.processed, 0);
        assert.equal(
          observations.some((row) => row.entityId === due.id),
          false,
        );
      }
      assert.deepEqual(await snapshot(), before);
    },
  );
  await check(
    "real maintenance applies a due published stage once and repeat execution adds no duplicate history",
    async () => {
      const first = maintenance(admin.id, "--apply");
      assert.equal(first.summary.processed, 1);
      assert.ok(
        first.observations.some(
          (row) =>
            row.status === "completed" &&
            row.entityId === due.id &&
            row.action === "screen",
        ),
      );
      const after = await snapshot();
      assert.equal(after.round.status, "SCREENING");
      assert.equal(after.eligibility.length, 2);
      assert.ok(after.round.screeningClosesAt! > new Date());
      assert.equal(
        await db.auditEvent.count({
          where: { entityId: due.id, action: "ROUND_SCREENING_OPENED" },
        }),
        1,
      );
      assert.equal(maintenance(admin.id, "--apply").summary.processed, 0);
      assert.deepEqual(await snapshot(), after);
    },
  );

  const publishedAt = new Date(Date.now() - 60 * 60000);
  const vetoOld = new Date(publishedAt.getTime() - 3.1 * day);
  const vetoAt = (offset: number) => new Date(vetoOld.getTime() + offset * day);
  const vetoRound = await createFundingRound(
    admin.id,
    {
      ...base,
      title: "Full rejection window maintenance hold",
      funded: true,
      fundedVersion: "V3",
      fundingTarget: "1.00",
      minimumContribution: "0.01",
      maximumContribution: "10.00",
      submissionsCloseAt: vetoAt(1).toISOString(),
      collectionClosesAt: vetoAt(0.5).toISOString(),
      expiresAt: vetoAt(8).toISOString(),
      screeningWeight: "EQUAL",
      selectionWeight: "EQUAL",
      vetoWeight: "EQUAL",
      allocationPolicy: "WINNER_ALL",
      rankedSharesBps: [],
      vetoEnabled: true,
    },
    vetoOld,
  );
  const vetoScope = { communityId: community.id, roundId: vetoRound.id };
  await fundingRoundAction(admin.id, { ...vetoScope, action: "open" }, vetoOld);
  await contributeToRound(
    admin.id,
    { ...vetoScope, amount: "1.00", idempotencyKey: randomUUID() },
    vetoOld,
  );
  const winner = await submitFundingScheme(
    member.id,
    {
      ...vetoScope,
      title: "Eligible veto-window recipient",
      description:
        "A genuine supported candidate creates an executable allocation after the full veto window.",
      amount: "1.00",
      recipient: "Isolated veto recipient",
      category: "DONATION",
    },
    vetoOld,
  );
  await fundingRoundAction(
    admin.id,
    { ...vetoScope, action: "screen" },
    vetoAt(1),
  );
  for (const person of [admin, member])
    await castScreeningVote(
      person.id,
      { ...vetoScope, schemeId: winner.id, choice: "YES" },
      vetoAt(1.01),
    );
  await fundingRoundAction(
    admin.id,
    { ...vetoScope, action: "close-screening" },
    vetoAt(2.01),
  );
  for (const person of [admin, member])
    await castSelectionVote(
      person.id,
      { ...vetoScope, schemeId: winner.id },
      vetoAt(2.02),
    );
  await fundingRoundAction(
    admin.id,
    { ...vetoScope, action: "close-selection" },
    publishedAt,
  );
  for (const person of [admin, member])
    await castRoundVetoVote(person.id, { ...vetoScope, choice: "KEEP" });

  await check(
    "real maintenance preserves the full 24-hour veto despite a decided winner and every voter keeping the result",
    async () => {
      const before = await db.roundDecision.findUniqueOrThrow({
        where: { roundId: vetoRound.id },
      });
      assert.equal(
        before.vetoClosesAt!.getTime() - before.publishedAt.getTime(),
        day,
      );
      assert.ok(before.vetoClosesAt! > new Date());
      assert.equal(before.vetoFinalizedAt, null);
      const finance = await db.roundSettlement.findUniqueOrThrow({
        where: { roundId: vetoRound.id },
      });
      const operations = await db.roundOperation.count({
        where: { roundId: vetoRound.id },
      });
      for (const mode of ["--dry-run", "--apply"] as const) {
        const result = maintenance(admin.id, mode);
        assert.equal(result.summary.processed, 0);
        assert.equal(
          result.observations.some((row) => row.entityId === vetoRound.id),
          false,
        );
      }
      await assert.rejects(prepareRoundSettlement(admin.id, vetoScope));
      await assert.rejects(processRoundSettlement(admin.id, vetoScope));
      assert.deepEqual(
        await db.roundDecision.findUniqueOrThrow({
          where: { roundId: vetoRound.id },
        }),
        before,
      );
      assert.deepEqual(
        await db.roundSettlement.findUniqueOrThrow({
          where: { roundId: vetoRound.id },
        }),
        finance,
      );
      assert.equal(
        await db.roundOperation.count({ where: { roundId: vetoRound.id } }),
        operations,
      );
      assert.equal(finance.paid, 0n);
      assert.equal(finance.refunded, 0n);
    },
  );
}
