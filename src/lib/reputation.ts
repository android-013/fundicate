import { Prisma } from "@prisma/client";
import { db } from "./db";
import { access, atomic } from "./service";
import { ensure } from "./errors";
import {
  aggregateReputation,
  appealReputationSchema,
  createReputationSchema,
  editReputationSchema,
  moderateReputationSchema,
  reportReputationSchema,
  reviewDimensionAllowed,
} from "./reputation-core";

type Tx = Prisma.TransactionClient;
const identity = { id: true, displayName: true, username: true } as const;
const closedProposalStatuses = [
  "CLOSED",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
] as const;
type ContextScope = {
  communityId: string;
  contextType: string;
  contextId: string;
};
type TargetScope = {
  communityId: string;
  targetType: string;
  targetId: string;
};

async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
async function audit(
  tx: Tx,
  communityId: string,
  actorId: string,
  reviewId: string,
  action: string,
) {
  // A completed context is required, and no review body or ballot choice enters activity feeds.
  await tx.auditEvent.create({
    data: { communityId, actorId, entityId: reviewId, action, details: {} },
  });
}
async function findReview(tx: Tx, communityId: string, reviewId: string) {
  const review = await tx.reputationReview.findFirst({
    where: { id: reviewId, communityId },
  });
  ensure(review, "Review not found in this community.", 404);
  return review;
}

async function contextParticipants(tx: Tx, scope: ContextScope) {
  if (scope.contextType === "ROUND") {
    const round = await tx.fundingRound.findFirst({
      where: {
        id: scope.contextId,
        communityId: scope.communityId,
        status: "DECIDED",
        decidedAt: { not: null },
      },
      select: { creatorId: true, title: true },
    });
    ensure(
      round,
      "Use a completed funding round as participation evidence.",
      403,
    );
    const decision = await tx.roundDecision.findUnique({
      where: { roundId: scope.contextId },
      select: { vetoClosesAt: true },
    });
    if (decision?.vetoClosesAt && decision.vetoClosesAt > new Date())
      return { title: round.title, participants: new Set<string>() };
    const [schemes, screening, selection, methods, veto, contributions] =
      await Promise.all([
        tx.fundingScheme.findMany({
          where: { roundId: scope.contextId },
          select: { authorId: true },
        }),
        tx.schemeScreeningVote.findMany({
          where: { roundId: scope.contextId },
          select: { userId: true },
        }),
        tx.roundSelectionVote.findMany({
          where: { roundId: scope.contextId },
          select: { userId: true },
        }),
        tx.roundMethodBallot.findMany({
          where: { roundId: scope.contextId },
          select: { userId: true },
        }),
        tx.roundVetoVote.findMany({
          where: { roundId: scope.contextId },
          select: { userId: true },
        }),
        tx.roundContribution.findMany({
          where: { roundId: scope.contextId, amount: { gt: 0n } },
          select: { userId: true },
        }),
      ]);
    return {
      title: round.title,
      participants: new Set([
        round.creatorId,
        ...schemes.map((x) => x.authorId),
        ...[screening, selection, methods, veto, contributions].flatMap(
          (rows) => rows.map((x) => x.userId),
        ),
      ]),
    };
  }
  ensure(scope.contextType === "PROPOSAL", "Unknown participation context.");
  const proposal = await tx.proposal.findFirst({
    where: {
      id: scope.contextId,
      communityId: scope.communityId,
      status: { in: [...closedProposalStatuses] },
      finalizedAt: { not: null },
    },
    select: {
      title: true,
      proposerId: true,
      votes: { select: { userId: true } },
    },
  });
  ensure(proposal, "Use a finalized proposal as participation evidence.", 403);
  return {
    title: proposal.title,
    participants: new Set([
      proposal.proposerId,
      ...proposal.votes.map((x) => x.userId),
    ]),
  };
}

