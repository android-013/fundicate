import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { fundicateDb?: PrismaClient };
export const db =
  globalDb.fundicateDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    }),
  });
if (process.env.NODE_ENV !== "production") globalDb.fundicateDb = db;
