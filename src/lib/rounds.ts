import { Prisma } from "@prisma/client";
import { db } from "./db";
import { access, atomic } from "./service";
import { ensure } from "./errors";
import { calculateOutcome } from "./governance";
import {
  MAX_ROUND_SCHEMES,
  ROUND_STAGE_MS,
  roundSchema,
  schemeSchema,
  roundActionSchema,
  screeningSchema,
  selectionSchema,
  selectionOutcome,
} from "./rounds-core";

type Tx = Prisma.TransactionClient;
const identity = { id: true, displayName: true, username: true } as const;
async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
async function findRound(tx: Tx, communityId: string, roundId: string) {
  const round = await tx.fundingRound.findFirst({
    where: { id: roundId, communityId },
  });
  ensure(round, "Funding round not found.", 404);
  return round;
}
async function event(
  tx: Tx,
  actorId: string,
  round: { id: string; communityId: string },
  action: string,
  details: Prisma.InputJsonValue = {},
) {
  await tx.auditEvent.create({
    data: {
      communityId: round.communityId,
      actorId,
      entityId: round.id,
      action,
      details,
    },
  });
}
async function voter(
  tx: Tx,
  communityId: string,
  roundId: string,
  userId: string,
) {
  await access(tx, communityId, userId);
  ensure(
    await tx.roundElectorate.findUnique({
      where: { roundId_userId: { roundId, userId } },
    }),
    "You are not in this round’s voter snapshot.",
    403,
  );
}

// Clock injection is for isolated server tests. HTTP handlers never accept a clock.
export async function createFundingRound(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = roundSchema.parse(input);
  const closes = new Date(data.submissionsCloseAt);
  ensure(
    closes > now && closes.getTime() <= now.getTime() + 90 * ROUND_STAGE_MS,
    "Choose a submission deadline in the next 90 days.",
  );
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const round = await tx.fundingRound.create({
      data: {
        ...data,
        creatorId: userId,
        submissionsCloseAt: closes,
        createdAt: now,
      },
    });
    await event(tx, userId, round, "FUNDING_ROUND_CREATED");
    return round;
  });
}

export async function submitFundingScheme(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = schemeSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data.communityId, data.roundId);
    ensure(
      round.status === "SUBMISSIONS" && round.submissionsCloseAt > now,
      "This round is not accepting schemes.",
    );
    const membership = await tx.communityMembership.findUnique({
      where: { communityId_userId: { communityId: data.communityId, userId } },
    });
    ensure(
      !membership || !["SUSPENDED", "REMOVED"].includes(membership.status),
      "This account cannot submit to this community.",
      403,
    );
    ensure(
      round.proposalPolicy === "EVERYONE" || membership?.status === "ACTIVE",
      "Only active community members can submit to this round.",
      403,
    );
    ensure(
      (await tx.fundingScheme.count({ where: { roundId: round.id } })) <
        MAX_ROUND_SCHEMES,
      "This round has reached its published limit of 50 schemes.",
    );
    ensure(
      (await tx.fundingScheme.count({
        where: { roundId: round.id, authorId: userId },
      })) < 5,
      "Each account can submit up to five schemes per round.",
    );
    const scheme = await tx.fundingScheme.create({
      data: {
        roundId: round.id,
        authorId: userId,
        title: data.title,
        description: data.description,
        amount: data.amount,
        recipient: data.recipient,
        supportingUrl: data.supportingUrl || null,
        createdAt: now,
      },
    });
    await event(tx, userId, round, "FUNDING_SCHEME_SUBMITTED", {
      schemeId: scheme.id,
      title: scheme.title,
    });
    return scheme;
  });
}

export async function castScreeningVote(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = screeningSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data.communityId, data.roundId);
    await voter(tx, data.communityId, round.id, userId);
    ensure(
      round.status === "SCREENING" &&
        round.screeningOpensAt! <= now &&
        round.screeningClosesAt! > now,
      "Screening is not open for voting.",
    );
    ensure(
      await tx.fundingScheme.findFirst({
        where: { id: data.schemeId, roundId: round.id },
      }),
      "Scheme not found in this round.",
      404,
    );
    ensure(
      !(await tx.schemeScreeningVote.findUnique({
        where: { schemeId_userId: { schemeId: data.schemeId, userId } },
      })),
      "Your screening vote is already recorded.",
      409,
    );
    // Do not publish per-voter audit events while ballots are sealed.
    await tx.schemeScreeningVote.create({
      data: {
        roundId: round.id,
        schemeId: data.schemeId,
        userId,
        choice: data.choice,
        createdAt: now,
      },
    });
  });
}