async function targetInfo(tx: Tx, scope: TargetScope) {
  if (scope.targetType === "MEMBER") {
    const member = await tx.communityMembership.findUnique({
      where: {
        communityId_userId: {
          communityId: scope.communityId,
          userId: scope.targetId,
        },
      },
      include: { user: { select: identity } },
    });
    ensure(member, "Member target not found in this community.", 404);
    return {
      ownerId: member.userId,
      title: member.user.displayName,
      contextType: null,
      contextId: null,
    };
  }
  if (scope.targetType === "SCHEME") {
    const scheme = await tx.fundingScheme.findFirst({
      where: { id: scope.targetId, round: { communityId: scope.communityId } },
      select: { authorId: true, title: true, roundId: true },
    });
    ensure(scheme, "Scheme target not found in this community.", 404);
    return {
      ownerId: scheme.authorId,
      title: scheme.title,
      contextType: "ROUND",
      contextId: scheme.roundId,
    };
  }
  if (scope.targetType === "PROPOSAL") {
    const proposal = await tx.proposal.findFirst({
      where: { id: scope.targetId, communityId: scope.communityId },
      select: { proposerId: true, title: true, id: true },
    });
    ensure(proposal, "Proposal target not found in this community.", 404);
    return {
      ownerId: proposal.proposerId,
      title: proposal.title,
      contextType: "PROPOSAL",
      contextId: proposal.id,
    };
  }
  ensure(scope.targetType === "ROUND", "Unknown review target.");
  const round = await tx.fundingRound.findFirst({
    where: { id: scope.targetId, communityId: scope.communityId },
    select: { creatorId: true, title: true, id: true },
  });
  ensure(round, "Round target not found in this community.", 404);
  return {
    ownerId: round.creatorId,
    title: round.title,
    contextType: "ROUND",
    contextId: round.id,
  };
}

async function hasReceipt(tx: Tx, scope: TargetScope & ContextScope) {
  if (
    scope.contextType === "ROUND" &&
    ["MEMBER", "SCHEME"].includes(scope.targetType)
  ) {
    const operation = await tx.roundOperation.findFirst({
      where: {
        roundId: scope.contextId,
        kind: "PAYOUT",
        status: "CONFIRMED",
        amount: { gt: 0n },
        ...(scope.targetType === "MEMBER"
          ? { beneficiaryId: scope.targetId }
          : { schemeId: scope.targetId }),
        transaction: { kind: "PAYOUT", amount: { gt: 0n } },
      },
      select: { id: true },
    });
    return Boolean(operation);
  }
  if (scope.targetType === "PROPOSAL" && scope.contextType === "PROPOSAL") {
    return Boolean(
      await tx.fundingExecution.findFirst({
        where: {
          proposalId: scope.targetId,
          status: "CONFIRMED",
          transaction: { status: "CONFIRMED", amount: { gt: 0n } },
        },
        select: { id: true },
      }),
    );
  }
  return false;
}

async function eligible(
  tx: Tx,
  userId: string,
  data: TargetScope & ContextScope & { dimension: string },
) {
  ensure(
    reviewDimensionAllowed(data.targetType, data.dimension),
    "That review dimension does not apply to this target.",
  );
  const target = await targetInfo(tx, data);
  ensure(
    target.ownerId !== userId,
    "You cannot review yourself or your own work.",
    403,
  );
  if (target.contextType)
    ensure(
      target.contextType === data.contextType &&
        target.contextId === data.contextId,
      "The target does not belong to that participation context.",
      403,
    );
  const context = await contextParticipants(tx, data);
  ensure(
    context.participants.has(userId),
    "Recorded participation in this completed context is required; eligibility alone is insufficient.",
    403,
  );
  ensure(
    context.participants.has(target.ownerId),
    "The target must share actual participation in this context.",
    403,
  );
  if (data.dimension === "VERIFIED_RECIPIENT_PERFORMANCE")
    ensure(
      await hasReceipt(tx, data),
      "A confirmed payment receipt to this target is required. A transfer does not verify project success.",
      403,
    );
  return target;
}

export async function createReputationReview(userId: string, input: unknown) {
  const data = createReputationSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId);
    await eligible(tx, userId, data);
    ensure(
      !(await tx.reputationReview.findFirst({
        where: {
          communityId: data.communityId,
          authorId: userId,
          targetType: data.targetType,
          targetId: data.targetId,
          dimension: data.dimension,
        },
      })),
      "You already reviewed this target and dimension. Edit the existing review instead.",
      409,
    );
    const { score, text, ...scope } = data;
    const review = await tx.reputationReview.create({
      data: {
        ...scope,
        authorId: userId,
        revisions: { create: { revision: 1, score, text } },
      },
    });
    await audit(
      tx,
      data.communityId,
      userId,
      review.id,
      "REPUTATION_REVIEW_CREATED",
    );
    return review;
  });
}

