import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { access, atomic } from "./service";
import { ensure } from "./errors";
import { uuid } from "./validation";
import { roundSchema, ROUND_STAGE_MS } from "./rounds-core";
import { createFundingRound } from "./rounds";
import { decimalMinor } from "./analytics-core";

type Tx = Prisma.TransactionClient;
type FlatRound = Record<string, unknown>;
export type TemplateRules = {
  schemaVersion: 1;
  round: FlatRound;
  schedule: { collectionBeforeSubmissionMs: number | null; expiryAfterSubmissionMs: number | null };
};
const saveSchema = z.object({
  communityId: uuid,
  templateId: uuid.optional(),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  round: z.record(z.string(), z.unknown()).optional(),
  sourceRoundId: uuid.optional(),
}).strict().refine((v) => Boolean(v.round) !== Boolean(v.sourceRoundId), "Provide either round rules or one source round.");
const templateScope = z.object({ communityId: uuid, templateId: uuid }).strict();
const instantiateSchema = templateScope.extend({
  revision: z.coerce.number().int().positive(),
  title: z.string().trim().min(5).max(140).optional(),
  description: z.string().trim().min(20).max(8000).optional(),
  submissionsCloseAt: z.iso.datetime(),
}).strict();

/** Store validated rules, never a live ballot, contribution or absolute deadline. */
export function snapshotTemplateRules(input: unknown): TemplateRules {
  const parsed = roundSchema.parse(input);
  const submission = new Date(parsed.submissionsCloseAt).getTime();
  const { communityId, submissionsCloseAt, funding, funded, fundedVersion, ...base } = parsed;
  void communityId; void submissionsCloseAt;
  const round: FlatRound = { ...base, funded, ...(fundedVersion ? { fundedVersion } : {}) };
  let collectionBeforeSubmissionMs: number | null = null;
  let expiryAfterSubmissionMs: number | null = null;
  if (funding) {
    const { collectionClosesAt, expiresAt, ...settings } = funding;
    collectionBeforeSubmissionMs = submission - new Date(collectionClosesAt).getTime();
    expiryAfterSubmissionMs = new Date(expiresAt).getTime() - submission;
    ensure(collectionBeforeSubmissionMs >= 0 && collectionBeforeSubmissionMs <= 90 * ROUND_STAGE_MS, "Collection must close no later than submissions.");
    ensure(expiryAfterSubmissionMs >= 3 * ROUND_STAGE_MS && expiryAfterSubmissionMs <= 90 * ROUND_STAGE_MS, "Recovery expiry must be three to 90 days after submissions.");
    Object.assign(round, settings, {
      fundingTarget: decimalMinor(funding.fundingTarget),
      minimumContribution: decimalMinor(funding.minimumContribution),
      maximumContribution: decimalMinor(funding.maximumContribution),
    });
  }
  return { schemaVersion: 1, round, schedule: { collectionBeforeSubmissionMs, expiryAfterSubmissionMs } };
}

export function materializeTemplateRules(rules: unknown, communityId: string, submissionsCloseAt: string, changes: { title?: string; description?: string } = {}): FlatRound {
  const snapshot = z.object({
    schemaVersion: z.literal(1),
    round: z.record(z.string(), z.unknown()),
    schedule: z.object({
      collectionBeforeSubmissionMs: z.number().int().min(0).max(90 * ROUND_STAGE_MS).nullable(),
      expiryAfterSubmissionMs: z.number().int().min(3 * ROUND_STAGE_MS).max(90 * ROUND_STAGE_MS).nullable(),
    }).strict(),
  }).strict().parse(rules);
  const submission = new Date(z.iso.datetime().parse(submissionsCloseAt)).getTime();
  const round: FlatRound = { ...snapshot.round, ...changes, communityId, submissionsCloseAt };
  if (snapshot.round.funded === true) {
    ensure(snapshot.schedule.collectionBeforeSubmissionMs !== null && snapshot.schedule.expiryAfterSubmissionMs !== null, "Funded templates require their complete schedule.");
    round.collectionClosesAt = new Date(submission - snapshot.schedule.collectionBeforeSubmissionMs).toISOString();
    round.expiresAt = new Date(submission + snapshot.schedule.expiryAfterSubmissionMs).toISOString();
  } else {
    ensure(snapshot.schedule.collectionBeforeSubmissionMs === null && snapshot.schedule.expiryAfterSubmissionMs === null, "Decision-only templates cannot carry funding deadlines.");
  }
  roundSchema.parse(round);
  return round;
}

