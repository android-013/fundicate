import "dotenv/config";
import { db } from "../src/lib/db";
import { access, atomic, proposalAction } from "../src/lib/service";
import { fundingRoundAction } from "../src/lib/rounds";
import { closeRoundVeto } from "../src/lib/rounds-v3";
import { prepareRoundSettlement, processRoundSettlement, reconcileRoundSettlement } from "../src/lib/funded-rounds";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const actorId = value("--actor") ?? process.env.MAINTENANCE_ACTOR_ID ?? "";
const apply = args.includes("--apply");
const limit = Number(value("--limit") ?? 100);
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(actorId)) throw new Error("Set --actor to an existing staff user UUID, or set MAINTENANCE_ACTOR_ID. No implicit administrator impersonation is performed.");
if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("--limit must be an integer from1 to1000.");
for (let index = 0; index < args.length; index++) {
  if (["--actor", "--limit"].includes(args[index])) { index++; continue; }
  if (!["--apply", "--once", "--dry-run"].includes(args[index])) throw new Error("Unknown maintenance argument.");
}
if (apply && args.includes("--dry-run")) throw new Error("Choose --apply or --dry-run.");
const now = new Date();
type Action = { communityId: string; entityId: string; action: string; execute: () => Promise<unknown> };
async function main() {
  const memberships = await db.communityMembership.findMany({ where: { userId: actorId, status: "ACTIVE" }, include: { community: { select: { adminId: true } } } });
  const communityIds = memberships.filter((member) => member.role === "MODERATOR" || member.community.adminId === actorId).map((member) => member.communityId);
  const rounds = await db.fundingRound.findMany({ where: {
    communityId: { in: communityIds },
    status: { notIn: ["DRAFT", "CANCELLED"] },
    OR: [
      { status: "SUBMISSIONS", submissionsCloseAt: { lte: now } },
      { status: "SCREENING", screeningClosesAt: { lte: now } },
      { status: "SELECTION", selectionClosesAt: { lte: now } },
      { AND: [
        { settlement: { is: { network: "local-simulation", status: { notIn: ["SETTLED", "REFUNDED", "DRAFT"] } } } },
        { OR: [{ status: "DECIDED" }, { settlement: { is: { expiresAt: { lte: now } } } }] },
        { OR: [{ decision: { is: null } }, { decision: { is: { vetoClosesAt: null } } }, { decision: { is: { vetoClosesAt: { lte: now } } } }] },
      ] },
    ],
  }, include: { settlement: { include: { operations: { where: { status: "UNKNOWN" }, select: { id: true } } } }, decision: true }, orderBy: { createdAt: "asc" }, take: limit + 1 });
  const proposals = await db.proposal.findMany({ where: { communityId: { in: communityIds }, status: "OPEN", closesAt: { lte: now } }, select: { id: true, communityId: true }, orderBy: { closesAt: "asc" }, take: limit + 1 });
  const actions: Action[] = proposals.slice(0, limit).map((proposal) => ({ communityId: proposal.communityId, entityId: proposal.id, action: "proposal-finalize", execute: () => proposalAction(actorId, { communityId: proposal.communityId, proposalId: proposal.id, action: "finalize", reason: "" }) }));
  for (const round of rounds.slice(0, limit)) {
    const scope = { communityId: round.communityId, roundId: round.id };
    let action: string | undefined;
    if (round.status === "SUBMISSIONS" && round.submissionsCloseAt <= now) action = "screen";
    if (round.status === "SCREENING" && round.screeningClosesAt && round.screeningClosesAt <= now) action = "close-screening";
    if (round.status === "SELECTION" && round.selectionClosesAt && round.selectionClosesAt <= now) action = "close-selection";
    if (action) {
      const roundAction = action;
      actions.push({ communityId: round.communityId, entityId: round.id, action: roundAction, execute: () => fundingRoundAction(actorId, { ...scope, action: roundAction }) });
      continue;
    }
    if (!round.settlement || round.settlement.network !== "local-simulation") continue;
    const finance = round.settlement;
    if (round.decision?.vetoClosesAt && now < round.decision.vetoClosesAt) continue;
    if (round.decision && !round.decision.vetoFinalizedAt) {
      actions.push({ communityId: round.communityId, entityId: round.id, action: "veto-close", execute: () => closeRoundVeto(actorId, scope) });
      continue;
    }
    if (finance.operations.length) {
      actions.push({ communityId: round.communityId, entityId: round.id, action: "local-reconcile", execute: () => reconcileRoundSettlement(actorId, scope) });
      continue;
    }
    if (finance.status === "QUEUED") actions.push({ communityId: round.communityId, entityId: round.id, action: "local-process", execute: () => processRoundSettlement(actorId, scope) });
    else if (!["SETTLED", "REFUNDED"].includes(finance.status) && (round.status === "DECIDED" || finance.expiresAt <= now)) actions.push({ communityId: round.communityId, entityId: round.id, action: "local-prepare", execute: () => prepareRoundSettlement(actorId, scope) });
  }
  let failures = 0;
  for (const action of actions.slice(0, limit)) {
    if (!apply) { console.log(JSON.stringify({ at: new Date().toISOString(), status: "dry-run", communityId: action.communityId, entityId: action.entityId, action: action.action })); continue; }
    try {
      // Recheck current authority per action; a stale initial query cannot grant privileges.
      await atomic((tx) => access(tx, action.communityId, actorId, true));
      await action.execute();
      console.log(JSON.stringify({ at: new Date().toISOString(), status: "completed", communityId: action.communityId, entityId: action.entityId, action: action.action }));
    } catch {
      failures++;
      console.error(JSON.stringify({ at: new Date().toISOString(), status: "blocked", communityId: action.communityId, entityId: action.entityId, action: action.action, reason: "Authority, lifecycle, concurrency or settlement gate refused the action. Retry only after checking the recorded state." }));
    }
  }
  console.log(JSON.stringify({ status: failures ? "attention" : "ok", mode: apply ? "apply" : "dry-run", processed: Math.min(actions.length, limit), more: rounds.length > limit || proposals.length > limit || actions.length > limit, failures, next: "Run again for remaining due stages. No clock injection or live submission was performed." }));
  if (failures) process.exitCode = 1;
}
main().catch(() => { console.error("Maintenance failed. Check staff identity, database connectivity and migration readiness; private diagnostics were withheld."); process.exitCode = 1; }).finally(() => db.$disconnect());