export async function editReputationReview(userId: string, input: unknown) {
  const data = editReputationSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId);
    const review = await findReview(tx, data.communityId, data.reviewId);
    ensure(
      review.authorId === userId,
      "Only the review author can edit it.",
      403,
    );
    await eligible(tx, userId, review);
    const current = await tx.reputationRevision.findFirstOrThrow({
      where: { reviewId: review.id },
      orderBy: { revision: "desc" },
    });
    ensure(
      current.score !== data.score || current.text !== data.text,
      "The review is unchanged.",
      409,
    );
    const revision = await tx.reputationRevision.create({
      data: {
        reviewId: review.id,
        revision: current.revision + 1,
        score: data.score,
        text: data.text,
      },
    });
    await audit(
      tx,
      data.communityId,
      userId,
      review.id,
      "REPUTATION_REVIEW_REVISED",
    );
    return revision;
  });
}

export async function reportReputationReview(userId: string, input: unknown) {
  const data = reportReputationSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId);
    const review = await findReview(tx, data.communityId, data.reviewId);
    ensure(
      review.authorId !== userId,
      "You cannot report your own review.",
      403,
    );
    ensure(
      !(await tx.reputationReport.findUnique({
        where: {
          reviewId_reporterId: { reviewId: review.id, reporterId: userId },
        },
      })),
      "Your abuse report is already recorded.",
      409,
    );
    const report = await tx.reputationReport.create({
      data: { reviewId: review.id, reporterId: userId, reason: data.reason },
    });
    await audit(
      tx,
      data.communityId,
      userId,
      review.id,
      "REPUTATION_ABUSE_REPORTED",
    );
    return report;
  });
}

export async function moderateReputationReview(userId: string, input: unknown) {
  const data = moderateReputationSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const review = await findReview(tx, data.communityId, data.reviewId);
    const target = await targetInfo(tx, review);
    ensure(
      review.authorId !== userId && target.ownerId !== userId,
      "A moderator cannot decide a review of themselves, their work, or their own review.",
      403,
    );
    const last = await tx.reputationModeration.findFirst({
      where: { reviewId: review.id },
      orderBy: { sequence: "desc" },
    });
    ensure(
      (last?.action === "HIDE") === (data.action === "RESTORE"),
      "That visibility transition is already applied.",
      409,
    );
    if (data.action === "RESTORE" && last) {
      const appeal = await tx.reputationAppeal.findUnique({
        where: { moderationId: last.id },
      });
      ensure(
        !appeal || last.actorId !== userId,
        "An appeal requires a different, unconflicted moderator.",
        403,
      );
    }
    const moderation = await tx.reputationModeration.create({
      data: {
        reviewId: review.id,
        actorId: userId,
        sequence: (last?.sequence ?? 0) + 1,
        action: data.action,
        reason: data.reason,
      },
    });
    await audit(
      tx,
      data.communityId,
      userId,
      review.id,
      `REPUTATION_REVIEW_${data.action === "HIDE" ? "HIDDEN" : "RESTORED"}`,
    );
    return moderation;
  });
}

export async function appealReputationReview(userId: string, input: unknown) {
  const data = appealReputationSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId);
    const review = await findReview(tx, data.communityId, data.reviewId);
    ensure(
      review.authorId === userId,
      "Only the review author can appeal.",
      403,
    );
    const last = await tx.reputationModeration.findFirst({
      where: { reviewId: review.id },
      orderBy: { sequence: "desc" },
    });
    ensure(
      last?.action === "HIDE" && last.id === data.moderationId,
      "Appeal the current hiding decision.",
      409,
    );
    ensure(
      !(await tx.reputationAppeal.findUnique({
        where: { moderationId: last.id },
      })),
      "An appeal for this decision is already recorded.",
      409,
    );
    const appeal = await tx.reputationAppeal.create({
      data: {
        reviewId: review.id,
        moderationId: last.id,
        authorId: userId,
        statement: data.statement,
      },
    });
    await audit(
      tx,
      data.communityId,
      userId,
      review.id,
      "REPUTATION_REVIEW_APPEALED",
    );
    return appeal;
  });
}

