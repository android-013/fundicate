import { db } from "../src/lib/db";
import { processRoundSettlement } from "../src/lib/funded-rounds";

if (!new URL(process.env.DATABASE_URL!).pathname.startsWith("/fundicate_test_"))
  throw new Error("The recovery worker requires an isolated test database.");
const [userId, communityId, roundId, timestamp] = process.argv.slice(2);
try {
  await processRoundSettlement(
    userId,
    { communityId, roundId },
    new Date(timestamp),
    1,
  );
} finally {
  await db.$disconnect();
}
