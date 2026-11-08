import { Prisma } from "@prisma/client";
import { db } from "./db";
import { ensure } from "./errors";
import { access, atomic } from "./service";
import { uuid } from "./validation";
import { z } from "zod";
import {
  externalPaymentSchema,
  externalPaymentReversalSchema,
  sameExternalPayment,
  EXTERNAL_PAYMENT_DISCLOSURE,
} from "./payment-records-core";

type Tx = Prisma.TransactionClient;
/**
 * A serializable snapshot may predate the community lock's release. A competing
 * insert can then hit the unique key rather than PostgreSQL's serialization
 * error. Retry only this local operation in a fresh transaction so the normal
 * actor/payload and reversal checks decide whether it is an exact replay.
 */
async function paymentAtomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await atomic(work);
    } catch (error) {
      const adapter = z
        .object({
          cause: z.object({
            kind: z.literal("UniqueConstraintViolation"),
            constraint: z.object({
              index: z.string().optional(),
              fields: z.array(z.string()).optional(),
            }),
          }),
        })
        .safeParse(
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.meta?.driverAdapterError
            : undefined,
        );
      const target =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
          ? (error.meta?.target ??
            (adapter.success
              ? (adapter.data.cause.constraint.index ??
                adapter.data.cause.constraint.fields)
              : undefined))
          : undefined;
      const paymentKey = Array.isArray(target)
        ? (target.length === 2 &&
            target.includes("communityId") &&
            target.includes("reference")) ||
          (target.length === 1 && target[0] === "reversesId")
        : target === "ExternalPaymentRecord_communityId_reference_key" ||
          target === "ExternalPaymentRecord_reversesId_key";
      const paymentModel =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (!error.meta?.modelName ||
          error.meta.modelName === "ExternalPaymentRecord");
      if (paymentKey && paymentModel && attempt < 4) continue;
      throw error;
    }
  }
}
async function lock(tx: Tx, communityId: string) {
  await tx.$queryRaw`SELECT id FROM "Community" WHERE id=${communityId}::uuid FOR UPDATE`;
}
function occurredAt(value: string, now: Date) {
  const date = new Date(value);
  ensure(date <= now, "The payment date cannot be in the future.");
  return date;
}

