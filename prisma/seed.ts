import "dotenv/config";
import { createHash } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import {
  applyForMembership,
  atomic,
  castVote,
  contribute,
  createCommunity,
  createProposal,
  manageMember,
  proposalAction,
} from "../src/lib/service";

const stableId = (name: string) => {
  const h = createHash("sha256").update(`fundicate-demo:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ALLOW_DEMO_SEED !== "true"
  )
    throw new Error(
      "Demo seeding is disabled. Set ALLOW_DEMO_SEED=true in a local development environment only.",
    );
  if (await db.community.findUnique({ where: { slug: "campus-collective" } })) {
    console.log("Demo is already seeded. Existing data was preserved.");
    return;
  }
  const passwordHash = await hashPassword("FundicateDemo!2026");
  const people = [
    ["amara", "Amara Chen"],
    ["sami", "Sami Khan"],
    ["lena", "Lena Brooks"],
    ["jules", "Jules Rivera"],
    ["noor", "Noor Rahman"],
    ["river", "River Park"],
    ["ari", "Ari Morgan"],
    ["mina", "Mina Ellis"],
  ];
  const users: User[] = [];
  for (const [username, displayName] of people)
    users.push(
      await db.user.upsert({
        where: { email: `${username}@fundicate.demo` },
        update: {},
        create: {
          id: stableId(username),
          email: `${username}@fundicate.demo`,
          username,
          displayName,
          passwordHash,
        },
      }),
    );
  const [amara, sami, lena, jules, noor, river, ari, mina] = users;
  const campus = await createCommunity(amara.id, {
    name: "Campus Collective",
    slug: "campus-collective",
    description:
      "Student-led ideas. Shared resources. A better campus for everyone.",
    purpose:
      "We’re a collective of students turning small contributions into meaningful campus projects. From community gardens to open workshops, we fund ideas that bring people together and leave something good behind.\n\nOur goal: make university life more accessible, sustainable, and connected — one shared decision at a time.",
    currency: "USD",
    minimumContribution: "25",
    questions:
      "What would you like to make happen on campus?\nHow would you like to contribute beyond funding?",
  });
  await atomic(async (tx) => {
    for (const u of [sami, lena, jules, noor, river, ari]) {
      await tx.communityMembership.create({
        data: { communityId: campus.id, userId: u.id },
      });
      await tx.auditEvent.create({
        data: {
          communityId: campus.id,
          actorId: amara.id,
          action: "DEMO_MEMBERSHIP_ESTABLISHED",
          entityId: u.id,
          details: { fixture: true },
        },
      });
    }
    await tx.membershipApplication.create({
      data: {
        communityId: campus.id,
        userId: jules.id,
        introduction:
          "I would love to bring open design workshops to our campus and help document the collective’s impact.",
        proposedContribution: 150000n,
        status: "APPROVED",
        decidedAt: new Date(),
      },
    });
  });
  for (const u of [sami, lena])
    await manageMember(amara.id, {
      communityId: campus.id,
      userId: u.id,
      action: "moderator",
    });
  const amounts = ["4000", "2250", "2000", "1500", "1500", "1500", "1500"];
  for (let i = 0; i < 7; i++)
    await contribute(users[i].id, {
      communityId: campus.id,
      amount: amounts[i],
      idempotencyKey: stableId(`contribution-${i}`),
    });
  const make = async (
    title: string,
    type: "FUNDING" | "FUNDRAISING" | "GOVERNANCE",
    amount: string,
    description: string,
    days = 7,
  ) =>
    createProposal(amara.id, {
      communityId: campus.id,
      title,
      type,
      amount,
      description,
      recipient: type === "FUNDING" ? "Campus project team" : "",
      quorumBps: 5000,
      thresholdBps: 5001,
      opensAt: new Date(Date.now() - 3600000).toISOString(),
      closesAt: new Date(Date.now() + days * 86400000).toISOString(),
      publish: true,
      ...(type === "GOVERNANCE"
        ? { allowMemberProposals: false, admissionPolicy: "REVIEW" }
        : {}),
    });
  const approve = async (p: { id: string }, yes = true) => {
    for (let i = 0; i < 7; i++)
      await castVote(users[i].id, {
        communityId: campus.id,
        proposalId: p.id,
        choice: yes ? "YES" : i < 3 ? "YES" : "NO",
      });
    await proposalAction(amara.id, {
      communityId: campus.id,
      proposalId: p.id,
      action: "finalize",
    });
  };
  const executed = await make(
    "An open workshop, for everyone",
    "FUNDING",
    "1800",
    "Equip the student makerspace with shared hand tools, safety supplies, and six introductory workshops. The project team will publish an inventory and a short impact report after the first month.",
  );
  await approve(executed);
  await proposalAction(amara.id, {
    communityId: campus.id,
    proposalId: executed.id,
    action: "execute",
  });
  const allocated = await make(
    "A toolkit for our next generation of builders",
    "FUNDING",
    "2400",
    "Fund twelve shared hardware kits and peer-led sessions for first-year students. All kits stay in the community inventory and will be available to borrow at no cost.",
  );
  await approve(allocated);
  const goal = await make(
    "Our next chapter: the $20,000 community fund",
    "FUNDRAISING",
    "20000",
    "Approve a collective fundraising goal for accessible campus experiences, shared tools, and student-led sustainability projects. This goal is a shared ambition; it does not reserve or transfer money.",
  );
  await approve(goal);
  const rejected = await make(
    "Move membership decisions to staff-only review",
    "GOVERNANCE",
    "0",
    "Consider replacing member admission votes with moderator review and disabling ordinary member proposal submissions. This proposal deliberately demonstrates a rejected governance change.",
  );
  await approve(rejected, false);
  const garden = await make(
    "Let’s grow a greener campus",
    "FUNDING",
    "1850",
    "Create a student-run community garden with raised beds, native plants, composting stations, and open growing sessions. The first milestone is a fully planted pilot area with a publicly shared materials budget.",
    2,
  );
  await castVote(amara.id, {
    communityId: campus.id,
    proposalId: garden.id,
    choice: "YES",
  });
  await castVote(sami.id, {
    communityId: campus.id,
    proposalId: garden.id,
    choice: "YES",
  });
  await castVote(jules.id, {
    communityId: campus.id,
    proposalId: garden.id,
    choice: "NO",
  });
  await make(
    "A seat at the table for every student",
    "FUNDING",
    "950",
    "Support a monthly community dinner with ingredient grants and accessible seating. Student volunteers will cook together and document actual costs for the community.",
    5,
  );
  const questions = await db.membershipQuestion.findMany({
    where: { communityId: campus.id },
  });
  await applyForMembership(mina.id, {
    communityId: campus.id,
    introduction:
      "I’m a design student who wants to help make campus spaces greener and more welcoming. I can help plan volunteer days and create simple project reports.",
    proposedContribution: "75",
    answers: Object.fromEntries(
      questions.map((q) => [
        q.id,
        "I would like to support the garden project and volunteer a few hours each month.",
      ]),
    ),
  });
  const commons = await createCommunity(sami.id, {
    name: "Neighborhood Commons",
    slug: "neighborhood-commons",
    description:
      "Neighbors investing in greener streets and a more connected everyday.",
    purpose:
      "We pool small contributions to make our neighborhood greener, more welcoming, and better connected. Our first shared goals are a seed library, street cleanup kits, and regular open community meetups.",
    currency: "USD",
    minimumContribution: "10",
    questions: "What would you like to improve in your neighborhood?",
  });
  await db.community.update({
    where: { id: commons.id },
    data: { color: "blue" },
  });
  await db.communityMembership.create({
    data: { communityId: commons.id, userId: amara.id },
  });
  await contribute(sami.id, {
    communityId: commons.id,
    amount: "1750",
    idempotencyKey: stableId("commons-contribution"),
  });
  await contribute(amara.id, {
    communityId: commons.id,
    amount: "500",
    idempotencyKey: stableId("commons-amara"),
  });
  const library = await createProposal(sami.id, {
    communityId: commons.id,
    title: "A seed library for every season",
    description:
      "Create a free seed exchange at the community center, with clear labeling, starter growing guides, and two volunteer-led planting sessions.",
    type: "FUNDING",
    amount: "450",
    recipient: "Commons seed library",
    quorumBps: 5000,
    thresholdBps: 5001,
    opensAt: new Date(Date.now() - 3600000).toISOString(),
    closesAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    publish: true,
  });
  await castVote(sami.id, {
    communityId: commons.id,
    proposalId: library.id,
    choice: "YES",
  });
  console.log(
    "Seed complete: 2 communities, 8 fictional users, 2 moderators, open/approved/rejected/executed proposals, pending and approved applications, balanced simulated treasury.",
  );
  console.log("Demo login: amara@fundicate.demo / FundicateDemo!2026");
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
