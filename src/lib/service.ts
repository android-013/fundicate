import { Prisma, ProposalType } from "@prisma/client";
import { db } from "./db";
import { ensure } from "./errors";
import { calculateOutcome } from "./governance";
import { treasuryAdapter } from "./treasury-adapter";
import {
  applicationSchema,
  communitySchema,
  contributionSchema,
  declarationSchema,
  memberSchema,
  proposalActionSchema,
  proposalSchema,
  reviewSchema,
  voteSchema,
} from "./validation";

type Tx = Prisma.TransactionClient;
export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code)))) &&
        i < 4
      )
        continue;
      throw error;
    }
  }
}
async function lockCommunity(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id = ${id}::uuid FOR UPDATE`;
}
async function openSuccession(
  tx: Tx,
  communityId: string,
  adminId: string,
  exceptId?: string,
) {
  return tx.proposal.findFirst({
    where: {
      communityId,
      governanceProfile: "STRICT",
      type: "REMOVAL",
      status: "OPEN",
      targetUserId: adminId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
}
async function validateSuccessor(
  tx: Tx,
  communityId: string,
  adminId: string,
  successorId: string | null | undefined,
  exceptId?: string,
) {
  ensure(
    successorId && successorId !== adminId,
    "Choose a different active member as the published successor.",
  );
  const successor = await tx.communityMembership.findUnique({
    where: { communityId_userId: { communityId, userId: successorId } },
  });
  ensure(
    successor?.status === "ACTIVE",
    "The published successor must be an active member of this community.",
  );
  ensure(
    !(await tx.proposal.findFirst({
      where: {
        communityId,
        type: "REMOVAL",
        status: "OPEN",
        targetUserId: successorId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    })),
    "A member facing an open removal ballot cannot be nominated as successor.",
  );
  ensure(
    !(await openSuccession(tx, communityId, adminId, exceptId)),
    "An administrator-removal ballot is already open in this community.",
  );
}
export async function access(
  tx: Tx,
  communityId: string,
  userId: string,
  staff = false,
  admin = false,
) {
  const community = await tx.community.findUnique({
    where: { id: communityId },
    include: { policy: true },
  });
  ensure(community, "Community not found.", 404);
  const membership = await tx.communityMembership.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  ensure(
    membership?.status === "ACTIVE",
    "An active membership is required.",
    403,
  );
  const isAdmin = community.adminId === userId;
  ensure(
    !admin || isAdmin,
    "Only the community administrator can do that.",
    403,
  );
  ensure(
    !staff || isAdmin || membership.role === "MODERATOR",
    "A moderator or administrator is required.",
    403,
  );
  return {
    community,
    membership,
    isAdmin,
    isStaff: isAdmin || membership.role === "MODERATOR",
  };
}
async function audit(
  tx: Tx,
  communityId: string,
  actorId: string,
  action: string,
  entityId: string,
  details: Prisma.InputJsonValue = {},
) {
  await tx.auditEvent.create({
    data: { communityId, actorId, action, entityId, details },
  });
}
async function notify(
  tx: Tx,
  userId: string,
  communityId: string,
  message: string,
  href: string,
) {
  await tx.notification.create({
    data: { userId, communityId, message, href },
  });
}
async function activateApplicant(
  tx: Tx,
  communityId: string,
  userId: string,
  amount: bigint,
) {
  const existing = await tx.communityMembership.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  // A returning member's original declaration is immutable; unknown historical records gain the actual application pledge.
  const declaration =
    existing?.declaredContribution !== null &&
    existing?.declaredContribution !== undefined
      ? {}
      : { declaredContribution: amount, declaredAt: new Date() };
  return tx.communityMembership.upsert({
    where: { communityId_userId: { communityId, userId } },
    create: {
      communityId,
      userId,
      declaredContribution: amount,
      declaredAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      role: "MEMBER",
      suspensionReason: null,
      ...declaration,
    },
  });
}

export async function createCommunity(userId: string, input: unknown) {
  const data = communitySchema.parse(input);
  return atomic(async (tx) => {
    const strict = data.governanceProfile === "STRICT";
    const declaredAt =
      data.founderContribution !== undefined ? new Date() : null;
    const prompts = data.questions
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 5);
    const community = await tx.community.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        purpose: data.purpose,
        currency: data.currency,
        minimumContribution: data.minimumContribution,
        governanceProfile: data.governanceProfile,
        adminId: userId,
        policy: { create: {} },
        questions: {
          create: strict ? [] : prompts.map((prompt) => ({ prompt })),
        },
        memberships: {
          create: {
            userId,
            declaredContribution: data.founderContribution,
            declaredAt,
          },
        },
        accounts: {
          create: [
            { kind: "TREASURY" },
            { kind: "EXTERNAL" },
            { kind: "PAID" },
          ],
        },
      },
    });
    await audit(tx, community.id, userId, "COMMUNITY_CREATED", community.id, {
      name: community.name,
      governanceProfile: community.governanceProfile,
    });
    if (strict) {
      // Preserve the founder's actual answers in prompt order without inventing a member ballot.
      const answers = data.founderAnswers
        ? data.founderAnswers.split(/\r?\n/).map((v) => v.trim())
        : [];
      const questions = [];
      for (const prompt of prompts)
        questions.push(
          await tx.membershipQuestion.create({
            data: { communityId: community.id, prompt },
          }),
        );
      const application = await tx.membershipApplication.create({
        data: {
          communityId: community.id,
          userId,
          introduction: data.founderIntroduction,
          proposedContribution: data.founderContribution!,
          status: "APPROVED",
          decidedAt: declaredAt,
          answers: {
            create: questions.map((question, index) => ({
              questionId: question.id,
              answer: answers[index],
            })),
          },
        },
      });
      await audit(
        tx,
        community.id,
        userId,
        "FOUNDER_DECLARATION_RECORDED",
        application.id,
        {
          amountMinor: data.founderContribution!.toString(),
          bootstrap: true,
          receivedFunds: false,
        },
      );
    }
    return community;
  });
}
export async function declareContribution(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = declarationSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community, membership } = await access(
      tx,
      data.communityId,
      userId,
    );
    if (membership.declaredContribution !== null) {
      ensure(
        membership.declaredContribution === data.amount,
        "Your contribution declaration has already been recorded and cannot be changed.",
        409,
      );
      return membership;
    }
    ensure(
      data.amount >= community.minimumContribution,
      "Your declaration is below the community minimum.",
    );
    const declared = await tx.communityMembership.update({
      where: { id: membership.id },
      data: { declaredContribution: data.amount, declaredAt: now },
    });
    await audit(
      tx,
      community.id,
      userId,
      "CONTRIBUTION_DECLARED",
      membership.id,
      { amountMinor: data.amount.toString(), receivedFunds: false },
    );
    return declared;
  });
}
export async function applyForMembership(userId: string, input: unknown) {
  const data = applicationSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const community = await tx.community.findUnique({
      where: { id: data.communityId },
      include: { questions: true },
    });
    ensure(community, "Community not found.", 404);
    const membership = await tx.communityMembership.findUnique({
      where: { communityId_userId: { communityId: data.communityId, userId } },
    });
    ensure(
      !membership || membership.status === "LEFT",
      "You already have a membership record. Removed or suspended accounts require community review.",
    );
    ensure(
      !(await tx.membershipApplication.findFirst({
        where: { communityId: data.communityId, userId, status: "PENDING" },
      })),
      "You already have a pending application.",
    );
    ensure(
      data.proposedContribution >= community.minimumContribution,
      "Your proposed contribution is below the community minimum.",
    );
    ensure(
      community.questions.every((q) => data.answers[q.id]?.trim()),
      "Answer every membership question.",
    );
    ensure(
      Object.keys(data.answers).every((id) =>
        community.questions.some((q) => q.id === id),
      ),
      "An answer belongs to a different community.",
    );
    const application = await tx.membershipApplication.create({
      data: {
        communityId: data.communityId,
        userId,
        introduction: data.introduction,
        proposedContribution: data.proposedContribution,
        answers: {
          create: community.questions.map((q) => ({
            questionId: q.id,
            answer: data.answers[q.id],
          })),
        },
      },
    });
    await audit(tx, community.id, userId, "MEMBERSHIP_APPLIED", application.id);
    await notify(
      tx,
      community.adminId,
      community.id,
      "A membership application is ready for review.",
      `/communities/${community.slug}/members`,
    );
    return application;
  });
}
async function openBallot(tx: Tx, proposalId: string, actorId: string) {
  const proposal = await tx.proposal.findUniqueOrThrow({
    where: { id: proposalId },
  });
  ensure(proposal.status === "DRAFT", "Only a draft can be opened.");
  ensure(proposal.closesAt > new Date(), "The voting deadline has passed.");
  if (proposal.governanceProfile === "STRICT" && proposal.type === "REMOVAL") {
    const community = await tx.community.findUniqueOrThrow({
      where: { id: proposal.communityId },
    });
    if (proposal.targetUserId === community.adminId)
      await validateSuccessor(
        tx,
        community.id,
        community.adminId,
        proposal.successorId,
        proposal.id,
      );
    else {
      ensure(
        !proposal.successorId,
        "Only an administrator-removal ballot may name a successor.",
      );
      const succession = await openSuccession(
        tx,
        community.id,
        community.adminId,
        proposal.id,
      );
      ensure(
        succession?.successorId !== proposal.targetUserId,
        "The published successor is protected until the administrator-removal ballot is decided.",
      );
    }
  }
  const members = await tx.communityMembership.findMany({
    where: { communityId: proposal.communityId, status: "ACTIVE" },
  });
  // Applicants and subjects cannot vote on their own admission/removal/review.
  const eligible = members.filter((m) => m.userId !== proposal.targetUserId);
  ensure(eligible.length > 0, "At least one eligible voter is required.");
  await tx.eligibleVoter.createMany({
    data: eligible.map((m) => ({ proposalId, userId: m.userId })),
  });
  await tx.proposal.update({
    where: { id: proposalId },
    data: { status: "OPEN" },
  });
  await audit(tx, proposal.communityId, actorId, "BALLOT_OPENED", proposalId, {
    eligible: eligible.length,
    quorumBps: proposal.quorumBps,
    thresholdBps: proposal.thresholdBps,
  });
}
export async function reviewApplication(userId: string, input: unknown) {
  const data = reviewSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community } = await access(tx, data.communityId, userId, true);
    const app = await tx.membershipApplication.findFirst({
      where: { id: data.applicationId, communityId: data.communityId },
      include: { user: true, proposal: true },
    });
    ensure(app, "Application not found.", 404);
    ensure(
      app.status === "PENDING" && !app.proposal,
      "This application is already being decided.",
    );
    ensure(
      app.userId !== userId,
      "You cannot review your own application.",
      403,
    );
    if (
      community.governanceProfile === "STRICT" ||
      community.policy?.admissionPolicy === "VOTE"
    ) {
      ensure(
        data.decision === "ballot",
        "This community requires a membership vote. Staff cannot override it.",
        403,
      );
      const proposal = await tx.proposal.create({
        data: {
          communityId: data.communityId,
          governanceProfile: community.governanceProfile,
          proposerId: userId,
          title: `Welcome ${app.user.displayName}`,
          description: `Membership application\n\n${app.introduction}\n\nReview note: ${data.reason}`,
          type: "ADMISSION",
          applicationId: app.id,
          targetUserId: app.userId,
          quorumBps: community.policy!.quorumBps,
          thresholdBps: 5001,
          opensAt: new Date(),
          closesAt: new Date(
            Date.now() + community.policy!.votingDays * 86400000,
          ),
        },
      });
      await openBallot(tx, proposal.id, userId);
      return proposal;
    }
    ensure(data.decision !== "ballot", "This community uses staff review.");
    const approved = data.decision === "approve";
    await tx.membershipApplication.update({
      where: { id: app.id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        decidedAt: new Date(),
      },
    });
    if (approved)
      await activateApplicant(
        tx,
        community.id,
        app.userId,
        app.proposedContribution,
      );
    await audit(
      tx,
      community.id,
      userId,
      approved ? "MEMBERSHIP_APPROVED" : "MEMBERSHIP_REJECTED",
      app.id,
      { reason: data.reason },
    );
    await notify(
      tx,
      app.userId,
      community.id,
      `Your membership application was ${approved ? "approved" : "rejected"}.`,
      `/communities/${community.slug}`,
    );
    return app;
  });
}
export async function createProposal(userId: string, input: unknown) {
  const data = proposalSchema.parse(input);
  ensure(
    new Date(data.closesAt) > new Date(data.opensAt),
    "Closing must be after opening.",
  );
  ensure(
    new Date(data.closesAt) > new Date(),
    "Closing must be in the future.",
  );
  ensure(
    new Date(data.closesAt).getTime() - new Date(data.opensAt).getTime() <=
      90 * 86400000,
    "Voting windows may not exceed 90 days.",
  );
  if (data.type === "FUNDING")
    ensure(
      data.amount > 0n && data.recipient,
      "Funding proposals require an amount and recipient.",
    );
  if (data.type === "FUNDRAISING")
    ensure(data.amount > 0n, "Set a fundraising target.");
  if (data.type === "REMOVAL")
    ensure(
      data.targetUserId,
      "Choose the member whose removal will be considered.",
    );
  if (data.type === "GOVERNANCE")
    ensure(
      data.allowMemberProposals !== undefined && data.admissionPolicy,
      "Select the proposed governance rules.",
    );
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community, isStaff } = await access(tx, data.communityId, userId);
    const strictRemoval =
      community.governanceProfile === "STRICT" && data.type === "REMOVAL";
    ensure(
      strictRemoval || isStaff || community.policy?.allowMemberProposals,
      "Member submissions are disabled in this community.",
      403,
    );
    ensure(
      !data.successorId || strictRemoval,
      "Successors belong only to strict administrator-removal ballots.",
    );
    if (community.governanceProfile === "STRICT" && data.type === "GOVERNANCE")
      ensure(
        data.admissionPolicy === "VOTE",
        "Strict governance requires membership admission by majority vote.",
      );
    // Strict removal is a member-governed agenda, including when ordinary submissions are disabled.
    if (data.type === "REMOVAL") {
      if (strictRemoval && data.targetUserId === community.adminId)
        await validateSuccessor(
          tx,
          community.id,
          community.adminId,
          data.successorId,
        );
      else {
        ensure(
          data.targetUserId !== community.adminId,
          "Transfer administration before proposing removal of the administrator.",
        );
        ensure(
          !data.successorId,
          "Only an administrator-removal ballot may name a successor.",
        );
        if (strictRemoval) {
          const succession = await openSuccession(
            tx,
            community.id,
            community.adminId,
          );
          ensure(
            succession?.successorId !== data.targetUserId,
            "The published successor is protected until the administrator-removal ballot is decided.",
          );
        }
      }
      const target = await tx.communityMembership.findUnique({
        where: {
          communityId_userId: {
            communityId: community.id,
            userId: data.targetUserId,
          },
        },
      });
      ensure(
        target && ["ACTIVE", "SUSPENDED"].includes(target.status),
        "Choose a current community member.",
      );
      ensure(
        data.targetUserId !== userId,
        "Use Leave community to leave voluntarily.",
      );
    }
    const proposal = await tx.proposal.create({
      data: {
        communityId: community.id,
        governanceProfile: community.governanceProfile,
        proposerId: userId,
        title: data.title,
        description: data.description,
        type: data.type,
        amount: data.amount,
        recipient: data.recipient || null,
        supportingUrl: data.supportingUrl || null,
        targetUserId: data.type === "REMOVAL" ? data.targetUserId : null,
        successorId:
          strictRemoval && data.targetUserId === community.adminId
            ? data.successorId
            : null,
        quorumBps: data.quorumBps,
        thresholdBps: data.type === "REMOVAL" ? 6667 : data.thresholdBps,
        opensAt: new Date(data.opensAt),
        closesAt: new Date(data.closesAt),
        ...(data.type === "GOVERNANCE"
          ? {
              governanceChange: {
                allowMemberProposals: data.allowMemberProposals!,
                admissionPolicy: data.admissionPolicy!,
                quorumBps: data.quorumBps,
                thresholdBps: data.thresholdBps,
              },
            }
          : {}),
      },
    });
    await audit(tx, community.id, userId, "PROPOSAL_CREATED", proposal.id, {
      type: data.type,
    });
    if (strictRemoval || (data.publish && isStaff))
      await openBallot(tx, proposal.id, userId);
    return proposal;
  });
}
export async function castVote(userId: string, input: unknown) {
  const data = voteSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    await access(tx, data.communityId, userId);
    const proposal = await tx.proposal.findFirst({
      where: { id: data.proposalId, communityId: data.communityId },
    });
    ensure(proposal, "Proposal not found.", 404);
    const now = new Date();
    ensure(
      proposal.status === "OPEN" &&
        proposal.opensAt <= now &&
        proposal.closesAt > now,
      "This ballot is not open for voting.",
    );
    ensure(
      await tx.eligibleVoter.findUnique({
        where: { proposalId_userId: { proposalId: proposal.id, userId } },
      }),
      "You are not in this ballot’s eligibility snapshot.",
      403,
    );
    ensure(
      !(await tx.vote.findUnique({
        where: { proposalId_userId: { proposalId: proposal.id, userId } },
      })),
      "Your vote has already been recorded.",
      409,
    );
    const vote = await tx.vote.create({
      data: { proposalId: proposal.id, userId, choice: data.choice },
    });
    await audit(tx, data.communityId, userId, "VOTE_CAST", proposal.id, {
      choice: data.choice,
    });
    return vote;
  });
}
async function finalize(tx: Tx, proposalId: string, userId: string) {
  const p = await tx.proposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { votes: true, eligibleVoters: true, community: true },
  });
  ensure(
    p.status === "OPEN" || p.status === "CLOSED",
    "This proposal cannot be finalized.",
  );
  ensure(
    p.opensAt <= new Date() &&
      (p.closesAt <= new Date() || p.votes.length === p.eligibleVoters.length),
    "Wait for the deadline or for every eligible voter to vote.",
  );
  const result = calculateOutcome(
    p.votes,
    p.eligibleVoters.length,
    p.quorumBps,
    p.thresholdBps,
    p.type === "REMOVAL",
  );
  await tx.proposal.update({
    where: { id: proposalId },
    data: { status: "CLOSED" },
  });
  await audit(tx, p.communityId, userId, "BALLOT_CLOSED", p.id);
  await tx.proposal.update({
    where: { id: proposalId },
    data: {
      status: result.approved ? "APPROVED" : "REJECTED",
      finalizedAt: new Date(),
    },
  });
  if (p.type === "ADMISSION" && p.applicationId && p.targetUserId) {
    const application = await tx.membershipApplication.update({
      where: { id: p.applicationId },
      data: {
        status: result.approved ? "APPROVED" : "REJECTED",
        decidedAt: new Date(),
      },
    });
    if (result.approved)
      await activateApplicant(
        tx,
        p.communityId,
        p.targetUserId,
        application.proposedContribution,
      );
    await audit(
      tx,
      p.communityId,
      userId,
      result.approved ? "MEMBERSHIP_APPROVED" : "MEMBERSHIP_REJECTED",
      p.applicationId,
      { proposalId },
    );
    await notify(
      tx,
      p.targetUserId,
      p.communityId,
      `Your membership application was ${result.approved ? "approved" : "rejected"}.`,
      `/communities/${p.community.slug}`,
    );
  }
  if (p.type === "REMOVAL" && result.approved && p.targetUserId) {
    if (
      p.governanceProfile === "STRICT" &&
      p.targetUserId === p.community.adminId
    ) {
      await validateSuccessor(
        tx,
        p.communityId,
        p.community.adminId,
        p.successorId,
        p.id,
      );
      await tx.community.update({
        where: { id: p.communityId },
        data: { adminId: p.successorId! },
      });
      await audit(
        tx,
        p.communityId,
        userId,
        "GOVERNED_ADMIN_SUCCESSION",
        p.id,
        { previousAdminId: p.targetUserId, successorId: p.successorId },
      );
      await notify(
        tx,
        p.successorId!,
        p.communityId,
        "The community elected you as administrator.",
        `/communities/${p.community.slug}/governance`,
      );
    } else {
      ensure(
        !p.successorId,
        "The published administrator-removal subject is no longer the administrator.",
      );
      ensure(
        p.targetUserId !== p.community.adminId,
        "The current administrator cannot be removed. Transfer authority first.",
      );
      if (p.governanceProfile === "STRICT") {
        const succession = await openSuccession(
          tx,
          p.communityId,
          p.community.adminId,
          p.id,
        );
        ensure(
          succession?.successorId !== p.targetUserId,
          "The published successor is protected until the administrator-removal ballot is decided.",
        );
      }
    }
    await tx.communityMembership.update({
      where: {
        communityId_userId: {
          communityId: p.communityId,
          userId: p.targetUserId,
        },
      },
      data: { status: "REMOVED" },
    });
    await audit(tx, p.communityId, userId, "MEMBER_REMOVED", p.targetUserId, {
      proposalId,
    });
  }
  // Review asks whether to lift the emergency suspension. Rejection retains it.
  if (p.type === "SUSPENSION_REVIEW" && result.approved && p.targetUserId) {
    await tx.communityMembership.update({
      where: {
        communityId_userId: {
          communityId: p.communityId,
          userId: p.targetUserId,
        },
      },
      data: { status: "ACTIVE", suspensionReason: null },
    });
    await audit(
      tx,
      p.communityId,
      userId,
      "SUSPENSION_LIFTED",
      p.targetUserId,
      { proposalId },
    );
  }
  if (p.type === "GOVERNANCE" && result.approved) {
    const rules = p.governanceChange as {
      allowMemberProposals: boolean;
      admissionPolicy: string;
      quorumBps: number;
      thresholdBps: number;
    };
    ensure(
      rules &&
        typeof rules.allowMemberProposals === "boolean" &&
        ["VOTE", "REVIEW"].includes(rules.admissionPolicy),
      "Invalid governance change.",
    );
    ensure(
      p.governanceProfile !== "STRICT" || rules.admissionPolicy === "VOTE",
      "Strict governance requires membership admission by majority vote.",
    );
    await tx.governancePolicy.update({
      where: { communityId: p.communityId },
      data: rules,
    });
  }
  await audit(tx, p.communityId, userId, "PROPOSAL_FINALIZED", p.id, {
    ...result,
  });
  await notify(
    tx,
    p.proposerId,
    p.communityId,
    `“${p.title}” was ${result.approved ? "approved" : "rejected"}.`,
    `/communities/${p.community.slug}/proposals/${p.id}`,
  );
  return result;
}
async function postLedger(
  tx: Tx,
  args: {
    communityId: string;
    userId: string;
    amount: bigint;
    currency: string;
    type: string;
    idempotencyKey: string;
    source: string;
    destination: string;
    proposalId?: string;
    recipient?: string;
  },
) {
  ensure(args.amount > 0n, "Amount must be positive.");
  const previous = await tx.ledgerTransaction.findUnique({
    where: {
      communityId_idempotencyKey: {
        communityId: args.communityId,
        idempotencyKey: args.idempotencyKey,
      },
    },
  });
  if (previous) {
    ensure(
      previous.initiatedById === args.userId &&
        previous.amount === args.amount &&
        previous.type === args.type &&
        previous.proposalId === (args.proposalId ?? null),
      "This idempotency key is already used by another request.",
      409,
    );
    return previous;
  }
  const source = await tx.treasuryAccount.findUniqueOrThrow({
    where: {
      communityId_kind: { communityId: args.communityId, kind: args.source },
    },
  });
  const destination = await tx.treasuryAccount.findUniqueOrThrow({
    where: {
      communityId_kind: {
        communityId: args.communityId,
        kind: args.destination,
      },
    },
  });
  if (source.kind === "TREASURY") {
    const changed = await tx.treasuryAccount.updateMany({
      where: { id: source.id, balance: { gte: args.amount } },
      data: { balance: { decrement: args.amount } },
    });
    ensure(
      changed.count === 1,
      "The treasury does not have enough available funds.",
      409,
    );
  } else
    await tx.treasuryAccount.update({
      where: { id: source.id },
      data: { balance: { decrement: args.amount } },
    });
  await tx.treasuryAccount.update({
    where: { id: destination.id },
    data: { balance: { increment: args.amount } },
  });
  // This adapter has no external effects. A live adapter must use an outbox, not call a chain inside this retryable transaction.
  const execution = await treasuryAdapter.submit({
    idempotencyKey: args.idempotencyKey,
    amountMinor: args.amount,
    currency: args.currency,
    recipient: args.recipient ?? args.destination,
  });
  ensure(
    execution.simulated && execution.status === "CONFIRMED",
    "Live execution requires the documented outbox implementation.",
  );
  const transaction = await tx.ledgerTransaction.create({
    data: {
      communityId: args.communityId,
      initiatedById: args.userId,
      proposalId: args.proposalId,
      amount: args.amount,
      currency: args.currency,
      type: args.type,
      idempotencyKey: args.idempotencyKey,
      sourceAccount: source.id,
      destinationAccount: destination.id,
      simulated: true,
      network: execution.network,
      status: execution.status,
      confirmedAt: execution.confirmedAt,
      entries: {
        create: [
          { accountId: source.id, amount: -args.amount },
          { accountId: destination.id, amount: args.amount },
        ],
      },
    },
  });
  if (args.proposalId)
    await tx.fundingExecution.create({
      data: {
        proposalId: args.proposalId,
        transactionId: transaction.id,
        confirmedAt: execution.confirmedAt,
      },
    });
  await audit(
    tx,
    args.communityId,
    args.userId,
    args.type === "CONTRIBUTION" ? "CONTRIBUTION_RECORDED" : "SIMULATED_PAYOUT",
    transaction.id,
    {
      amountMinor: args.amount.toString(),
      currency: args.currency,
      proposalId: args.proposalId ?? null,
      simulated: true,
    },
  );
  return transaction;
}
export async function contribute(userId: string, input: unknown) {
  const data = contributionSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community } = await access(tx, data.communityId, userId);
    return postLedger(tx, {
      communityId: community.id,
      userId,
      amount: data.amount,
      currency: community.currency,
      type: "CONTRIBUTION",
      idempotencyKey: data.idempotencyKey,
      source: "EXTERNAL",
      destination: "TREASURY",
    });
  });
}
export async function proposalAction(userId: string, input: unknown) {
  const data = proposalActionSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community, isStaff } = await access(tx, data.communityId, userId);
    const p = await tx.proposal.findFirst({
      where: { id: data.proposalId, communityId: data.communityId },
      include: { execution: true },
    });
    ensure(p, "Proposal not found.", 404);
    const memberGovernedAction =
      p.governanceProfile === "STRICT" &&
      p.type === "REMOVAL" &&
      ["open", "finalize"].includes(data.action);
    ensure(
      isStaff || memberGovernedAction,
      "A moderator or administrator is required.",
      403,
    );
    if (data.action === "open") {
      await openBallot(tx, p.id, userId);
      return p;
    }
    if (data.action === "finalize") return finalize(tx, p.id, userId);
    if (data.action === "cancel") {
      ensure(
        p.governanceProfile !== "STRICT" || p.status !== "OPEN",
        "Published strict ballots must be decided by the community.",
        403,
      );
      ensure(
        ["DRAFT", "OPEN"].includes(p.status),
        "Only a draft or open proposal can be cancelled.",
      );
      ensure(
        data.reason.trim().length >= 10,
        "Record a reason of at least 10 characters.",
      );
      ensure(
        p.type !== "SUSPENSION_REVIEW",
        "Emergency suspension reviews must be decided by the community.",
      );
      await tx.proposal.update({
        where: { id: p.id },
        data: { status: "CANCELLED", cancellationReason: data.reason },
      });
      if (p.applicationId)
        await tx.membershipApplication.update({
          where: { id: p.applicationId },
          data: { status: "REJECTED", decidedAt: new Date() },
        });
      await audit(tx, community.id, userId, "PROPOSAL_CANCELLED", p.id, {
        reason: data.reason,
      });
      return p;
    }
    if (p.execution)
      return tx.ledgerTransaction.findUniqueOrThrow({
        where: { id: p.execution.transactionId },
      });
    ensure(
      p.status === "APPROVED" && p.type === "FUNDING",
      "Only an approved funding proposal can be executed.",
    );
    const transaction = await postLedger(tx, {
      communityId: community.id,
      userId,
      amount: p.amount,
      currency: community.currency,
      type: "PAYOUT",
      idempotencyKey: `execution:${p.id}`,
      source: "TREASURY",
      destination: "PAID",
      proposalId: p.id,
      recipient: p.recipient ?? "",
    });
    await tx.proposal.update({
      where: { id: p.id },
      data: { status: "EXECUTED" },
    });
    return transaction;
  });
}
export async function manageMember(userId: string, input: unknown) {
  const data = memberSchema.parse(input);
  return atomic(async (tx) => {
    await lockCommunity(tx, data.communityId);
    const { community } = await access(
      tx,
      data.communityId,
      userId,
      data.action !== "leave",
      ["moderator", "member", "transfer"].includes(data.action),
    );
    const target = await tx.communityMembership.findUnique({
      where: {
        communityId_userId: { communityId: community.id, userId: data.userId },
      },
    });
    ensure(
      target && ["ACTIVE", "SUSPENDED"].includes(target.status),
      "Current member not found.",
      404,
    );
    if (data.action === "leave") {
      ensure(data.userId === userId, "You can only leave for yourself.", 403);
      ensure(
        userId !== community.adminId,
        "Transfer administration before leaving.",
      );
      if (community.governanceProfile === "STRICT") {
        const succession = await openSuccession(
          tx,
          community.id,
          community.adminId,
        );
        ensure(
          succession?.successorId !== userId,
          "The published successor cannot leave until the administrator-removal ballot is decided.",
        );
      }
      await tx.communityMembership.update({
        where: { id: target.id },
        data: { status: "LEFT" },
      });
    } else if (data.action === "transfer") {
      if (community.governanceProfile === "STRICT") {
        ensure(
          !(await openSuccession(tx, community.id, community.adminId)),
          "Administration is locked until the published administrator-removal ballot is decided.",
        );
        ensure(
          !(await tx.proposal.findFirst({
            where: {
              communityId: community.id,
              type: "REMOVAL",
              status: "OPEN",
              targetUserId: data.userId,
            },
          })),
          "A member facing an open removal ballot cannot receive administration.",
        );
      }
      ensure(
        data.confirmName === community.name,
        "Type the exact community name to confirm this transfer.",
      );
      ensure(
        target.status === "ACTIVE" && data.userId !== userId,
        "Select a different active member.",
      );
      await tx.community.update({
        where: { id: community.id },
        data: { adminId: data.userId },
      });
      await notify(
        tx,
        data.userId,
        community.id,
        "You are now this community’s administrator.",
        `/communities/${community.slug}/governance`,
      );
    } else if (data.action === "suspend") {
      ensure(
        community.governanceProfile !== "STRICT",
        "Strict governance uses member removal ballots; staff cannot unilaterally suspend active voters.",
        403,
      );
      ensure(
        data.userId !== community.adminId && data.userId !== userId,
        "The administrator and your own account cannot be suspended here.",
      );
      ensure(
        data.reason.trim().length >= 20,
        "Give a detailed safety or fraud reason of at least 20 characters.",
      );
      ensure(target.status === "ACTIVE", "This member is already suspended.");
      await tx.communityMembership.update({
        where: { id: target.id },
        data: { status: "SUSPENDED", suspensionReason: data.reason },
      });
      const proposal = await tx.proposal.create({
        data: {
          communityId: community.id,
          governanceProfile: community.governanceProfile,
          proposerId: userId,
          title: "Review emergency suspension",
          description: `Vote YES to restore membership access. Vote NO to retain the suspension. Reason: ${data.reason}`,
          type: "SUSPENSION_REVIEW",
          targetUserId: data.userId,
          quorumBps: community.policy!.quorumBps,
          thresholdBps: 5001,
          opensAt: new Date(),
          closesAt: new Date(Date.now() + 3 * 86400000),
        },
      });
      await openBallot(tx, proposal.id, userId);
    } else {
      ensure(
        data.userId !== community.adminId,
        "The administrator’s role is controlled through authority transfer.",
      );
      ensure(
        target.status === "ACTIVE",
        "Only an active member can hold a moderator role.",
      );
      await tx.communityMembership.update({
        where: { id: target.id },
        data: { role: data.action === "moderator" ? "MODERATOR" : "MEMBER" },
      });
    }
    await audit(
      tx,
      community.id,
      userId,
      `MEMBER_${data.action.toUpperCase()}`,
      data.userId,
      { reason: data.reason },
    );
    return target;
  });
}
export const proposalTypeLabels: Record<ProposalType, string> = {
  FUNDING: "Funding proposal",
  FUNDRAISING: "Fundraising goal",
  ADMISSION: "Membership admission",
  REMOVAL: "Member removal",
  GOVERNANCE: "Governance change",
  SUSPENSION_REVIEW: "Suspension review",
};
