import { Prisma } from "@prisma/client";
import { db } from "./db";
import { access, atomic } from "./service";
import { ensure } from "./errors";
import { calculateOutcome } from "./governance";
import { validateMethodBallot } from "./methods-core";
import { z } from "zod";
import { uuid } from "./validation";
import {
  v3Weight,
  tallyV3Screening,
  tallyV3Selection,
  publishRoundDecision,
  getV3Settings,
} from "./rounds-v3";
import {
  initializeRoundFunding,
  openRoundFunding,
  freezeRoundFunding,
} from "./funded-rounds";
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
  stage: "screening" | "selection",
) {
  const round = await findRound(tx, communityId, roundId);
  if ([3, 4].includes(round.rulesVersion)) {
    const [settlement, power] = await Promise.all([
      tx.roundSettlement.findUniqueOrThrow({ where: { roundId } }),
      tx.roundVotingPower.findUnique({
        where: { roundId_userId: { roundId, userId } },
      }),
    ]);
    ensure(
      power && v3Weight(settlement, power, stage) > 0n,
      "You have no frozen voting power for this stage.",
      403,
    );
  } else await access(tx, communityId, userId);
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
  const { funded, fundedVersion, funding, ...roundData } = data;
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
        ...roundData,
        rulesVersion: funded
          ? fundedVersion === "V4"
            ? 4
            : fundedVersion === "V3"
              ? 3
              : 2
          : 1,
        creatorId: userId,
        submissionsCloseAt: closes,
        createdAt: now,
      },
    });
    if (funding) await initializeRoundFunding(tx, round, funding, now);
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
    if (round.proposalPolicy === "STAFF")
      await access(tx, data.communityId, userId, true);
    ensure(
      round.rulesVersion === 1 || data.category !== "UNSPECIFIED",
      "Choose a category for a funded scheme.",
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
        category: data.category,
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
    await voter(tx, data.communityId, round.id, userId, "screening");
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
    ensure(
      round.rulesVersion !== 4,
      "Use the published method ballot for this V4 round.",
    );
    await voter(tx, data.communityId, round.id, userId, "selection");
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

const methodVoteSchema = z
  .object({ communityId: uuid, roundId: uuid, ballot: z.unknown() })
  .strict();
export async function castMethodSelectionVote(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = methodVoteSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    const round = await findRound(tx, data.communityId, data.roundId);
    ensure(round.rulesVersion === 4, "Method ballots require a V4 round.");
    await voter(tx, data.communityId, round.id, userId, "selection");
    ensure(
      round.status === "SELECTION" &&
        round.selectionOpensAt! <= now &&
        now < round.selectionClosesAt!,
      "Selection is not open for voting.",
    );
    const settings = getV3Settings(
      await tx.roundSettlement.findUniqueOrThrow({
        where: { roundId: round.id },
      }),
    );
    const schemes = await tx.fundingScheme.findMany({
      where: { roundId: round.id, status: "QUALIFIED" },
      select: { id: true },
    });
    let ballot;
    try {
      ballot = validateMethodBallot(
        {
          selectionMethod: settings.selectionMethod,
          selectionSeats:
            "selectionSeats" in settings ? settings.selectionSeats : 1,
        },
        schemes.map((s) => s.id),
        data.ballot,
      );
    } catch (error) {
      ensure(
        false,
        error instanceof Error ? error.message : "Invalid method ballot.",
      );
    }
    ensure(
      !(await tx.roundMethodBallot.findUnique({
        where: { roundId_userId: { roundId: round.id, userId } },
      })),
      "Your selection ballot is already recorded.",
      409,
    );
    await tx.roundMethodBallot.create({
      data: {
        roundId: round.id,
        userId,
        method: settings.selectionMethod,
        ballot: ballot as Prisma.InputJsonValue,
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
      await openRoundFunding(tx, round, now);
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
      const funding = await freezeRoundFunding(tx, round, now);
      const members = [3, 4].includes(round.rulesVersion)
        ? await tx.roundVotingPower.findMany({
            where: {
              roundId: round.id,
              eligible: true,
              frozenAt: { not: null },
            },
            select: { userId: true },
            take: 10001,
          })
        : await tx.communityMembership.findMany({
            where: { communityId: round.communityId, status: "ACTIVE" },
            select: { userId: true },
            take: 10001,
          });
      ensure(
        (members.length > 0 ||
          ([3, 4].includes(round.rulesVersion) && !funding.ready)) &&
          members.length <= 10000,
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
      if (!schemes || !funding.ready) {
        if (!funding.ready)
          await tx.fundingScheme.updateMany({
            where: { roundId: round.id },
            data: { status: "REJECTED" },
          });
        await tx.fundingRound.update({
          where: { id: round.id },
          data: {
            status: "DECIDED",
            decidedAt: now,
            outcome: funding.ready ? "NO_QUALIFIED" : "FUNDING_FAILED",
          },
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
      const weighted = [3, 4].includes(round.rulesVersion)
        ? await Promise.all(
            schemes.map((scheme) => tallyV3Screening(tx, round, scheme.id)),
          )
        : null;
      ensure(
        round.screeningClosesAt! <= now ||
          (weighted
            ? weighted.every(
                (result) => result.participation === result.eligible,
              )
            : schemes.every((s) => s.screeningVotes.length === eligible)),
        "Wait for the screening deadline or every eligible ballot on every scheme.",
      );
      let qualified = 0;
      for (const [index, scheme] of schemes.entries()) {
        const result = weighted
          ? weighted[index]
          : calculateOutcome(
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
      const weighted = [3, 4].includes(round.rulesVersion)
        ? await tallyV3Selection(tx, round)
        : null;
      ensure(
        round.selectionClosesAt! <= now ||
          (weighted
            ? weighted.participation === weighted.eligible
            : votes.length === eligible),
        "Wait for the selection deadline or every eligible ballot.",
      );
      const result =
        weighted ??
        selectionOutcome(
          schemes.map((s) => s.id),
          votes,
          eligible,
          round.quorumBps,
        );
      const allocationSelected =
        [3, 4].includes(round.rulesVersion) &&
        getV3Settings(
          await tx.roundSettlement.findUniqueOrThrow({
            where: { roundId: round.id },
          }),
        ).allocationPolicy !== "WINNER_ALL" &&
        result.participation >= result.quorumRequired &&
        Object.values(result.counts).some((power) => power > 0);
      await tx.fundingRound.update({
        where: { id: round.id },
        data: {
          status: "DECIDED",
          decidedAt: now,
          outcome: allocationSelected ? "ALLOCATION_SELECTED" : result.outcome,
          winnerSchemeId: allocationSelected ? null : result.winnerSchemeId,
        },
      });
      await event(tx, userId, round, "ROUND_SELECTION_CLOSED", {
        outcome: allocationSelected ? "ALLOCATION_SELECTED" : result.outcome,
        winnerSchemeId: allocationSelected ? null : result.winnerSchemeId,
      });
    }
    const updated = await tx.fundingRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    if ([3, 4].includes(updated.rulesVersion) && updated.status === "DECIDED")
      await publishRoundDecision(tx, updated, userId, now);
    return updated;
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
        ([3, 4].includes(round.rulesVersion) || active) &&
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
      const methodBallots =
        round.rulesVersion === 4
          ? await tx.roundMethodBallot.findMany({
              where: {
                roundId,
                ...(!showSelection
                  ? { userId: { in: userId ? [userId] : [] } }
                  : {}),
              },
              select: {
                ballot: true,
                method: true,
                user: { select: identity },
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            })
          : [];
      const screeningResults =
        showScreening && ![3, 4].includes(round.rulesVersion)
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
      const selectionResults =
        showSelection && ![3, 4].includes(round.rulesVersion)
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
          (round.proposalPolicy === "EVERYONE" ||
            (round.proposalPolicy === "STAFF" ? staff : active)),
        ),
        ownScreens: Object.fromEntries(
          screens
            .filter((v) => v.user.id === userId)
            .map((v) => [v.schemeId, v.choice]),
        ),
        ownSelection:
          selections.find((v) => v.user.id === userId)?.schemeId ?? null,
        ownMethodBallot:
          methodBallots.find((v) => v.user.id === userId)?.ballot ?? null,
        methodBallots:
          showSelection && round.rulesVersion === 4 ? methodBallots : null,
        screeningResults,
        selectionResults,
        screeningBallots: showScreening ? screens : null,
        selectionBallots: showSelection ? selections : null,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
