-- Preserve existing accounts; wallet-only identities have no fabricated email/password.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "WalletChallenge" ALTER COLUMN "userId" DROP NOT NULL;