export async function castSelectionVote(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = selectionSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data.communityId, data.roundId);
    await voter(tx, data.communityId, round.id, userId);
    ensure(
      round.status === "SELECTION" &&
        round.selectionOpensAt! <= now &&
        round.selectionClosesAt! > now,
      "Selection is not open for voting.",
    );
    ensure(
      await tx.fundingScheme.findFirst({
        where: { id: data.schemeId, roundId: round.id, status: "QUALIFIED" },
      }),
      "Choose a qualified scheme from this round.",
    );
    ensure(
      !(await tx.roundSelectionVote.findUnique({
        where: { roundId_userId: { roundId: round.id, userId } },
      })),
      "Your selection vote is already recorded.",
      409,
    );
    await tx.roundSelectionVote.create({
      data: {
        roundId: round.id,
        schemeId: data.schemeId,
        userId,
        createdAt: now,
      },
    });
  });
}

export async function fundingRoundAction(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = roundActionSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const round = await findRound(tx, data.communityId, data.roundId);
    if (data.action === "open") {
      ensure(
        round.status === "DRAFT" && round.submissionsCloseAt > now,
        "Only a draft with a future deadline can open.",
      );
      await tx.fundingRound.update({
        where: { id: round.id },
        data: { status: "SUBMISSIONS" },
      });
      await event(tx, userId, round, "FUNDING_ROUND_OPENED");
    } else if (data.action === "cancel") {
      ensure(
        round.status === "DRAFT",
        "Published funding rounds cannot be cancelled by staff.",
      );
      await tx.fundingRound.update({
        where: { id: round.id },
        data: { status: "CANCELLED" },
      });
      await event(tx, userId, round, "FUNDING_ROUND_CANCELLED");
    } else if (data.action === "screen") {
      ensure(
        round.status === "SUBMISSIONS" && round.submissionsCloseAt <= now,
        "Wait until the submission deadline to begin screening.",
      );
      const schemes = await tx.fundingScheme.count({
        where: { roundId: round.id },
      });
      const members = await tx.communityMembership.findMany({
        where: { communityId: round.communityId, status: "ACTIVE" },
        select: { userId: true },
        take: 10001,
      });
      ensure(
        members.length > 0 && members.length <= 10000,
        "This round supports between 1 and 10,000 eligible voters.",
      );
      await tx.roundElectorate.createMany({
        data: members.map((m) => ({ roundId: round.id, userId: m.userId })),
      });
      await tx.fundingRound.update({
        where: { id: round.id },
        data: {
          status: "SCREENING",
          screeningOpensAt: now,
          screeningClosesAt: new Date(now.getTime() + ROUND_STAGE_MS),
        },
      });
      await event(tx, userId, round, "ROUND_SCREENING_OPENED", {
        eligible: members.length,
      });
      if (!schemes) {
        await tx.fundingRound.update({
          where: { id: round.id },
          data: { status: "DECIDED", decidedAt: now, outcome: "NO_QUALIFIED" },
        });
        await event(tx, userId, round, "ROUND_SCREENING_CLOSED", {
          qualified: 0,
          schemes: 0,
        });
      }
    } else if (data.action === "close-screening") {
      ensure(round.status === "SCREENING", "This round is not in screening.");
      const schemes = await tx.fundingScheme.findMany({
        where: { roundId: round.id },
        include: { screeningVotes: { select: { choice: true } } },
      });
      const eligible = await tx.roundElectorate.count({
        where: { roundId: round.id },
      });
      ensure(
        round.screeningClosesAt! <= now ||
          schemes.every((s) => s.screeningVotes.length === eligible),
        "Wait for the screening deadline or every eligible ballot on every scheme.",
      );
      let qualified = 0;
      for (const scheme of schemes) {
        const result = calculateOutcome(
          scheme.screeningVotes,
          eligible,
          round.quorumBps,
          5001,
        );
        if (result.approved) qualified++;
        await tx.fundingScheme.update({
          where: { id: scheme.id },
          data: { status: result.approved ? "QUALIFIED" : "REJECTED" },
        });
      }
      await tx.fundingRound.update({
        where: { id: round.id },
        data: qualified
          ? {
              status: "SELECTION",
              selectionOpensAt: now,
              selectionClosesAt: new Date(now.getTime() + ROUND_STAGE_MS),
            }
          : { status: "DECIDED", decidedAt: now, outcome: "NO_QUALIFIED" },
      });
      await event(tx, userId, round, "ROUND_SCREENING_CLOSED", {
        qualified,
        schemes: schemes.length,
      });
    } else {
      ensure(round.status === "SELECTION", "This round is not in selection.");
      const [schemes, votes, eligible] = await Promise.all([
        tx.fundingScheme.findMany({
          where: { roundId: round.id, status: "QUALIFIED" },
          select: { id: true },
        }),
        tx.roundSelectionVote.findMany({
          where: { roundId: round.id },
          select: { schemeId: true },
        }),
        tx.roundElectorate.count({ where: { roundId: round.id } }),
      ]);
      ensure(
        round.selectionClosesAt! <= now || votes.length === eligible,
        "Wait for the selection deadline or every eligible ballot.",
      );
      const result = selectionOutcome(
        schemes.map((s) => s.id),
        votes,
        eligible,
        round.quorumBps,
      );
      await tx.fundingRound.update({
        where: { id: round.id },
        data: {
          status: "DECIDED",
          decidedAt: now,
          outcome: result.outcome,
          winnerSchemeId: result.winnerSchemeId,
        },
      });
      await event(tx, userId, round, "ROUND_SELECTION_CLOSED", {
        outcome: result.outcome,
        winnerSchemeId: result.winnerSchemeId,
      });
    }
    return tx.fundingRound.findUniqueOrThrow({ where: { id: round.id } });
  });
}

