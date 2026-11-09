import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { db } from "../src/lib/db";
import { createCommunity } from "../src/lib/service";
import { createFundingRound, fundingRoundAction } from "../src/lib/rounds";
import {
  recordExternalPayment,
  reverseExternalPayment,
  listExternalPayments,
} from "../src/lib/payment-records";
import { createSession, hashToken, sessionCookie } from "../src/lib/auth";
import { runPaymentRecordsBrowserChecks } from "./payment-records-browser";

let checks = 0;
async function check(name: string, work: () => Promise<void>) {
  await work();
  console.log(`PASS ${++checks}. ${name}`);
}
async function main() {
  assert.ok(
    new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"),
    "Payment checks require an isolated test database.",
  );
  const people = await Promise.all(
    [
      "paymentadmin",
      "paymentmember",
      "paymentmod",
      "paymentoutside",
      "paymentformer",
    ].map((name) =>
      db.user.create({
        data: {
          email: `${name}@payments.invalid`,
          username: name,
          displayName: name,
          passwordHash: "unused-test-authentication",
        },
      }),
    ),
  );
  const [admin, member, moderator, outside, former] = people;
  const base = {
    description:
      "A real isolated community for exact staff-recorded external payments.",
    purpose:
      "Record externally handled payments while keeping local simulation separate.",
    minimumContribution: "0",
    questions: "",
    currency: "BDT",
  };
  const community = await createCommunity(admin.id, {
    ...base,
    name: "External payment collective",
    slug: "external-payments",
  });
  const foreign = await createCommunity(outside.id, {
    ...base,
    name: "Foreign payment collective",
    slug: "foreign-payments",
  });
  await db.communityMembership.createMany({
    data: [
      { communityId: community.id, userId: member.id },
      { communityId: community.id, userId: moderator.id, role: "MODERATOR" },
      { communityId: community.id, userId: former.id, status: "LEFT" },
    ],
  });
  const roundBase = {
    title: "A decision-only recorded payment context",
    description:
      "A preserved decision context does not acquire any payment authority.",
    proposalPolicy: "MEMBERS",
    quorumBps: 5000,
    submissionsCloseAt: new Date(Date.now() + 86400000).toISOString(),
    funded: false,
  };
  const round = await createFundingRound(admin.id, {
    ...roundBase,
    communityId: community.id,
  });
  const foreignRound = await createFundingRound(outside.id, {
    ...roundBase,
    communityId: foreign.id,
  });
  const draftRound = await createFundingRound(admin.id, {
    ...roundBase,
    communityId: community.id,
  });
  const cancelledRound = await createFundingRound(admin.id, {
    ...roundBase,
    communityId: community.id,
  });
  await fundingRoundAction(admin.id, {
    communityId: community.id,
    roundId: cancelledRound.id,
    action: "cancel",
  });
  await fundingRoundAction(admin.id, {
    communityId: community.id,
    roundId: round.id,
    action: "open",
  });
  const now = new Date();
  const date = new Date(now.getTime() - 60000).toISOString();
  const input = {
    communityId: community.id,
    roundId: round.id,
    counterpartyId: member.id,
    kind: "CONTRIBUTION",
    amount: "100.03",
    currency: "BDT",
    reference: "sensitive-bank-reference-001",
    note: "Private payment note that must never leak into public activity.",
    evidenceUrl: "https://example.com/private-receipt-001",
    occurredAt: date,
  };
  const before = {
    ledger: await db.ledgerTransaction.count(),
    roundLedger: await db.roundLedgerTransaction.count(),
    contributions: await db.roundContribution.count(),
    voting: await db.roundVotingPower.count(),
    accounts: await db.treasuryAccount.findMany({
      where: { communityId: community.id },
      orderBy: { id: "asc" },
      select: { id: true, balance: true },
    }),
  };
  let originalId = "";

  const checkInsertionClocks = async () => {
    await check(
      "insert clocks remain valid after transaction delays and across session timezones without admitting future dates",
      async () => {
        const history = await db.externalPaymentRecord.findMany({
          orderBy: { id: "asc" },
        });
        assert.ok(
          history.length > 0,
          "Posted records must exist before the rollback probes.",
        );
        const auditCount = await db.auditEvent.count();
        const client = new pg.Client({
          connectionString: process.env.DATABASE_URL,
        });
        await client.connect();
        try {
          for (const zone of ["UTC", "Asia/Dhaka", "America/New_York"]) {
            await client.query("BEGIN");
            try {
              await client.query("SELECT set_config('TimeZone', $1, true)", [
                zone,
              ]);
              await client.query("SELECT pg_sleep(0.05)");
              const clockBefore = await client.query<{ milliseconds: string }>(
                `SELECT (EXTRACT(EPOCH FROM timezone('UTC',clock_timestamp())) * 1000)::bigint::text AS milliseconds`,
              );
              const reference = `clock-default-${randomUUID()}`;
              const result = await client.query<{
                count: number;
                afterTransaction: boolean;
                notFuture: boolean;
                earliestMs: string;
                latestMs: string;
                observedMs: string;
              }>(
                `WITH inserted AS (
                INSERT INTO "ExternalPaymentRecord"
                  (id,"communityId","recordedById",kind,amount,currency,reference,note,"occurredAt")
                SELECT gen_random_uuid(),$1::uuid,$2::uuid,'CONTRIBUTION',1,'BDT',
                  $3::text || '-' || n::text,'Rolled-back insertion clock probe.',
                  timezone('UTC',clock_timestamp()) - interval '1 minute'
                FROM generate_series(1,32) n
                RETURNING "createdAt"
              ) SELECT count(*)::int AS count,
                bool_and("createdAt" > timezone('UTC',transaction_timestamp())) AS "afterTransaction",
                bool_and("createdAt" <= timezone('UTC',clock_timestamp())::timestamp(3)) AS "notFuture",
                (EXTRACT(EPOCH FROM min("createdAt")) * 1000)::bigint::text AS "earliestMs",
                (EXTRACT(EPOCH FROM max("createdAt")) * 1000)::bigint::text AS "latestMs",
                (EXTRACT(EPOCH FROM timezone('UTC',clock_timestamp())) * 1000)::bigint::text AS "observedMs"
                FROM inserted`,
                [community.id, admin.id, reference],
              );
              assert.equal(result.rows[0].count, 32);
              assert.equal(result.rows[0].afterTransaction, true);
              assert.equal(result.rows[0].notFuture, true);
              assert.ok(
                BigInt(result.rows[0].earliestMs) >=
                  BigInt(clockBefore.rows[0].milliseconds),
              );
              assert.ok(
                BigInt(result.rows[0].latestMs) <=
                  BigInt(result.rows[0].observedMs),
              );
              // This is the old Prisma-client timing pattern: insert metadata is
              // generated after the transaction began and the lock was acquired.
              const explicit = await client.query(
                `INSERT INTO "ExternalPaymentRecord"
                (id,"communityId","recordedById",kind,amount,currency,reference,note,"occurredAt","createdAt")
              VALUES (gen_random_uuid(),$1::uuid,$2::uuid,'CONTRIBUTION',1,'BDT',$3,
                'Rolled-back explicit insertion clock probe.',
                timezone('UTC',clock_timestamp()) - interval '1 minute',
                timezone('UTC',clock_timestamp())::timestamp(3))`,
                [community.id, admin.id, `clock-explicit-${randomUUID()}`],
              );
              assert.equal(explicit.rowCount, 1);
              const reversal = await client.query(
                `INSERT INTO "ExternalPaymentRecord"
                (id,"communityId","recordedById",kind,amount,currency,reference,note,"occurredAt","reversesId")
              SELECT gen_random_uuid(),"communityId",$1::uuid,'REVERSAL',amount,currency,$2,
                'Rolled-back reversal insertion clock probe.',
                timezone('UTC',clock_timestamp()),id
              FROM "ExternalPaymentRecord" WHERE reference=$3`,
                [admin.id, `clock-reversal-${randomUUID()}`, reference + "-1"],
              );
              assert.equal(reversal.rowCount, 1);
            } finally {
              await client.query("ROLLBACK");
            }
            for (const futureColumn of ["occurredAt", "createdAt"] as const) {
              await client.query("BEGIN");
              try {
                await client.query("SELECT set_config('TimeZone', $1, true)", [
                  zone,
                ]);
                const occurrence =
                  futureColumn === "occurredAt"
                    ? "timezone('UTC',clock_timestamp()) + interval '1 day'"
                    : "timezone('UTC',clock_timestamp()) - interval '1 minute'";
                const creation =
                  futureColumn === "createdAt"
                    ? "timezone('UTC',clock_timestamp()) + interval '1 day'"
                    : "timezone('UTC',clock_timestamp())";
                await assert.rejects(
                  client.query(
                    `INSERT INTO "ExternalPaymentRecord"
                    (id,"communityId","recordedById",kind,amount,currency,reference,note,"occurredAt","createdAt")
                  VALUES (gen_random_uuid(),$1::uuid,$2::uuid,'CONTRIBUTION',1,'BDT',$3,
                    'Rejected future insertion clock probe.',${occurrence},${creation})`,
                    [community.id, admin.id, `clock-future-${randomUUID()}`],
                  ),
                  (error: unknown) =>
                    error instanceof Error &&
                    "code" in error &&
                    error.code === "P0001" &&
                    error.message === "External payment time is in the future",
                );
              } finally {
                await client.query("ROLLBACK");
              }
            }
          }
        } finally {
          await client.end();
        }
        assert.deepEqual(
          await db.externalPaymentRecord.findMany({ orderBy: { id: "asc" } }),
          history,
        );
        assert.equal(await db.auditEvent.count(), auditCount);
        assert.equal(await db.ledgerTransaction.count(), before.ledger);
        assert.equal(
          await db.roundLedgerTransaction.count(),
          before.roundLedger,
        );
        assert.equal(await db.roundContribution.count(), before.contributions);
        assert.equal(await db.roundVotingPower.count(), before.voting);
        assert.deepEqual(
          await db.treasuryAccount.findMany({
            where: { communityId: community.id },
            orderBy: { id: "asc" },
            select: { id: true, balance: true },
          }),
          before.accounts,
        );
      },
    );
  };

  await check(
    "only active community staff can record external payments",
    async () => {
      await assert.rejects(recordExternalPayment(member.id, input));
      await assert.rejects(recordExternalPayment(outside.id, input));
      await assert.rejects(recordExternalPayment(former.id, input));
      const saved = await recordExternalPayment(admin.id, input);
      originalId = saved.id;
      assert.equal(saved.replayed, false);
      const row = await db.externalPaymentRecord.findUniqueOrThrow({
        where: { id: originalId },
      });
      assert.equal(row.amount, 10003n);
      assert.equal(row.recordedById, admin.id);
    },
  );
  await check(
    "replayed references require every original detail and recorder identity",
    async () => {
      const repeat = await recordExternalPayment(admin.id, input);
      assert.equal(repeat.id, originalId);
      assert.equal(repeat.replayed, true);
      for (const change of [
        { amount: "100.04" },
        { note: "A different private note." },
        { kind: "REFUND" },
        { roundId: "" },
        { evidenceUrl: "https://example.com/other" },
        { counterpartyId: admin.id },
      ])
        await assert.rejects(
          recordExternalPayment(admin.id, { ...input, ...change }),
        );
      await assert.rejects(recordExternalPayment(moderator.id, input));
      assert.equal(
        await db.externalPaymentRecord.count({
          where: { communityId: community.id },
        }),
        1,
      );
    },
  );
  await check(
    "concurrent replays create exactly one attributable record and one audit",
    async () => {
      const payload = { ...input, reference: "concurrent-original-001" };
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          recordExternalPayment(moderator.id, payload),
        ),
      );
      assert.equal(new Set(results.map((result) => result.id)).size, 1);
      assert.equal(
        await db.externalPaymentRecord.count({
          where: { communityId: community.id, reference: payload.reference },
        }),
        1,
      );
      assert.equal(
        await db.auditEvent.count({
          where: {
            entityId: results[0].id,
            action: "EXTERNAL_PAYMENT_RECORDED",
          },
        }),
        1,
      );
    },
  );
  await check(
    "currency, future dates, foreign rounds and foreign counterparties are rejected",
    async () => {
      for (const change of [
        { currency: "USD" },
        { occurredAt: new Date(now.getTime() + 86400000).toISOString() },
        { roundId: foreignRound.id },
        { roundId: draftRound.id },
        { roundId: cancelledRound.id },
        { counterpartyId: outside.id },
      ])
        await assert.rejects(
          recordExternalPayment(admin.id, {
            ...input,
            reference: randomUUID(),
            ...change,
          }),
        );
      await recordExternalPayment(admin.id, {
        ...input,
        counterpartyId: former.id,
        reference: "former-member-contribution",
      });
    },
  );
  await check(
    "SQL-like free text is inert data while SQL-like IDs fail validation",
    async () => {
      const reference = "x'; DROP TABLE ExternalPaymentRecord; --";
      const recorded = await recordExternalPayment(admin.id, {
        ...input,
        reference,
        note: "<script>alert(1)</script>",
      });
      assert.equal(
        (
          await db.externalPaymentRecord.findUniqueOrThrow({
            where: { id: recorded.id },
          })
        ).reference,
        reference,
      );
      assert.ok((await db.community.count()) >= 2);
      await assert.rejects(
        recordExternalPayment(admin.id, {
          ...input,
          communityId: "' OR 1=1 --",
        }),
      );
      await assert.rejects(listExternalPayments(admin.id, "' OR 1=1 --"));
    },
  );
  await check(
    "payment details are restricted to active members and never enter public audit details",
    async () => {
      const view = await listExternalPayments(member.id, community.id);
      assert.equal(view.canManage, false);
      assert.ok(view.disclosure.includes("independently unverified"));
      assert.equal(
        view.records.find((record) => record.id === originalId)?.amount,
        "10003",
      );
      assert.deepEqual(view.counterparties, []);
      await assert.rejects(listExternalPayments(outside.id, community.id));
      await assert.rejects(listExternalPayments(former.id, community.id));
      const audit = JSON.stringify(
        await db.auditEvent.findMany({
          where: {
            communityId: community.id,
            action: { startsWith: "EXTERNAL_PAYMENT" },
          },
        }),
      );
      for (const value of [
        input.reference,
        input.note,
        input.evidenceUrl,
        "10003",
      ])
        assert.equal(audit.includes(value), false);
    },
  );
  await check(
    "a correction appends one full reversal and preserves original records",
    async () => {
      const reversal = {
        communityId: community.id,
        recordId: originalId,
        reference: "reversal-original-001",
        note: "The original receipt was attributed incorrectly.",
        occurredAt: now.toISOString(),
      };
      await assert.rejects(reverseExternalPayment(member.id, reversal));
      await assert.rejects(reverseExternalPayment(outside.id, reversal));
      await assert.rejects(
        reverseExternalPayment(admin.id, {
          ...reversal,
          occurredAt: new Date(now.getTime() - 120000).toISOString(),
        }),
      );
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          reverseExternalPayment(admin.id, reversal),
        ),
      );
      assert.equal(new Set(results.map((result) => result.id)).size, 1);
      assert.equal(
        await db.externalPaymentRecord.count({
          where: { reversesId: originalId },
        }),
        1,
      );
      const original = await db.externalPaymentRecord.findUniqueOrThrow({
        where: { id: originalId },
      });
      assert.equal(original.amount, 10003n);
      assert.equal(original.note, input.note);
      const reverse = await db.externalPaymentRecord.findUniqueOrThrow({
        where: { id: results[0].id },
      });
      assert.equal(reverse.amount, original.amount);
      assert.equal(reverse.kind, "REVERSAL");
      await assert.rejects(
        reverseExternalPayment(admin.id, {
          ...reversal,
          reference: "second-reversal",
        }),
      );
      await assert.rejects(
        reverseExternalPayment(admin.id, {
          ...reversal,
          recordId: reverse.id,
          reference: "reverse-reversal",
        }),
      );
      const view = await listExternalPayments(member.id, community.id);
      assert.equal(
        view.records.find((record) => record.id === originalId)?.reversedById,
        reverse.id,
      );
      assert.equal(
        view.totals.find((row) => row.kind === "CONTRIBUTION")?.amount,
        "30009",
      );
    },
  );
  await check(
    "SQL guards prohibit rewriting, deleting or cross-scope payment history",
    async () => {
      await assert.rejects(
        db.$executeRaw`UPDATE "ExternalPaymentRecord" SET amount=1 WHERE id=${originalId}::uuid`,
      );
      await assert.rejects(
        db.$executeRaw`DELETE FROM "ExternalPaymentRecord" WHERE id=${originalId}::uuid`,
      );
      await assert.rejects(
        db.externalPaymentRecord.create({
          data: {
            ...input,
            amount: 100n,
            occurredAt: new Date(date),
            recordedById: member.id,
            reference: "sql-forged-staff",
          },
        }),
      );
      await assert.rejects(
        db.externalPaymentRecord.create({
          data: {
            ...input,
            amount: 100n,
            occurredAt: new Date(date),
            recordedById: admin.id,
            roundId: foreignRound.id,
            reference: "sql-foreign-round",
          },
        }),
      );
      await assert.rejects(
        db.externalPaymentRecord.create({
          data: {
            ...input,
            amount: 100n,
            occurredAt: new Date(date),
            recordedById: admin.id,
            counterpartyId: outside.id,
            reference: "sql-foreign-counterparty",
          },
        }),
      );
      await assert.rejects(
        db.externalPaymentRecord.create({
          data: {
            ...input,
            amount: 100n,
            occurredAt: new Date(date),
            recordedById: admin.id,
            currency: "USD",
            reference: "sql-wrong-currency",
          },
        }),
      );
      await assert.rejects(
        db.externalPaymentRecord.create({
          data: {
            ...input,
            amount: -1n,
            occurredAt: new Date(date),
            recordedById: admin.id,
            reference: "sql-negative-amount",
          },
        }),
      );
    },
  );
  await checkInsertionClocks();
  await check(
    "tracking cannot create money, rewrite voting weights or settle historical decisions",
    async () => {
      assert.equal(await db.ledgerTransaction.count(), before.ledger);
      assert.equal(await db.roundLedgerTransaction.count(), before.roundLedger);
      assert.equal(await db.roundContribution.count(), before.contributions);
      assert.equal(await db.roundVotingPower.count(), before.voting);
      assert.deepEqual(
        await db.treasuryAccount.findMany({
          where: { communityId: community.id },
          orderBy: { id: "asc" },
          select: { id: true, balance: true },
        }),
        before.accounts,
      );
      assert.equal(
        (await db.fundingRound.findUniqueOrThrow({ where: { id: round.id } }))
          .rulesVersion,
        1,
      );
      assert.equal(
        await db.roundSettlement.count({ where: { roundId: round.id } }),
        0,
      );
    },
  );
  await check(
    "paginated records are bounded and every page/filter boundary is validated",
    async () => {
      for (const page of [0, -1, 1.5, 100001, Number.NaN, 2])
        await assert.rejects(
          listExternalPayments(admin.id, community.id, page),
        );
      const view = await listExternalPayments(admin.id, community.id);
      assert.ok(view.records.length <= 100);
      assert.equal(view.total, 5);
      assert.equal(view.canManage, true);
      assert.equal(view.pageCount, 1);
    },
  );
  await check(
    "payment APIs enforce session, origin, strict inputs and recent-authentication boundaries",
    async () => {
      const origin = process.env.APP_ORIGIN!;
      const [adminSession, memberSession, outsideSession] = await Promise.all(
        [admin, member, outside].map((person) => createSession(person.id)),
      );
      async function post(
        body: unknown,
        cookie = "",
        expected = 200,
        requestOrigin = origin,
      ) {
        const response = await fetch(origin + "/api/payment-record", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: requestOrigin,
            Cookie: cookie,
          },
          body: JSON.stringify(body),
          redirect: "manual",
        });
        assert.equal(response.status, expected, await response.text());
      }
      const cookies = [adminSession, memberSession, outsideSession].map(
        (session) => `${sessionCookie}=${session.token}`,
      );
      const fresh = { ...input, reference: "http-receipt-001" };
      await post(fresh, "", 401);
      await post(fresh, cookies[0], 403, "https://foreign.invalid");
      await post(fresh, cookies[1], 403);
      await post(fresh, cookies[2], 403);
      await post({ ...fresh, verified: true }, cookies[0], 400);
      await post({ ...fresh, communityId: "' OR 1=1 --" }, cookies[0], 400);
      await post(fresh, cookies[0]);
      await db.session.update({
        where: { tokenHash: hashToken(adminSession.token) },
        data: { reauthenticatedAt: new Date(Date.now() - 6 * 60000) },
      });
      await post(
        { ...fresh, reference: "http-needs-reauthentication" },
        cookies[0],
        428,
      );
    },
  );
  await check(
    "multi-page payment history returns complete nonoverlapping pages and full-cohort totals",
    async () => {
      const before = await listExternalPayments(admin.id, community.id);
      const contributionBefore = BigInt(
        before.totals.find((row) => row.kind === "CONTRIBUTION")?.amount ?? "0",
      );
      await db.externalPaymentRecord.createMany({
        data: Array.from({ length: 101 }, (_, index) => ({
          communityId: community.id,
          recordedById: admin.id,
          kind: "CONTRIBUTION",
          amount: 1n,
          currency: "BDT",
          reference: `pagination-fixture-${index}`,
          note: "Isolated pagination fixture.",
          occurredAt: new Date(date),
        })),
      });
      const first = await listExternalPayments(member.id, community.id, 1);
      const second = await listExternalPayments(member.id, community.id, 2);
      assert.equal(first.records.length, 100);
      assert.equal(second.records.length, before.total + 1);
      assert.equal(first.total, before.total + 101);
      assert.equal(first.pageCount, 2);
      assert.equal(
        new Set([...first.records, ...second.records].map((row) => row.id))
          .size,
        first.total,
      );
      assert.equal(
        BigInt(first.totals.find((row) => row.kind === "CONTRIBUTION")!.amount),
        contributionBefore + 101n,
      );
      assert.deepEqual(first.totals, second.totals);
    },
  );
  await check(
    "payment CSV rejects unauthorized and ambiguous filters and exports only the exact private page with spreadsheet-safe attestations",
    async () => {
      const origin = process.env.APP_ORIGIN!;
      const exportPath = `${origin}/api/payments/export`;
      const query = `communityId=${community.id}`;
      assert.equal(
        (await fetch(`${exportPath}?${query}`, { redirect: "manual" })).status,
        401,
      );
      const [memberSession, outsideSession] = await Promise.all(
        [member, outside].map((person) => createSession(person.id)),
      );
      const memberCookie = `${sessionCookie}=${memberSession.token}`;
      const outsideCookie = `${sessionCookie}=${outsideSession.token}`;
      assert.equal(
        (
          await fetch(`${exportPath}?${query}`, {
            headers: { Cookie: outsideCookie },
          })
        ).status,
        403,
      );
      for (const filter of [
        `${query}&communityId=${community.id}`,
        `${query}&unknown=1`,
        "communityId=not-a-uuid",
        `${query}&page=0`,
        `${query}&page=not-a-number`,
        `${query}&page=1&page=2`,
      ]) {
        const response = await fetch(`${exportPath}?${filter}`, {
          headers: { Cookie: memberCookie },
        });
        assert.equal(response.status, 400, await response.text());
        assert.ok(response.headers.get("cache-control")?.includes("no-store"));
        assert.ok(
          response.headers
            .get("vary")
            ?.split(",")
            .some((value) => value.trim().toLowerCase() === "cookie"),
        );
      }
      await recordExternalPayment(admin.id, {
        ...input,
        reference: '=HYPERLINK("https://example.com")',
        note: "+SUM(1,2)",
      });
      const [first, second] = await Promise.all([
        listExternalPayments(member.id, community.id, 1),
        listExternalPayments(member.id, community.id, 2),
      ]);
      for (const view of [first, second]) {
        const response = await fetch(
          `${exportPath}?${query}&page=${view.page}`,
          { headers: { Cookie: memberCookie } },
        );
        assert.equal(response.status, 200);
        assert.ok(response.headers.get("cache-control")?.includes("private"));
        assert.ok(response.headers.get("cache-control")?.includes("no-store"));
        assert.ok(
          response.headers
            .get("vary")
            ?.split(",")
            .some((value) => value.trim().toLowerCase() === "cookie"),
        );
        assert.ok(response.headers.get("content-type")?.startsWith("text/csv"));
        assert.equal(
          response.headers.get("x-record-count"),
          String(view.records.length),
        );
        assert.equal(
          response.headers.get("x-total-record-count"),
          String(view.total),
        );
        const csv = await response.text();
        assert.equal(csv.split("\r\n").length, view.records.length + 1);
        for (const row of view.records) assert.ok(csv.includes(`"${row.id}",`));
        const other = view.page === 1 ? second : first;
        for (const row of other.records)
          assert.equal(csv.includes(`"${row.id}",`), false);
        assert.equal(
          (csv.match(/"STAFF_RECORDED_UNVERIFIED"/g) ?? []).length,
          view.records.length,
        );
        if (view.page === 1) {
          assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
          assert.ok(csv.includes('"\'+SUM(1,2)"'));
          assert.equal(csv.includes('\",\"=HYPERLINK'), false);
        }
      }
    },
  );
  await runPaymentRecordsBrowserChecks(check);
  console.log(`External payment-record integrity: ${checks} checks passed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