async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
async function fromSource(tx: Tx, communityId: string, roundId: string) {
  const source = await tx.fundingRound.findFirst({ where: { id: roundId, communityId }, include: { settlement: true } });
  ensure(source, "Source round was not found in this community.", 404);
  const input: FlatRound = { communityId, title: source.title, description: source.description, proposalPolicy: source.proposalPolicy, quorumBps: source.quorumBps, submissionsCloseAt: source.submissionsCloseAt.toISOString(), funded: source.rulesVersion > 1 };
  if (source.settlement) {
    ensure([2, 3, 4].includes(source.rulesVersion), "This round uses unsupported template rules.");
    const settings = source.settlement.rulesSnapshot as Record<string, Prisma.JsonValue>;
    Object.assign(input, {
      fundedVersion: `V${source.rulesVersion}`,
      fundingTarget: decimalMinor(source.settlement.fundingTarget),
      minimumContribution: decimalMinor(source.settlement.minimumContribution),
      maximumContribution: decimalMinor(source.settlement.maximumContribution),
      collectionClosesAt: source.settlement.collectionClosesAt.toISOString(),
      expiresAt: source.settlement.expiresAt.toISOString(),
    });
    for (const key of ["vetoEnabled", "selectionMethod", "allocationPolicy"])
      input[key] = settings[key];
    if (source.rulesVersion >= 3)
      for (const key of ["screeningWeight", "selectionWeight", "vetoWeight", "rankedSharesBps"]) input[key] = settings[key];
    if (source.rulesVersion === 2) input.votingWeight = "EQUAL";
    if (source.rulesVersion === 4) input.selectionSeats = settings.selectionSeats;
  }
  return snapshotTemplateRules(input);
}

export async function saveRoundTemplate(userId: string, input: unknown) {
  const data = saveSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const rules = data.sourceRoundId ? await fromSource(tx, data.communityId, data.sourceRoundId) : snapshotTemplateRules({ ...data.round, communityId: data.communityId });
    let template;
    if (data.templateId) {
      template = await tx.roundTemplate.findFirst({ where: { id: data.templateId, communityId: data.communityId, archivedAt: null } });
      ensure(template, "An active template was not found in this community.", 404);
      template = await tx.roundTemplate.update({ where: { id: template.id }, data: { name: data.name, description: data.description } });
    } else {
      template = await tx.roundTemplate.create({ data: { communityId: data.communityId, authorId: userId, name: data.name, description: data.description } });
    }
    const previous = await tx.roundTemplateRevision.findFirst({ where: { templateId: template.id }, orderBy: { number: "desc" } });
    const revision = await tx.roundTemplateRevision.create({ data: { templateId: template.id, number: (previous?.number ?? 0) + 1, rules: rules as unknown as Prisma.InputJsonValue } });
    await tx.auditEvent.create({ data: { communityId: data.communityId, actorId: userId, action: "ROUND_TEMPLATE_REVISION_SAVED", entityId: template.id, details: { revision: revision.number } } });
    return { template, revision };
  });
}

export async function archiveRoundTemplate(userId: string, input: unknown) {
  const data = templateScope.parse(input);
  return atomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const template = await tx.roundTemplate.findFirst({ where: { id: data.templateId, communityId: data.communityId } });
    ensure(template, "Template was not found in this community.", 404);
    if (template.archivedAt) return template;
    const archived = await tx.roundTemplate.update({ where: { id: template.id }, data: { archivedAt: new Date() } });
    await tx.auditEvent.create({ data: { communityId: data.communityId, actorId: userId, action: "ROUND_TEMPLATE_ARCHIVED", entityId: template.id, details: {} } });
    return archived;
  });
}

export async function instantiateRoundTemplate(userId: string, input: unknown, now = new Date()) {
  const data = instantiateSchema.parse(input);
  // createFundingRound repeats staff/scope/archive checks and binds this revision in its transaction.
  const revision = await db.roundTemplateRevision.findFirst({ where: { templateId: data.templateId, number: data.revision, template: { communityId: data.communityId, archivedAt: null } } });
  ensure(revision, "An active template revision was not found in this community.", 404);
  const round = materializeTemplateRules(revision.rules, data.communityId, data.submissionsCloseAt, { ...(data.title ? { title: data.title } : {}), ...(data.description ? { description: data.description } : {}) });
  return createFundingRound(userId, round, now, revision.id);
}

export async function getRoundTemplates(userId: string, communityId: string, page = 1) {
  z.number().int().min(1).max(100000).parse(page);
  return db.$transaction(async (tx) => {
    const { community, membership } = await access(tx, uuid.parse(communityId), userId);
    const total = await tx.roundTemplate.count({ where: { communityId } });
    const pageCount = Math.max(1, Math.ceil(total / 25));
    ensure(page <= pageCount, "This template library page does not exist.", 404);
    const templates = await tx.roundTemplate.findMany({ where: { communityId }, include: { revisions: { orderBy: { number: "desc" } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25 });
    const sources = await tx.fundingRound.findMany({ where: { communityId }, select: { id: true, title: true, rulesVersion: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100 });
    return { communityId, slug: community.slug, page, pageCount, total, canManage: community.adminId === userId || membership.role === "MODERATOR", templates: templates.map((template) => ({ id: template.id, name: template.name, description: template.description, archivedAt: template.archivedAt?.toISOString() ?? null, revisions: template.revisions.map((revision) => ({ id: revision.id, number: revision.number, createdAt: revision.createdAt.toISOString(), rules: revision.rules as unknown as TemplateRules })) })), sources };
  }, { isolationLevel: "RepeatableRead" });
}

export type RoundTemplateView = Awaited<ReturnType<typeof getRoundTemplates>>;