export async function getFundingRoundView(
  communityId: string,
  roundId: string,
  userId?: string,
) {
  return db.$transaction(
    async (tx) => {
      const round = await tx.fundingRound.findFirst({
        where: { id: roundId, communityId },
        include: {
          schemes: {
            include: { author: { select: identity } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
          _count: { select: { electorate: true } },
        },
      });
      ensure(round, "Funding round not found.", 404);
      const membership = userId
        ? await tx.communityMembership.findUnique({
            where: { communityId_userId: { communityId, userId } },
          })
        : null;
      const community = await tx.community.findUniqueOrThrow({
        where: { id: communityId },
        select: { adminId: true },
      });
      const active = membership?.status === "ACTIVE";
      const staff =
        active &&
        (community.adminId === userId || membership.role === "MODERATOR");
      ensure(
        staff || !["DRAFT", "CANCELLED"].includes(round.status),
        "Funding round not found.",
        404,
      );
      const eligible = Boolean(
        userId &&
        active &&
        (await tx.roundElectorate.findUnique({
          where: { roundId_userId: { roundId, userId } },
        })),
      );
      const showScreening = ["SELECTION", "DECIDED"].includes(round.status);
      const showSelection =
        round.status === "DECIDED" && round.selectionOpensAt !== null;
      const screens = await tx.schemeScreeningVote.findMany({
        where: {
          roundId,
          ...(!showScreening ? { userId: { in: userId ? [userId] : [] } } : {}),
        },
        select: { schemeId: true, choice: true, user: { select: identity } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const selections = await tx.roundSelectionVote.findMany({
        where: {
          roundId,
          ...(!showSelection ? { userId: { in: userId ? [userId] : [] } } : {}),
        },
        select: { schemeId: true, user: { select: identity } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const screeningResults = showScreening
        ? round.schemes.map((s) => ({
            schemeId: s.id,
            ...calculateOutcome(
              screens.filter((v) => v.schemeId === s.id),
              round._count.electorate,
              round.quorumBps,
              5001,
            ),
          }))
        : null;
      const selectionResults = showSelection
        ? selectionOutcome(
            round.schemes
              .filter((s) => s.status === "QUALIFIED")
              .map((s) => s.id),
            selections,
            round._count.electorate,
            round.quorumBps,
          )
        : null;
      return {
        round,
        staff,
        eligible,
        canSubmit: Boolean(
          userId &&
          !["SUSPENDED", "REMOVED"].includes(membership?.status ?? "") &&
          (active || round.proposalPolicy === "EVERYONE"),
        ),
        ownScreens: Object.fromEntries(
          screens
            .filter((v) => v.user.id === userId)
            .map((v) => [v.schemeId, v.choice]),
        ),
        ownSelection:
          selections.find((v) => v.user.id === userId)?.schemeId ?? null,
        screeningResults,
        selectionResults,
        screeningBallots: showScreening ? screens : null,
        selectionBallots: showSelection ? selections : null,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
