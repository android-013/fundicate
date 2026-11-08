import { db } from "./db";
// Checked migration and relations, rather than mere PostgreSQL reachability.
export async function databaseReady() {
  const rows = await db.$queryRaw<
    { ready: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261107010000_standalone_payments' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ready`;
  if (!rows[0]?.ready) throw new Error("Database migrations are incomplete.");
  await db.$queryRaw`SELECT id,"rulesVersion","templateRevisionId" FROM "FundingRound" LIMIT 0`;
  await db.$queryRaw`SELECT id,"reauthenticatedAt" FROM "Session" LIMIT 0`;
  await db.$queryRaw`SELECT id,"reference" FROM "ExternalPaymentRecord" LIMIT 0`;
}