export async function recordExternalPayment(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = externalPaymentSchema.parse(input);
  const data = { ...parsed, occurredAt: occurredAt(parsed.occurredAt, now) };
  return paymentAtomic(async (tx) => {
    await lock(tx, data.communityId);
    const { community } = await access(tx, data.communityId, userId, true);
    ensure(
      data.currency === community.currency,
      "Record payments in the community currency; no currency conversion is performed.",
    );
    if (data.roundId)
      ensure(
        await tx.fundingRound.findFirst({
          where: {
            id: data.roundId,
            communityId: data.communityId,
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          select: { id: true },
        }),
        "Choose a published round in this community.",
        404,
      );
    if (data.counterpartyId)
      ensure(
        await tx.communityMembership.findUnique({
          where: {
            communityId_userId: {
              communityId: data.communityId,
              userId: data.counterpartyId,
            },
          },
          select: { id: true },
        }),
        "The counterparty must be a current or former community member.",
        400,
      );
    const existing = await tx.externalPaymentRecord.findUnique({
      where: {
        communityId_reference: {
          communityId: data.communityId,
          reference: data.reference,
        },
      },
    });
    if (existing) {
      ensure(
        existing.recordedById === userId &&
          !existing.reversesId &&
          sameExternalPayment(existing, data),
        "That payment reference is already used for different details.",
        409,
      );
      return { id: existing.id, replayed: true };
    }
    const record = await tx.externalPaymentRecord.create({
      data: { ...data, recordedById: userId },
    });
    await tx.auditEvent.create({
      data: {
        communityId: data.communityId,
        actorId: userId,
        action: "EXTERNAL_PAYMENT_RECORDED",
        entityId: record.id,
        details: { kind: data.kind, independentlyVerified: false },
      },
    });
    return { id: record.id, replayed: false };
  });
}

export async function reverseExternalPayment(
  userId: string,
  input: unknown,
  now = new Date(),
) {
  const data = externalPaymentReversalSchema.parse(input);
  const date = occurredAt(data.occurredAt, now);
  return paymentAtomic(async (tx) => {
    await lock(tx, data.communityId);
    await access(tx, data.communityId, userId, true);
    const source = await tx.externalPaymentRecord.findFirst({
      where: { id: data.recordId, communityId: data.communityId },
    });
    ensure(
      source && source.kind !== "REVERSAL",
      "An original payment record was not found in this community.",
      404,
    );
    ensure(
      date >= source.occurredAt,
      "A reversal cannot predate its original payment record.",
    );
    const payload = {
      communityId: source.communityId,
      roundId: source.roundId,
      counterpartyId: source.counterpartyId,
      kind: "REVERSAL",
      amount: source.amount,
      currency: source.currency,
      reference: data.reference,
      note: data.note,
      evidenceUrl: null,
      occurredAt: date,
      reversesId: source.id,
    };
    const existing = await tx.externalPaymentRecord.findUnique({
      where: {
        communityId_reference: {
          communityId: data.communityId,
          reference: data.reference,
        },
      },
    });
    if (existing) {
      ensure(
        existing.recordedById === userId &&
          existing.reversesId === source.id &&
          sameExternalPayment(existing, payload),
        "That payment reference is already used for different details.",
        409,
      );
      return { id: existing.id, replayed: true };
    }
    ensure(
      !(await tx.externalPaymentRecord.findUnique({
        where: { reversesId: source.id },
        select: { id: true },
      })),
      "This payment record has already been reversed.",
      409,
    );
    const record = await tx.externalPaymentRecord.create({
      data: { ...payload, recordedById: userId },
    });
    await tx.auditEvent.create({
      data: {
        communityId: data.communityId,
        actorId: userId,
        action: "EXTERNAL_PAYMENT_REVERSED",
        entityId: record.id,
        details: { originalRecordId: source.id, independentlyVerified: false },
      },
    });
    return { id: record.id, replayed: false };
  });
}

export async function listExternalPayments(
  userId: string,
  communityId: string,
  page = 1,
) {
  uuid.parse(communityId);
  z.number().int().min(1).max(100000).parse(page);
  return db.$transaction(
    async (tx) => {
      const { community, isStaff } = await access(tx, communityId, userId);
      const total = await tx.externalPaymentRecord.count({
        where: { communityId },
      });
      const pageCount = Math.max(1, Math.ceil(total / 100));
      ensure(
        page <= pageCount,
        "This payment-record page does not exist.",
        404,
      );
      const records = await tx.externalPaymentRecord.findMany({
        where: { communityId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * 100,
        take: 100,
      });
      const userIds = [
        ...new Set(
          records.flatMap((record) => [
            record.recordedById,
            ...(record.counterpartyId ? [record.counterpartyId] : []),
          ]),
        ),
      ];
      const names = new Map(
        (
          await tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true },
          })
        ).map((user) => [user.id, user.displayName]),
      );
      const reversed = new Map(
        (
          await tx.externalPaymentRecord.findMany({
            where: {
              communityId,
              reversesId: { in: records.map((record) => record.id) },
            },
            select: { id: true, reversesId: true },
          })
        ).map((record) => [record.reversesId, record.id]),
      );
      const totals = await tx.$queryRaw<{ kind: string; amount: bigint }[]>`
      SELECT original.kind, SUM(original.amount)::bigint AS amount FROM "ExternalPaymentRecord" original
      WHERE original."communityId"=${communityId}::uuid AND original.kind <> 'REVERSAL'
        AND NOT EXISTS (SELECT 1 FROM "ExternalPaymentRecord" reversal WHERE reversal."reversesId"=original.id)
      GROUP BY original.kind ORDER BY original.kind`;
      const rounds = isStaff
        ? await tx.fundingRound.findMany({
            where: { communityId, status: { notIn: ["DRAFT", "CANCELLED"] } },
            select: { id: true, title: true },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: 100,
          })
        : [];
      const counterparties = isStaff
        ? (
            await tx.communityMembership.findMany({
              where: { communityId },
              select: { user: { select: { id: true, displayName: true } } },
              orderBy: [{ joinedAt: "desc" }, { id: "asc" }],
              take: 100,
            })
          ).map((membership) => membership.user)
        : [];
      return {
        communityId,
        slug: community.slug,
        currency: community.currency,
        canManage: isStaff,
        page,
        pageCount,
        total,
        disclosure: EXTERNAL_PAYMENT_DISCLOSURE,
        records: records.map((record) => ({
          ...record,
          amount: record.amount.toString(),
          occurredAt: record.occurredAt.toISOString(),
          createdAt: record.createdAt.toISOString(),
          recordedByName: names.get(record.recordedById) ?? "Community staff",
          counterpartyName: record.counterpartyId
            ? (names.get(record.counterpartyId) ?? "Community member")
            : null,
          reversedById: reversed.get(record.id) ?? null,
        })),
        rounds,
        counterparties,
        totals: totals.map((row) => ({
          kind: row.kind,
          amount: row.amount.toString(),
        })),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20000 },
  );
}

export type ExternalPaymentsView = Awaited<
  ReturnType<typeof listExternalPayments>
>;