function sourceHref(
  slug: string,
  targetType: string,
  targetId: string,
  contextId: string,
) {
  const base = `/communities/${slug}`;
  if (targetType === "MEMBER") return `${base}/members`;
  if (targetType === "PROPOSAL") return `${base}/proposals/${targetId}`;
  if (targetType === "SCHEME")
    return `${base}/rounds/${contextId}#scheme-${targetId}`;
  return `${base}/rounds/${targetId}`;
}

export async function getCommunityReputation(
  communityId: string,
  userId?: string | null,
) {
  return db.$transaction(
    async (tx) => {
      const community = await tx.community.findUnique({
        where: { id: communityId },
        select: { slug: true, adminId: true },
      });
      ensure(community, "Community not found.", 404);
      const membership = userId
        ? await tx.communityMembership.findUnique({
            where: { communityId_userId: { communityId, userId } },
          })
        : null;
      const canWrite = membership?.status === "ACTIVE";
      const isStaff =
        canWrite &&
        (community.adminId === userId || membership?.role === "MODERATOR");
      // Aggregate every current visible review, even when only a bounded page of bodies is rendered.
      const all = await tx.reputationReview.findMany({
        where: { communityId },
        include: {
          author: { select: identity },
          revisions: { orderBy: { revision: "desc" }, take: 1 },
          moderations: { orderBy: { sequence: "desc" }, take: 1 },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      ensure(
        all.every((row) => row.revisions.length > 0),
        "A review is missing its immutable score revision.",
        409,
      );
      const aggregates = aggregateReputation(
        all.map((row) => ({
          ...row,
          score: row.revisions[0].score,
          hidden: row.moderations[0]?.action === "HIDE",
        })),
      );
      const rows = await Promise.all(
        all.slice(0, 50).map(async (review) => {
          const target = await targetInfo(tx, review);
          const hidden = review.moderations[0]?.action === "HIDE";
          const privileged = isStaff || review.authorId === userId;
          const [history, reports, appeals, moderationHistory] =
            await Promise.all([
              privileged
                ? tx.reputationRevision.findMany({
                    where: { reviewId: review.id },
                    orderBy: { revision: "asc" },
                  })
                : Promise.resolve([]),
              isStaff
                ? tx.reputationReport.findMany({
                    where: { reviewId: review.id },
                    include: { reporter: { select: identity } },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  })
                : Promise.resolve([]),
              privileged
                ? tx.reputationAppeal.findMany({
                    where: { reviewId: review.id },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  })
                : Promise.resolve([]),
              tx.reputationModeration.findMany({
                where: { reviewId: review.id },
                include: { actor: { select: identity } },
                orderBy: { sequence: "asc" },
              }),
            ]);
          return {
            id: review.id,
            targetType: review.targetType,
            targetId: review.targetId,
            dimension: review.dimension,
            contextType: review.contextType,
            contextId: review.contextId,
            createdAt: review.createdAt.toISOString(),
            title: target.title,
            href: sourceHref(
              community.slug,
              review.targetType,
              review.targetId,
              review.contextId,
            ),
            author: review.author,
            hidden,
            score:
              !hidden || privileged
                ? (review.revisions[0]?.score ?? null)
                : null,
            text:
              !hidden || privileged
                ? (review.revisions[0]?.text ?? null)
                : null,
            revision: review.revisions[0]?.revision ?? 0,
            history: history.map((item) => ({
              revision: item.revision,
              score: item.score,
              text: item.text,
              createdAt: item.createdAt.toISOString(),
            })),
            reports: reports.map((item) => ({
              id: item.id,
              reason: item.reason,
              reporter: item.reporter,
              createdAt: item.createdAt.toISOString(),
            })),
            appeals: appeals.map((item) => ({
              id: item.id,
              moderationId: item.moderationId,
              statement: item.statement,
              createdAt: item.createdAt.toISOString(),
            })),
            moderationHistory: moderationHistory.map((item) => ({
              id: item.id,
              action: item.action,
              reason: item.reason,
              actor: item.actor,
              createdAt: item.createdAt.toISOString(),
            })),
            canEdit: canWrite && review.authorId === userId,
            canReport: canWrite && review.authorId !== userId,
            canModerate:
              isStaff &&
              review.authorId !== userId &&
              target.ownerId !== userId,
          };
        }),
      );
      const options: {
        key: string;
        targetType: string;
        targetId: string;
        dimension: string;
        contextType: string;
        contextId: string;
        label: string;
        href: string;
      }[] = [];
      if (canWrite && userId) {
        const [rounds, proposals] = await Promise.all([
          tx.fundingRound.findMany({
            where: { communityId, status: "DECIDED", decidedAt: { not: null } },
            select: {
              id: true,
              title: true,
              creatorId: true,
              schemes: { select: { id: true, authorId: true, title: true } },
            },
            orderBy: [{ decidedAt: "desc" }, { id: "asc" }],
            take: 30,
          }),
          tx.proposal.findMany({
            where: {
              communityId,
              status: { in: [...closedProposalStatuses] },
              finalizedAt: { not: null },
            },
            select: { id: true, proposerId: true, title: true },
            orderBy: [{ finalizedAt: "desc" }, { id: "asc" }],
            take: 30,
          }),
        ]);
        const members = await tx.communityMembership.findMany({
          where: { communityId },
          select: { userId: true, user: { select: { displayName: true } } },
        });
        const names = new Map(
          members.map((m) => [m.userId, m.user.displayName]),
        );
        const existing = new Set(
          all
            .filter((r) => r.authorId === userId)
            .map((r) => `${r.targetType}:${r.targetId}:${r.dimension}`),
        );
        const add = async (
          targetType: string,
          targetId: string,
          title: string,
          contextType: string,
          contextId: string,
          dimension: string,
        ) => {
          const key = `${targetType}:${targetId}:${dimension}`;
          if (existing.has(key) || options.some((o) => o.key === key)) return;
          if (
            dimension === "VERIFIED_RECIPIENT_PERFORMANCE" &&
            !(await hasReceipt(tx, {
              communityId,
              targetType,
              targetId,
              contextType,
              contextId,
            }))
          )
            return;
          options.push({
            key,
            targetType,
            targetId,
            dimension,
            contextType,
            contextId,
            label: title,
            href: sourceHref(community.slug, targetType, targetId, contextId),
          });
        };
        for (const round of rounds) {
          const context = await contextParticipants(tx, {
            communityId,
            contextType: "ROUND",
            contextId: round.id,
          });
          if (!context.participants.has(userId)) continue;
          if (round.creatorId !== userId)
            await add(
              "ROUND",
              round.id,
              round.title,
              "ROUND",
              round.id,
              "PARTICIPATION",
            );
          for (const scheme of round.schemes)
            if (scheme.authorId !== userId) {
              await add(
                "SCHEME",
                scheme.id,
                scheme.title,
                "ROUND",
                round.id,
                "PRESENTATION",
              );
              await add(
                "SCHEME",
                scheme.id,
                scheme.title,
                "ROUND",
                round.id,
                "VERIFIED_RECIPIENT_PERFORMANCE",
              );
            }
          for (const participant of [...context.participants].sort())
            if (participant !== userId && names.has(participant)) {
              await add(
                "MEMBER",
                participant,
                names.get(participant)!,
                "ROUND",
                round.id,
                "PARTICIPATION",
              );
              await add(
                "MEMBER",
                participant,
                names.get(participant)!,
                "ROUND",
                round.id,
                "VERIFIED_RECIPIENT_PERFORMANCE",
              );
            }
        }
        for (const proposal of proposals) {
          const context = await contextParticipants(tx, {
            communityId,
            contextType: "PROPOSAL",
            contextId: proposal.id,
          });
          if (!context.participants.has(userId)) continue;
          if (proposal.proposerId !== userId) {
            await add(
              "PROPOSAL",
              proposal.id,
              proposal.title,
              "PROPOSAL",
              proposal.id,
              "PRESENTATION",
            );
            await add(
              "PROPOSAL",
              proposal.id,
              proposal.title,
              "PROPOSAL",
              proposal.id,
              "VERIFIED_RECIPIENT_PERFORMANCE",
            );
          }
          for (const participant of [...context.participants].sort())
            if (participant !== userId && names.has(participant))
              await add(
                "MEMBER",
                participant,
                names.get(participant)!,
                "PROPOSAL",
                proposal.id,
                "PARTICIPATION",
              );
        }
      }
      return {
        reviews: rows,
        aggregates,
        options,
        totalReviews: all.length,
        canWrite,
        isStaff,
        contextLimit: 30,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000, maxWait: 10000 },
  );
}
