import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import {
  createCommunity,
  createProposal,
  castVote,
  proposalAction,
  contribute,
} from "../src/lib/service";
import {
  createFundingRound,
  fundingRoundAction,
  submitFundingScheme,
  castScreeningVote,
  castSelectionVote,
  castMethodSelectionVote,
} from "../src/lib/rounds";
import {
  contributeToRound,
  prepareRoundSettlement,
  processRoundSettlement,
} from "../src/lib/funded-rounds";
import { castRoundVetoVote } from "../src/lib/rounds-v3";
import {
  createReputationReview,
  editReputationReview,
  reportReputationReview,
  moderateReputationReview,
  appealReputationReview,
  getCommunityReputation,
} from "../src/lib/reputation";

const origin = process.env.APP_ORIGIN!;
const day = 86400000;
let checks = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS ${++checks}. ${name}`);
}
async function post(
  operation: string,
  body: unknown,
  cookie = "",
  expected = 200,
  requestOrigin = origin,
) {
  const response = await fetch(`${origin}/api/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const json = await response.json();
  assert.equal(response.status, expected, JSON.stringify(json));
  return json;
}
async function account(name: string) {
  const response = await fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: `${name}@reputation.invalid`,
      username: name,
      displayName: name,
      password: "ReputationPassword!2026",
    }),
  });
  assert.equal(response.status, 200, await response.text());
  return {
    user: await db.user.findUniqueOrThrow({
      where: { email: `${name}@reputation.invalid` },
    }),
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
type Actor = Awaited<ReturnType<typeof account>>;

async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Reputation tests require an isolated throwaway database.",
  );
  const [
    admin,
    moderator,
    moderator2,
    author,
    reviewer,
    peer,
    idle,
    vetoOnly,
    outsider,
  ] = await Promise.all(
    [
      "repadmin",
      "repmod",
      "repmodtwo",
      "repauthor",
      "repreviewer",
      "reppeer",
      "repidle",
      "repvetoonly",
      "repoutside",
    ].map(account),
  );
  const members = [admin, moderator, moderator2, author, reviewer, peer, idle];
  const community = await createCommunity(admin.user.id, {
    name: "Shared experience collective",
    slug: "shared-experience-collective",
    description:
      "A community with participation-qualified, accountable reputation.",
    purpose: "Review shared work without changing votes, finances or history.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  await db.communityMembership.createMany({
    data: members
      .filter((actor) => actor !== admin)
      .map((actor) => ({
        communityId: community.id,
        userId: actor.user.id,
        role: [moderator, moderator2].includes(actor)
          ? ("MODERATOR" as const)
          : ("MEMBER" as const),
      })),
  });
  const foreign = await createCommunity(outsider.user.id, {
    name: "Separate review scope",
    slug: "separate-review-scope",
    description:
      "A separate community that cannot supply borrowed review evidence.",
    purpose: "Keep reviews and participation scoped to the correct community.",
    currency: "USD",
    minimumContribution: "0",
    questions: "",
  });
  const old = new Date(Date.now() - 6 * day);
  const at = (offset: number) => new Date(old.getTime() + offset * day);
  const scope = (roundId: string) => ({ communityId: community.id, roundId });
  let roundNumber = 0;
  async function completedRound(
    funded = false,
    vetoEnabled = false,
    publication = at(3.02),
  ) {
    const round = await createFundingRound(
      admin.user.id,
      {
        communityId: community.id,
        title: `Shared experience decision ${++roundNumber}`,
        description:
          "A recorded decision for thoughtful participation and recipient experience reviews.",
        proposalPolicy: "MEMBERS",
        quorumBps: 1,
        submissionsCloseAt: at(1).toISOString(),
        ...(funded
          ? {
              funded: true,
              fundedVersion: "V3",
              fundingTarget: "1.00",
              minimumContribution: "0.01",
              maximumContribution: "20.00",
              collectionClosesAt: at(0.5).toISOString(),
              expiresAt: at(12).toISOString(),
              selectionMethod: "FPTP",
              screeningWeight: "EQUAL",
              selectionWeight: "EQUAL",
              vetoWeight: "EQUAL",
              allocationPolicy: "WINNER_ALL",
              rankedSharesBps: [],
              vetoEnabled,
            }
          : {}),
      },
      old,
    );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(round.id), action: "open" },
      old,
    );
    if (funded)
      await contributeToRound(
        reviewer.user.id,
        { ...scope(round.id), amount: "1.00", idempotencyKey: randomUUID() },
        old,
      );
    const scheme = await submitFundingScheme(
      author.user.id,
      {
        ...scope(round.id),
        title: `Recipient experience scheme ${roundNumber}`,
        description:
          "A complete scheme with a clear purpose and payment recipient.",
        amount: "1.00",
        recipient: "Published recipient",
        category: "DONATION",
      },
      old,
    );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(round.id), action: "screen" },
      at(1),
    );
    for (const actor of [reviewer, peer])
      await castScreeningVote(
        actor.user.id,
        { ...scope(round.id), schemeId: scheme.id, choice: "YES" },
        at(1.01),
      );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(round.id), action: "close-screening" },
      at(2.01),
    );
    for (const actor of [reviewer, peer])
      await castSelectionVote(
        actor.user.id,
        { ...scope(round.id), schemeId: scheme.id },
        at(2.02),
      );
    await fundingRoundAction(
      admin.user.id,
      { ...scope(round.id), action: "close-selection" },
      publication,
    );
    return { round, scheme };
  }
  const { round, scheme } = await completedRound();
  // A separate legacy ballot supplies genuine proposal participation and later a payment receipt.
  const proposal = await createProposal(author.user.id, {
    communityId: community.id,
    type: "FUNDING",
    title: "A legacy project presentation",
    description:
      "This legacy proposal has a recorded voter cohort and separate receipt-backed experience.",
    amount: "1.00",
    recipient: "Legacy published recipient",
    quorumBps: 1,
    thresholdBps: 5001,
    opensAt: new Date(Date.now() - 60000).toISOString(),
    closesAt: new Date(Date.now() + day).toISOString(),
    publish: false,
  });
  await proposalAction(admin.user.id, {
    communityId: community.id,
    proposalId: proposal.id,
    action: "open",
  });
  for (const actor of members)
    await castVote(actor.user.id, {
      communityId: community.id,
      proposalId: proposal.id,
      choice: "YES",
    });
  await proposalAction(admin.user.id, {
    communityId: community.id,
    proposalId: proposal.id,
    action: "finalize",
  });
  // This later member will have no recorded action except the pending veto ballot.
  await db.communityMembership.create({
    data: { communityId: community.id, userId: vetoOnly.user.id },
  });
  const input = (
    targetType: string,
    targetId: string,
    dimension = targetType === "SCHEME" || targetType === "PROPOSAL"
      ? "PRESENTATION"
      : "PARTICIPATION",
    extra: Record<string, unknown> = {},
  ) => ({
    communityId: community.id,
    targetType,
    targetId,
    dimension,
    contextType: targetType === "PROPOSAL" ? "PROPOSAL" : "ROUND",
    contextId: targetType === "PROPOSAL" ? proposal.id : round.id,
    score: 4,
    text: "Specific evidence from our actual shared participation.",
    ...extra,
  });
  let memberReview!: Awaited<ReturnType<typeof createReputationReview>>;
  let schemeReview!: Awaited<ReturnType<typeof createReputationReview>>;

  await check(
    "all four target types retain written 1–5-star reviews and separate dimensions",
    async () => {
      memberReview = await createReputationReview(
        reviewer.user.id,
        input("MEMBER", author.user.id, "PARTICIPATION", { score: 5 }),
      );
      schemeReview = await createReputationReview(
        reviewer.user.id,
        input("SCHEME", scheme.id),
      );
      await createReputationReview(
        reviewer.user.id,
        input("PROPOSAL", proposal.id, "PRESENTATION", { score: 3 }),
      );
      await createReputationReview(
        reviewer.user.id,
        input("ROUND", round.id, "PARTICIPATION", { score: 2 }),
      );
      const view = await getCommunityReputation(community.id, reviewer.user.id);
      assert.deepEqual(
        new Set(view.reviews.map((row) => row.targetType)),
        new Set(["MEMBER", "SCHEME", "PROPOSAL", "ROUND"]),
      );
      assert.equal(view.reviews.length, 4);
      assert.equal(view.aggregates.length, 4);
      for (const row of view.reviews) {
        assert.ok(row.text!.length >= 20);
        assert.ok(row.href.startsWith(`/communities/${community.slug}/`));
      }
      assert.ok(
        view.options.some(
          (option) =>
            option.targetType === "MEMBER" &&
            option.targetId === admin.user.id &&
            option.contextId === round.id,
        ),
        "A creator-only participant qualifies from recorded creation.",
      );
    },
  );

  await check(
    "actual same-context participation defeats self, electorate-only, foreign and duplicate reviews",
    async () => {
      assert.ok(
        await db.roundElectorate.findUnique({
          where: {
            roundId_userId: { roundId: round.id, userId: idle.user.id },
          },
        }),
      );
      await assert.rejects(
        () => createReputationReview(idle.user.id, input("SCHEME", scheme.id)),
        /Recorded participation/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            reviewer.user.id,
            input("MEMBER", idle.user.id),
          ),
        /share actual participation/,
      );
      for (const data of [
        input("MEMBER", reviewer.user.id),
        input("SCHEME", scheme.id),
        input("PROPOSAL", proposal.id),
        input("ROUND", round.id),
      ]) {
        const owner =
          data.targetType === "MEMBER"
            ? reviewer
            : data.targetType === "ROUND"
              ? admin
              : author;
        await assert.rejects(
          () => createReputationReview(owner.user.id, data),
          /yourself|own work/,
        );
      }
      await assert.rejects(
        () =>
          createReputationReview(reviewer.user.id, input("SCHEME", scheme.id)),
        /already reviewed/,
      );
      await assert.rejects(
        () =>
          createReputationReview(outsider.user.id, input("SCHEME", scheme.id)),
        /active membership/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            reviewer.user.id,
            input("MEMBER", outsider.user.id),
          ),
        /not found/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            reviewer.user.id,
            input("SCHEME", scheme.id, "PRESENTATION", {
              contextType: "PROPOSAL",
              contextId: proposal.id,
            }),
          ),
        /does not belong/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            reviewer.user.id,
            input("MEMBER", author.user.id, "PARTICIPATION", {
              contextType: "PROPOSAL",
              contextId: randomUUID(),
            }),
          ),
        /finalized proposal/,
      );
      for (const score of [0, 6, 2.5])
        await assert.rejects(() =>
          createReputationReview(
            peer.user.id,
            input("SCHEME", scheme.id, "PRESENTATION", { score }),
          ),
        );
      await assert.rejects(
        () =>
          createReputationReview(
            peer.user.id,
            input("SCHEME", scheme.id, "PARTICIPATION"),
          ),
        /does not apply/,
      );
      await assert.rejects(() =>
        createReputationReview(
          peer.user.id,
          input("SCHEME", scheme.id, "PRESENTATION", { text: "short" }),
        ),
      );
    },
  );

  await check(
    "concurrent duplicate creation has one effect and concurrent edits append ordered revisions",
    async () => {
      const results = await Promise.allSettled(
        [0, 1].map(() =>
          createReputationReview(
            peer.user.id,
            input("SCHEME", scheme.id, "PRESENTATION", {
              score: 2,
              text: "A second participant gives independent presentation feedback.",
            }),
          ),
        ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        await db.reputationReview.count({
          where: {
            communityId: community.id,
            authorId: peer.user.id,
            targetId: scheme.id,
          },
        }),
        1,
      );
      await Promise.all(
        [1, 3].map((score) =>
          editReputationReview(reviewer.user.id, {
            communityId: community.id,
            reviewId: memberReview.id,
            score,
            text: `Revised specific feedback number ${score} preserves every earlier version.`,
          }),
        ),
      );
      const revisions = await db.reputationRevision.findMany({
        where: { reviewId: memberReview.id },
        orderBy: { revision: "asc" },
      });
      assert.deepEqual(
        revisions.map((row) => row.revision),
        [1, 2, 3],
      );
      assert.equal(revisions[0].score, 5);
      assert.deepEqual(
        new Set(revisions.slice(1).map((row) => row.score)),
        new Set([1, 3]),
      );
    },
  );

  await check(
    "latest visible revision counts once and historical bodies remain author/staff only",
    async () => {
      await editReputationReview(reviewer.user.id, {
        communityId: community.id,
        reviewId: schemeReview.id,
        score: 1,
        text: "A revised presentation assessment with specific constructive details.",
      });
      const publicView = await getCommunityReputation(community.id);
      const group = publicView.aggregates.find(
        (row) => row.targetId === scheme.id && row.dimension === "PRESENTATION",
      )!;
      assert.deepEqual(
        { count: group.count, total: group.total, average: group.average },
        { count: 2, total: 3, average: 1.5 },
      );
      assert.equal(
        publicView.reviews.find((row) => row.id === schemeReview.id)!.history
          .length,
        0,
      );
      const own = await getCommunityReputation(community.id, reviewer.user.id);
      assert.deepEqual(
        own.reviews
          .find((row) => row.id === schemeReview.id)!
          .history.map((row) => row.score),
        [4, 1],
      );
      await assert.rejects(
        () =>
          editReputationReview(peer.user.id, {
            communityId: community.id,
            reviewId: schemeReview.id,
            score: 4,
            text: "Someone else cannot rewrite another participant's review.",
          }),
        /Only the review author/,
      );
    },
  );

  await check(
    "moderation requires reason and unconflicted authority; hidden bodies and stars leave public aggregates",
    async () => {
      const command = {
        communityId: community.id,
        reviewId: schemeReview.id,
        action: "HIDE",
        reason:
          "Needs moderation for a specific recorded community policy reason.",
      };
      await assert.rejects(
        () => moderateReputationReview(peer.user.id, command),
        /moderator or administrator/,
      );
      await assert.rejects(
        () => moderateReputationReview(author.user.id, command),
        /moderator or administrator/,
      );
      const ownModeratorReview = await createReputationReview(
        moderator.user.id,
        input("MEMBER", author.user.id, "PARTICIPATION", {
          contextType: "PROPOSAL",
          contextId: proposal.id,
        }),
      );
      await assert.rejects(
        () =>
          moderateReputationReview(moderator.user.id, {
            ...command,
            reviewId: ownModeratorReview.id,
          }),
        /cannot decide/,
      );
      const adminReview = (
        await db.reputationReview.findMany({
          where: { authorId: reviewer.user.id, targetType: "ROUND" },
        })
      )[0];
      await assert.rejects(
        () =>
          moderateReputationReview(admin.user.id, {
            ...command,
            reviewId: adminReview.id,
          }),
        /cannot decide/,
      );
      await assert.rejects(() =>
        moderateReputationReview(moderator.user.id, {
          ...command,
          reason: " ",
        }),
      );
      await moderateReputationReview(moderator.user.id, command);
      const publicView = await getCommunityReputation(community.id);
      const hidden = publicView.reviews.find(
        (row) => row.id === schemeReview.id,
      )!;
      assert.equal(hidden.hidden, true);
      assert.equal(hidden.score, null);
      assert.equal(hidden.text, null);
      assert.equal(hidden.history.length, 0);
      assert.ok(
        !JSON.stringify(publicView).includes(
          "A revised presentation assessment",
        ),
      );
      const group = publicView.aggregates.find(
        (row) => row.targetId === scheme.id && row.dimension === "PRESENTATION",
      )!;
      assert.deepEqual(
        { count: group.count, average: group.average },
        { count: 1, average: 2 },
      );
      assert.equal(
        (
          await getCommunityReputation(community.id, reviewer.user.id)
        ).reviews.find((row) => row.id === schemeReview.id)!.score,
        1,
      );
    },
  );

  await check(
    "abuse reports are scoped, reasoned, once-only and private to staff",
    async () => {
      const command = {
        communityId: community.id,
        reviewId: schemeReview.id,
        reason:
          "Private report marker: please investigate the specific statement.",
      };
      await reportReputationReview(peer.user.id, command);
      await assert.rejects(
        () => reportReputationReview(peer.user.id, command),
        /already recorded/,
      );
      await assert.rejects(
        () => reportReputationReview(reviewer.user.id, command),
        /own review/,
      );
      await assert.rejects(
        () => reportReputationReview(outsider.user.id, command),
        /active membership/,
      );
      await assert.rejects(() =>
        reportReputationReview(peer.user.id, { ...command, reason: "bad" }),
      );
      const own = await getCommunityReputation(community.id, reviewer.user.id);
      const guest = await getCommunityReputation(community.id);
      const staff = await getCommunityReputation(
        community.id,
        moderator.user.id,
      );
      assert.equal(
        own.reviews.find((row) => row.id === schemeReview.id)!.reports.length,
        0,
      );
      assert.ok(!JSON.stringify(guest).includes("Private report marker"));
      assert.equal(
        staff.reviews.find((row) => row.id === schemeReview.id)!.reports[0]
          .reason,
        command.reason,
      );
    },
  );

  await check(
    "hidden edits retain visibility; appeals need latest decision and a different unconflicted moderator",
    async () => {
      await editReputationReview(reviewer.user.id, {
        communityId: community.id,
        reviewId: schemeReview.id,
        score: 5,
        text: "Hidden revised text marker stays private until explicitly restored.",
      });
      const hidden = (await getCommunityReputation(community.id)).reviews.find(
        (row) => row.id === schemeReview.id,
      )!;
      assert.equal(hidden.hidden, true);
      assert.equal(hidden.score, null);
      assert.equal(hidden.text, null);
      const hide = await db.reputationModeration.findFirstOrThrow({
        where: { reviewId: schemeReview.id },
        orderBy: { sequence: "desc" },
      });
      const appealCommand = {
        communityId: community.id,
        reviewId: schemeReview.id,
        moderationId: hide.id,
        statement:
          "Please reassess this decision using my specific contextual explanation.",
      };
      await assert.rejects(
        () => appealReputationReview(peer.user.id, appealCommand),
        /Only the review author/,
      );
      await appealReputationReview(reviewer.user.id, appealCommand);
      await assert.rejects(
        () => appealReputationReview(reviewer.user.id, appealCommand),
        /already recorded/,
      );
      const restore = {
        communityId: community.id,
        reviewId: schemeReview.id,
        action: "RESTORE",
        reason:
          "Independent review supports restoration after the recorded author appeal.",
      };
      await assert.rejects(
        () => moderateReputationReview(moderator.user.id, restore),
        /different, unconflicted moderator/,
      );
      await moderateReputationReview(moderator2.user.id, restore);
      const restored = await getCommunityReputation(community.id);
      assert.equal(
        restored.reviews.find((row) => row.id === schemeReview.id)!.score,
        5,
      );
      const group = restored.aggregates.find(
        (row) => row.targetId === scheme.id && row.dimension === "PRESENTATION",
      )!;
      assert.deepEqual(
        { count: group.count, average: group.average },
        { count: 2, average: 3.5 },
      );
      assert.deepEqual(
        (
          await db.reputationRevision.findMany({
            where: { reviewId: schemeReview.id },
            orderBy: { revision: "asc" },
          })
        ).map((row) => row.score),
        [4, 1, 5],
      );
      await assert.rejects(
        () => appealReputationReview(reviewer.user.id, appealCommand),
        /current hiding decision/,
      );
    },
  );

  await check(
    "later hiding decisions preserve earlier appeals and require their own appeal identity",
    async () => {
      await moderateReputationReview(moderator.user.id, {
        communityId: community.id,
        reviewId: schemeReview.id,
        action: "HIDE",
        reason:
          "A second specific policy concern is separately recorded and reviewable.",
      });
      const events = await db.reputationModeration.findMany({
        where: { reviewId: schemeReview.id },
        orderBy: { sequence: "asc" },
      });
      await assert.rejects(
        () =>
          appealReputationReview(reviewer.user.id, {
            communityId: community.id,
            reviewId: schemeReview.id,
            moderationId: events[0].id,
            statement:
              "The stale first hiding event cannot stand in for a new appeal.",
          }),
        /current hiding decision/,
      );
      await appealReputationReview(reviewer.user.id, {
        communityId: community.id,
        reviewId: schemeReview.id,
        moderationId: events[2].id,
        statement:
          "This separate appeal addresses the second specific hiding decision.",
      });
      await moderateReputationReview(moderator2.user.id, {
        communityId: community.id,
        reviewId: schemeReview.id,
        action: "RESTORE",
        reason:
          "An independent moderator resolves the second recorded appeal with reasons.",
      });
      assert.deepEqual(
        (
          await db.reputationModeration.findMany({
            where: { reviewId: schemeReview.id },
            orderBy: { sequence: "asc" },
          })
        ).map((row) => row.action),
        ["HIDE", "RESTORE", "HIDE", "RESTORE"],
      );
      assert.equal(
        await db.reputationAppeal.count({
          where: { reviewId: schemeReview.id },
        }),
        2,
      );
    },
  );

  await check(
    "SQL guards reject immutable history rewrites, invalid scores, forged context and conflicting moderation",
    async () => {
      const revision = await db.reputationRevision.findFirstOrThrow({
        where: { reviewId: schemeReview.id },
      });
      const moderationEvent = await db.reputationModeration.findFirstOrThrow({
        where: { reviewId: schemeReview.id },
      });
      const report = await db.reputationReport.findFirstOrThrow({
        where: { reviewId: schemeReview.id },
      });
      const appeal = await db.reputationAppeal.findFirstOrThrow({
        where: { reviewId: schemeReview.id },
      });
      await assert.rejects(() =>
        db.reputationReview.update({
          where: { id: schemeReview.id },
          data: { targetId: round.id },
        }),
      );
      await assert.rejects(() =>
        db.reputationReview.delete({ where: { id: schemeReview.id } }),
      );
      await assert.rejects(() =>
        db.reputationRevision.update({
          where: { id: revision.id },
          data: { score: 1 },
        }),
      );
      await assert.rejects(() =>
        db.reputationRevision.delete({ where: { id: revision.id } }),
      );
      await assert.rejects(() =>
        db.reputationModeration.update({
          where: { id: moderationEvent.id },
          data: { reason: "History cannot be rewritten by a later update." },
        }),
      );
      await assert.rejects(() =>
        db.reputationModeration.delete({ where: { id: moderationEvent.id } }),
      );
      await assert.rejects(() =>
        db.reputationReport.update({
          where: { id: report.id },
          data: { reason: "Report history must remain the original version." },
        }),
      );
      await assert.rejects(() =>
        db.reputationReport.delete({ where: { id: report.id } }),
      );
      await assert.rejects(() =>
        db.reputationAppeal.update({
          where: { id: appeal.id },
          data: {
            statement:
              "Appeal history must remain the original submitted version.",
          },
        }),
      );
      await assert.rejects(() =>
        db.reputationAppeal.delete({ where: { id: appeal.id } }),
      );
      await assert.rejects(() =>
        db.reputationRevision.create({
          data: {
            reviewId: schemeReview.id,
            revision: 4,
            score: 0,
            text: "A raw SQL-equivalent insertion cannot bypass integer star bounds.",
          },
        }),
      );
      await assert.rejects(() =>
        db.reputationRevision.create({
          data: {
            reviewId: schemeReview.id,
            revision: 99,
            score: 4,
            text: "A raw revision cannot skip the immutable append order.",
          },
        }),
      );
      await assert.rejects(() =>
        db.reputationReview.create({
          data: {
            communityId: community.id,
            targetType: "MEMBER",
            targetId: author.user.id,
            dimension: "PARTICIPATION",
            contextType: "ROUND",
            contextId: round.id,
            authorId: idle.user.id,
            revisions: {
              create: {
                revision: 1,
                score: 4,
                text: "An electorate entry does not prove actual round participation.",
              },
            },
          },
        }),
      );
      await assert.rejects(() =>
        db.reputationReview.create({
          data: {
            communityId: foreign.id,
            authorId: outsider.user.id,
            targetType: "SCHEME",
            targetId: scheme.id,
            dimension: "PRESENTATION",
            contextType: "ROUND",
            contextId: round.id,
            revisions: {
              create: {
                revision: 1,
                score: 4,
                text: "Foreign community review cannot borrow another community's scheme.",
              },
            },
          },
        }),
      );
      await assert.rejects(() =>
        db.reputationModeration.create({
          data: {
            reviewId: memberReview.id,
            actorId: author.user.id,
            sequence: 1,
            action: "HIDE",
            reason:
              "A target cannot hide a review about themselves through SQL.",
          },
        }),
      );
      const incompleteId = randomUUID();
      await assert.rejects(
        () =>
          db.reputationReview.create({
            data: {
              id: incompleteId,
              communityId: community.id,
              authorId: peer.user.id,
              targetType: "MEMBER",
              targetId: admin.user.id,
              dimension: "PARTICIPATION",
              contextType: "ROUND",
              contextId: round.id,
            },
          }),
        /revision|initial/i,
      );
      assert.equal(
        await db.reputationReview.count({ where: { id: incompleteId } }),
        0,
        "A missing initial revision must roll back the root, never fabricate a one-star aggregate.",
      );
    },
  );

  await check(
    "recipient experience requires matching confirmed payment and stays distinct from presentation",
    async () => {
      await assert.rejects(
        () =>
          createReputationReview(
            peer.user.id,
            input("SCHEME", scheme.id, "VERIFIED_RECIPIENT_PERFORMANCE"),
          ),
        /confirmed payment receipt/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            peer.user.id,
            input("MEMBER", author.user.id, "VERIFIED_RECIPIENT_PERFORMANCE"),
          ),
        /confirmed payment receipt/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            peer.user.id,
            input("PROPOSAL", proposal.id, "VERIFIED_RECIPIENT_PERFORMANCE"),
          ),
        /confirmed payment receipt/,
      );
      const funded = await completedRound(true);
      const fundedReview = (targetType: string, targetId: string) =>
        input(targetType, targetId, "VERIFIED_RECIPIENT_PERFORMANCE", {
          contextId: funded.round.id,
          score: 4,
          text: "Receipt-backed experience describes the payment, not verified project success.",
        });
      await assert.rejects(
        () =>
          createReputationReview(
            reviewer.user.id,
            fundedReview("SCHEME", funded.scheme.id),
          ),
        /confirmed payment receipt/,
      );
      await prepareRoundSettlement(
        admin.user.id,
        scope(funded.round.id),
        at(3.03),
      );
      await processRoundSettlement(
        admin.user.id,
        scope(funded.round.id),
        at(3.03),
      );
      const payout = await db.roundOperation.findFirstOrThrow({
        where: { roundId: funded.round.id, kind: "PAYOUT" },
      });
      assert.equal(payout.status, "CONFIRMED");
      assert.equal(payout.beneficiaryId, author.user.id);
      assert.ok(payout.transactionId);
      await createReputationReview(
        reviewer.user.id,
        fundedReview("SCHEME", funded.scheme.id),
      );
      await createReputationReview(
        reviewer.user.id,
        fundedReview("MEMBER", author.user.id),
      );
      await assert.rejects(
        () =>
          createReputationReview(
            peer.user.id,
            fundedReview("MEMBER", reviewer.user.id),
          ),
        /confirmed payment receipt/,
      );
      await contribute(admin.user.id, {
        communityId: community.id,
        amount: "1.00",
        idempotencyKey: randomUUID(),
      });
      await proposalAction(admin.user.id, {
        communityId: community.id,
        proposalId: proposal.id,
        action: "execute",
      });
      await createReputationReview(
        peer.user.id,
        input("PROPOSAL", proposal.id, "VERIFIED_RECIPIENT_PERFORMANCE", {
          text: "The executed simulated payment is evidence of receipt, not project success.",
        }),
      );
      const view = await getCommunityReputation(community.id);
      assert.ok(
        view.aggregates.some(
          (row) =>
            row.targetId === author.user.id &&
            row.dimension === "PARTICIPATION",
        ),
      );
      assert.ok(
        view.aggregates.some(
          (row) =>
            row.targetId === author.user.id &&
            row.dimension === "VERIFIED_RECIPIENT_PERFORMANCE",
        ),
      );
    },
  );

  await check(
    "pending veto-only participation never appears in review options or eligibility",
    async () => {
      const pending = await completedRound(
        true,
        true,
        new Date(Date.now() - 1000),
      );
      const before = await getCommunityReputation(
        community.id,
        reviewer.user.id,
      );
      assert.ok(
        !before.options.some((option) => option.contextId === pending.round.id),
      );
      await castRoundVetoVote(vetoOnly.user.id, {
        ...scope(pending.round.id),
        choice: "REJECT",
      });
      const after = await getCommunityReputation(
        community.id,
        reviewer.user.id,
      );
      assert.deepEqual(
        after.options,
        before.options,
        "A sealed veto-only participant must not appear as new review eligibility.",
      );
      const attempted = input("MEMBER", vetoOnly.user.id, "PARTICIPATION", {
        contextId: pending.round.id,
      });
      await assert.rejects(
        () => createReputationReview(reviewer.user.id, attempted),
        /Recorded participation/,
      );
      await assert.rejects(
        () =>
          createReputationReview(
            vetoOnly.user.id,
            input("MEMBER", author.user.id, "PARTICIPATION", {
              contextId: pending.round.id,
            }),
          ),
        /Recorded participation/,
      );
      await assert.rejects(() =>
        db.reputationReview.create({
          data: {
            communityId: community.id,
            authorId: reviewer.user.id,
            targetType: "MEMBER",
            targetId: vetoOnly.user.id,
            dimension: "PARTICIPATION",
            contextType: "ROUND",
            contextId: pending.round.id,
            revisions: {
              create: {
                revision: 1,
                score: 4,
                text: "SQL cannot reveal a sealed pending veto through reputation eligibility.",
              },
            },
          },
        }),
      );
    },
  );

  await check(
    "a completed V4 method ballot alone establishes actual participation without revealing its choice",
    async () => {
      const methodRound = await createFundingRound(
        admin.user.id,
        {
          communityId: community.id,
          title: "Method-only reputation participation",
          description:
            "A V4 complete ballot can establish participation after the entire decision is public.",
          proposalPolicy: "MEMBERS",
          quorumBps: 1,
          submissionsCloseAt: at(1).toISOString(),
          funded: true,
          fundedVersion: "V4",
          fundingTarget: "1.00",
          minimumContribution: "0.01",
          maximumContribution: "20.00",
          collectionClosesAt: at(0.5).toISOString(),
          expiresAt: at(12).toISOString(),
          selectionMethod: "FPTP",
          selectionSeats: 1,
          screeningWeight: "EQUAL",
          selectionWeight: "EQUAL",
          vetoWeight: "EQUAL",
          allocationPolicy: "WINNER_ALL",
          rankedSharesBps: [],
          vetoEnabled: false,
        },
        old,
      );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(methodRound.id), action: "open" },
        old,
      );
      await contributeToRound(
        reviewer.user.id,
        {
          ...scope(methodRound.id),
          amount: "1.00",
          idempotencyKey: randomUUID(),
        },
        old,
      );
      const methodScheme = await submitFundingScheme(
        author.user.id,
        {
          ...scope(methodRound.id),
          title: "A method ballot participation scheme",
          description:
            "A recorded proposal for a participant who only casts a complete V4 selection ballot.",
          amount: "1.00",
          recipient: "Method experience recipient",
          category: "DONATION",
        },
        old,
      );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(methodRound.id), action: "screen" },
        at(1),
      );
      await castScreeningVote(
        reviewer.user.id,
        { ...scope(methodRound.id), schemeId: methodScheme.id, choice: "YES" },
        at(1.01),
      );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(methodRound.id), action: "close-screening" },
        at(2.01),
      );
      await castMethodSelectionVote(
        idle.user.id,
        { ...scope(methodRound.id), ballot: { schemeId: methodScheme.id } },
        at(2.02),
      );
      await fundingRoundAction(
        admin.user.id,
        { ...scope(methodRound.id), action: "close-selection" },
        at(3.02),
      );
      assert.equal(
        await db.schemeScreeningVote.count({
          where: { roundId: methodRound.id, userId: idle.user.id },
        }),
        0,
      );
      assert.equal(
        await db.roundContribution.count({
          where: { roundId: methodRound.id, userId: idle.user.id },
        }),
        0,
      );
      const review = await createReputationReview(
        idle.user.id,
        input("SCHEME", methodScheme.id, "PRESENTATION", {
          contextId: methodRound.id,
          text: "My complete method ballot records actual shared participation in this decision.",
        }),
      );
      const view = await getCommunityReputation(community.id);
      assert.ok(view.reviews.some((row) => row.id === review.id));
      assert.ok(!JSON.stringify(view).includes('"ballot"'));
    },
  );

  await check(
    "HTTP requires authentication, same origin, strict schemas and correct community scope",
    async () => {
      const command = input("MEMBER", moderator.user.id, "PARTICIPATION", {
        contextType: "PROPOSAL",
        contextId: proposal.id,
      });
      await post("reputation-create", command, "", 401);
      await post(
        "reputation-create",
        command,
        reviewer.cookie,
        403,
        "https://foreign.invalid",
      );
      await post(
        "reputation-create",
        { ...command, hidden: false },
        reviewer.cookie,
        400,
      );
      await post(
        "reputation-create",
        { ...command, score: 6 },
        reviewer.cookie,
        400,
      );
      await post(
        "reputation-edit",
        {
          communityId: foreign.id,
          reviewId: schemeReview.id,
          score: 3,
          text: "An outsider cannot rewrite a review across community scopes.",
        },
        outsider.cookie,
        404,
      );
      const records = await db.auditEvent.findMany({
        where: {
          communityId: community.id,
          action: { startsWith: "REPUTATION_" },
        },
      });
      assert.ok(records.length > 0);
      assert.ok(
        records.every((record) => JSON.stringify(record.details) === "{}"),
        "Audit actions must not expose review bodies or ballot choices.",
      );
    },
  );

  await check(
    "browser creates, edits, reports, hides, appeals and restores reviews at desktop and narrow widths",
    async () => {
      process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".local/browsers");
      process.env.TEMP = resolve(".local/browser-temp");
      process.env.TMP = process.env.TEMP;
      mkdirSync(process.env.TEMP, { recursive: true });
      mkdirSync("test-results", { recursive: true });
      const { chromium } = await import("@playwright/test");
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const browser = await chromium.launch({ headless: true });
      const errors: string[] = [];
      const scans: { route: string; width: number; violations: number }[] = [];
      const route = `/communities/${community.slug}/reputation`;
      async function pageFor(actor?: Actor) {
        const context = await browser.newContext();
        if (actor) {
          const split = actor.cookie.indexOf("=");
          await context.addCookies([
            {
              name: actor.cookie.slice(0, split),
              value: actor.cookie.slice(split + 1),
              url: origin,
            },
          ]);
        }
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin + route, { waitUntil: "networkidle" });
        return page;
      }
      async function submit(
        page: Awaited<ReturnType<typeof pageFor>>,
        operation: string,
        click: () => Promise<void>,
      ) {
        const response = page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/${operation}`) &&
            response.request().method() === "POST",
        );
        await click();
        assert.equal((await response).status(), 200);
        await page.waitForLoadState("networkidle");
      }
      try {
        const composerView = await getCommunityReputation(
          community.id,
          reviewer.user.id,
        );
        assert.equal(composerView.canWrite, true);
        assert.ok(
          composerView.options.some(
            (option) =>
              option.key === `MEMBER:${moderator.user.id}:PARTICIPATION`,
          ),
          "The browser reviewer must have a real unreviewed target from shared completed participation.",
        );
        const page = await pageFor(reviewer);
        // Use the accessible role/name: DOM label text includes this nested
        // select's option text, while its accessible name is the visible caption.
        const composer = page.getByRole("combobox", {
          name: "Choose someone or something you participated with",
          exact: true,
        });
        try {
          await composer.waitFor({ state: "visible", timeout: 5000 });
          await composer.selectOption(
            `MEMBER:${moderator.user.id}:PARTICIPATION`,
            { timeout: 5000 },
          );
        } catch (error) {
          const diagnostic = await page.evaluate(() => ({
            url: location.href,
            title: document.title,
            body: document.body.innerText.slice(0, 1600),
            labels: [...document.querySelectorAll("label")]
              .filter((label) => label.textContent?.includes("Choose someone"))
              .map((label) => ({
                text: label.textContent?.slice(0, 500),
                htmlFor: label.htmlFor,
                control: label.control?.tagName,
              })),
            selects: [...document.querySelectorAll("select")].map((select) => ({
              id: select.id,
              ariaLabel: select.getAttribute("aria-label"),
              ariaLabelledby: select.getAttribute("aria-labelledby"),
              options: select.options.length,
            })),
          }));
          console.error(
            "Reputation composer diagnostic",
            JSON.stringify({
              ...diagnostic,
              composerCount: await composer.count(),
              pageErrors: errors,
              authoritativeOptionCount: composerView.options.length,
            }),
          );
          writeFileSync(".local/reputation-failure.html", await page.content());
          await page.screenshot({
            path: ".local/reputation-failure.png",
            fullPage: true,
            timeout: 5000,
          });
          throw error;
        }
        await page
          .getByRole("combobox", { name: "Your rating", exact: true })
          .selectOption("4");
        await page
          .getByRole("textbox", { name: "Your written review", exact: true })
          .fill(
            "Browser review marker: the moderator participated constructively in our shared proposal.",
          );
        await submit(page, "reputation-create", () =>
          page
            .getByRole("button", { name: "Publish review", exact: true })
            .click(),
        );
        const browserReview = await db.reputationReview.findFirstOrThrow({
          where: {
            communityId: community.id,
            authorId: reviewer.user.id,
            targetId: moderator.user.id,
            dimension: "PARTICIPATION",
          },
        });
        await page.reload({ waitUntil: "networkidle" });
        let article = page.locator(`#review-${browserReview.id}`);
        await article.getByText("Edit your review", { exact: true }).click();
        await article
          .getByRole("combobox", { name: "Revised rating", exact: true })
          .selectOption("3");
        await article
          .getByRole("textbox", { name: "Revised written review", exact: true })
          .fill(
            "Browser revised marker: specific shared participation feedback remains traceable.",
          );
        await submit(page, "reputation-edit", () =>
          article
            .getByRole("button", { name: "Save new version", exact: true })
            .click(),
        );
        const peerPage = await pageFor(peer);
        const peerArticle = peerPage.locator(`#review-${browserReview.id}`);
        await peerArticle.getByText("Report abuse", { exact: true }).click();
        await peerArticle
          .getByRole("textbox", { name: "Reason for reporting", exact: true })
          .fill(
            "Browser private abuse report marker requests careful contextual review.",
          );
        await submit(peerPage, "reputation-report", () =>
          peerArticle
            .getByRole("button", { name: "Record abuse report", exact: true })
            .click(),
        );
        const staffPage = await pageFor(admin);
        const staffArticle = staffPage.locator(`#review-${browserReview.id}`);
        await staffArticle
          .getByText("Moderate this review", { exact: true })
          .click();
        await staffArticle
          .getByRole("textbox", {
            name: "Public moderation reason",
            exact: true,
          })
          .fill(
            "Browser public reason records why this review is temporarily hidden.",
          );
        await submit(staffPage, "reputation-moderate", () =>
          staffArticle
            .getByRole("button", { name: "Hide review", exact: true })
            .click(),
        );
        const publicPage = await pageFor();
        const publicHtml = await publicPage.content();
        assert.ok(!publicHtml.includes("Browser revised marker"));
        assert.ok(!publicHtml.includes("Browser private abuse report marker"));
        assert.ok(publicHtml.includes("Browser public reason"));
        await page.reload({ waitUntil: "networkidle" });
        article = page.locator(`#review-${browserReview.id}`);
        await article
          .getByText("Appeal the hiding decision", { exact: true })
          .click();
        await article
          .getByRole("textbox", { name: "Your appeal", exact: true })
          .fill(
            "Browser appeal marker asks a different moderator to assess the recorded context.",
          );
        await submit(page, "reputation-appeal", () =>
          article
            .getByRole("button", { name: "Submit appeal", exact: true })
            .click(),
        );
        const independent = await pageFor(moderator2);
        const independentArticle = independent.locator(
          `#review-${browserReview.id}`,
        );
        await independentArticle
          .getByText("Review visibility and appeals", { exact: true })
          .click();
        await independentArticle
          .getByRole("textbox", {
            name: "Public moderation reason",
            exact: true,
          })
          .fill(
            "A different moderator restores this review after considering its author appeal.",
          );
        await submit(independent, "reputation-moderate", () =>
          independentArticle
            .getByRole("button", { name: "Restore review", exact: true })
            .click(),
        );
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 1000 : 844,
          });
          await page.goto(origin + route, { waitUntil: "networkidle" });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            ),
            false,
            `Reputation overflow at ${width}`,
          );
          const scan = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          assert.equal(
            scan.violations.length,
            0,
            JSON.stringify(scan.violations),
          );
          scans.push({ route, width, violations: 0 });
          if (width !== 320) {
            await page.evaluate(() => {
              (document.activeElement as HTMLElement)?.blur();
              window.scrollTo({ top: 0, behavior: "instant" });
            });
            await page.waitForFunction(() => scrollY === 0);
            await page.screenshot({
              path: `test-results/fundicate-reputation-${width}.png`,
              fullPage: true,
            });
          }
        }
        const scan = await new AxeBuilder({ page: publicPage })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.equal(
          scan.violations.length,
          0,
          JSON.stringify(scan.violations),
        );
        scans.push({
          route: `${route}#public-hidden`,
          width: 1280,
          violations: 0,
        });
        assert.equal(errors.length, 0, errors.join("\n"));
        writeFileSync(
          ".local/reputation-accessibility.json",
          JSON.stringify(scans, null, 2),
        );
        console.log(
          `PASS ${scans.length} reputation WCAG A/AA scans, no violations or browser runtime errors.`,
        );
      } finally {
        await browser.close();
      }
    },
  );
  console.log(
    `PASS ${checks} reputation service, SQL, HTTP, concurrency, privacy and browser checks.`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
