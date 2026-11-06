import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { createCommunity } from "../src/lib/service";
import { createFundingRound, fundingRoundAction, submitFundingScheme, castScreeningVote, castMethodSelectionVote, getFundingRoundView } from "../src/lib/rounds";
import { contributeToRound, prepareRoundSettlement, processRoundSettlement, getRoundFinanceView } from "../src/lib/funded-rounds";
import { getV3RoundView } from "../src/lib/rounds-v3";

async function main() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  assert.match(name, /^fundicate_demo_large_\d+_\d+$/);
  assert.equal(process.env.ALLOW_LARGE_ISOLATED_DEMO, "true");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.equal(await db.user.count(), 0, "The large demo only populates a new empty isolated database.");
  const password = "FictionalDemo!2026";
  const passwordHash = await hashPassword(password);
  const people = Array.from({ length: 100 }, (_, index) => ({ id: randomUUID(), username: `fictional${String(index + 1).padStart(3, "0")}`, email: `fictional${String(index + 1).padStart(3, "0")}@fundicate.invalid`, displayName: `Fictional member ${String(index + 1).padStart(3, "0")}`, passwordHash }));
  await db.user.createMany({ data: people });
  const [admin] = people;
  const community = await createCommunity(admin.id, { name: "Fictional hundred-member collective", slug: "hundred-member-bdt", description: "Isolated fictional100-member demonstration with100000BDT of simulated contributions.", purpose: "Show sealed community choices, exact allocation and original-contributor refunds without real money or fabricated blockchain receipts.", currency: "BDT", minimumContribution: "1000", questions: "" });
  const day = 86400000;
  const base = new Date(Date.now() - 20 * day);
  const at = (offset: number) => new Date(base.getTime() + day * offset);
  await db.communityMembership.updateMany({ where: { communityId: community.id }, data: { joinedAt: at(-1) } });
  await db.communityMembership.createMany({ data: people.slice(1).map((person, index) => ({ communityId: community.id, userId: person.id, role: index < 2 ? "MODERATOR" as const : "MEMBER" as const, joinedAt: at(-1) })) });
  await db.auditEvent.create({ data: { communityId: community.id, actorId: admin.id, action: "ISOLATED_FICTIONAL_DEMO_CREATED", entityId: community.id, details: { fictional: true, members: 100, simulated: true, currency: "BDT", totalMinor: "10000000" } } });
  const round = await createFundingRound(admin.id, { communityId: community.id, title: "Fictional100000BDT shared project vote", description: "A reproducible isolated demonstration:100 equal contributors choose among three schemes, pay a60000BDT request and refund40000BDT to original owners.", proposalPolicy: "MEMBERS", quorumBps: 5000, funded: true, fundedVersion: "V4", fundingTarget: "100000", minimumContribution: "1000", maximumContribution: "1000", collectionClosesAt: at(0.5).toISOString(), submissionsCloseAt: at(1).toISOString(), expiresAt: at(10).toISOString(), screeningWeight: "EQUAL", selectionWeight: "EQUAL", vetoWeight: "EQUAL", vetoEnabled: false, selectionMethod: "FPTP", selectionSeats: 1, allocationPolicy: "WINNER_ALL", rankedSharesBps: [] }, base);
  const scope = { communityId: community.id, roundId: round.id };
  await fundingRoundAction(admin.id, { ...scope, action: "open" }, base);
  for (const person of people) await contributeToRound(person.id, { ...scope, amount: "1000", idempotencyKey: randomUUID() }, base);
  const schemes = [];
  for (const [index, amount] of ["60000", "80000", "100000"].entries()) schemes.push(await submitFundingScheme(people[index + 3].id, { ...scope, title: ["Fictional shared learning lab", "Fictional garden and repair hub", "Fictional public workspace"][index], description: "A fictional community proposal for testing the complete decision and simulated accounting lifecycle.", amount, recipient: `Fictional project recipient ${index + 1}`, category: "DONATION", supportingUrl: "" }, at(0.1)));
  await fundingRoundAction(admin.id, { ...scope, action: "screen" }, at(1));
  for (const scheme of schemes) for (const person of people) await castScreeningVote(person.id, { ...scope, schemeId: scheme.id, choice: "YES" }, at(1.1));
  await fundingRoundAction(admin.id, { ...scope, action: "close-screening" }, at(2.01));
  for (const [index, person] of people.entries()) await castMethodSelectionVote(person.id, { ...scope, ballot: { schemeId: schemes[index < 60 ? 0 : index < 85 ? 1 : 2].id } }, at(2.1));
  const [anonymous, own, other, aggregate] = await Promise.all([ getFundingRoundView(community.id, round.id), getFundingRoundView(community.id, round.id, admin.id), getFundingRoundView(community.id, round.id, people[99].id), getV3RoundView(community.id, round.id, admin.id, at(2.2)) ]);
  for (const view of [anonymous, own, other]) { assert.equal(view.methodBallots, null); assert.equal(view.selectionBallots, null); assert.equal(view.selectionResults, null); }
  assert.deepEqual(own.ownMethodBallot, { schemeId: schemes[0].id });
  assert.equal(anonymous.ownMethodBallot, null);
  assert.equal(aggregate?.selectionResult, null);
  console.log(JSON.stringify({ stage: "sealed-selection", fictionalMembers: 100, schemes: 3, receivedMinor: "10000000", currency: "BDT", simulated: true, publicBallots: null, publicResult: null, privacyAssertions: "passed" }));
  await fundingRoundAction(admin.id, { ...scope, action: "close-selection" }, at(3.02));
  await prepareRoundSettlement(admin.id, scope, at(3.03));
  let final;
  for (let batch = 0; batch < 10; batch++) {
    final = await processRoundSettlement(admin.id, scope, at(3.04));
    if (["SETTLED", "REFUNDED"].includes(final.status)) break;
  }
  assert.ok(final);
  assert.equal(final.received, 10000000n);
  assert.equal(final.paid, 6000000n);
  assert.equal(final.refunded, 4000000n);
  assert.equal(final.status, "SETTLED");
  const refunds = await db.roundOperation.findMany({ where: { roundId: round.id, kind: "REFUND" } });
  assert.equal(refunds.length, 100);
  assert.ok(refunds.every((refund) => refund.amount === 40000n && refund.status === "CONFIRMED"));
  const summary = await getRoundFinanceView(community.id, round.id, admin.id, at(3.05));
  assert.equal(summary?.totals.held, 0n);
  assert.equal(summary?.totals.reserved, 0n);
  assert.equal(await db.user.count(), 100);
  await processRoundSettlement(admin.id, scope, at(3.06));
  assert.equal(await db.roundOperation.count({ where: { roundId: round.id, kind: "REFUND" } }), 100);
  console.log(JSON.stringify({ stage: "settled", fictional: true, simulated: true, members: 100, schemes: 3, currency: "BDT", decimals: 2, receivedMinor: "10000000", paidMinor: "6000000", refundedMinor: "4000000", refundedPerMemberMinor: "40000", heldMinor: "0", reservedMinor: "0", community: "/communities/hundred-member-bdt", round: `/communities/hundred-member-bdt/rounds/${round.id}`, demoLogin: "fictional001@fundicate.invalid", demoPassword: password, note: "These credentials exist only in the newly created isolated fictional database. No chain transfer or exchange rate is claimed." }));
}
main().catch(() => { console.error("Large fictional demo assertions failed. Inspect the retained isolated database; the normal database was not modified."); process.exitCode = 1; }).finally(() => db.$disconnect());
