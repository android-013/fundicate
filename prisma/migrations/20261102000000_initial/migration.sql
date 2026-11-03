-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED', 'LEFT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('FUNDING', 'FUNDRAISING', 'ADMISSION', 'REMOVAL', 'GOVERNANCE', 'SUSPENSION_REVIEW');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('YES', 'NO', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "adminId" UUID NOT NULL,
    "minimumContribution" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernancePolicy" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "quorumBps" INTEGER NOT NULL DEFAULT 5000,
    "thresholdBps" INTEGER NOT NULL DEFAULT 5001,
    "admissionPolicy" TEXT NOT NULL DEFAULT 'VOTE',
    "allowMemberProposals" BOOLEAN NOT NULL DEFAULT true,
    "votingDays" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMembership" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspensionReason" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipQuestion" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,

    CONSTRAINT "MembershipQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipApplication" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "introduction" TEXT NOT NULL,
    "proposedContribution" BIGINT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipApplicationAnswer" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "MembershipApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "proposerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "recipient" TEXT,
    "supportingUrl" TEXT,
    "targetUserId" UUID,
    "applicationId" UUID,
    "quorumBps" INTEGER NOT NULL,
    "thresholdBps" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "governanceChange" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibleVoter" (
    "proposalId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "EligibleVoter_pkey" PRIMARY KEY ("proposalId","userId")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryAccount" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "initiatedById" UUID NOT NULL,
    "proposalId" UUID,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "idempotencyKey" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "network" TEXT NOT NULL DEFAULT 'local-simulation',
    "sourceAccount" UUID NOT NULL,
    "destinationAccount" UUID NOT NULL,
    "externalReference" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingExecution" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "network" TEXT NOT NULL DEFAULT 'local-simulation',
    "accountId" TEXT,
    "transactionHash" TEXT,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "FundingExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE INDEX "Community_createdAt_idx" ON "Community"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GovernancePolicy_communityId_key" ON "GovernancePolicy"("communityId");

-- CreateIndex
CREATE INDEX "CommunityMembership_userId_status_idx" ON "CommunityMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMembership_communityId_userId_key" ON "CommunityMembership"("communityId", "userId");

-- CreateIndex
CREATE INDEX "MembershipApplication_communityId_status_idx" ON "MembershipApplication"("communityId", "status");

-- CreateIndex
CREATE INDEX "MembershipApplication_userId_idx" ON "MembershipApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipApplicationAnswer_applicationId_questionId_key" ON "MembershipApplicationAnswer"("applicationId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_applicationId_key" ON "Proposal"("applicationId");

-- CreateIndex
CREATE INDEX "Proposal_communityId_status_closesAt_idx" ON "Proposal"("communityId", "status", "closesAt");

-- CreateIndex
CREATE INDEX "EligibleVoter_userId_idx" ON "EligibleVoter"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_proposalId_userId_key" ON "Vote"("proposalId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryAccount_communityId_kind_key" ON "TreasuryAccount"("communityId", "kind");

-- CreateIndex
CREATE INDEX "LedgerTransaction_communityId_createdAt_idx" ON "LedgerTransaction"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_communityId_idempotencyKey_key" ON "LedgerTransaction"("communityId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingExecution_proposalId_key" ON "FundingExecution"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingExecution_transactionId_key" ON "FundingExecution"("transactionId");

-- CreateIndex
CREATE INDEX "AuditEvent_communityId_createdAt_idx" ON "AuditEvent"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernancePolicy" ADD CONSTRAINT "GovernancePolicy_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMembership" ADD CONSTRAINT "CommunityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipQuestion" ADD CONSTRAINT "MembershipQuestion_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplicationAnswer" ADD CONSTRAINT "MembershipApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MembershipApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplicationAnswer" ADD CONSTRAINT "MembershipApplicationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MembershipQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "MembershipApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibleVoter" ADD CONSTRAINT "EligibleVoter_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibleVoter" ADD CONSTRAINT "EligibleVoter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_proposalId_userId_fkey" FOREIGN KEY ("proposalId", "userId") REFERENCES "EligibleVoter"("proposalId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT "TreasuryAccount_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_sourceAccount_fkey" FOREIGN KEY ("sourceAccount") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_destinationAccount_fkey" FOREIGN KEY ("destinationAccount") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingExecution" ADD CONSTRAINT "FundingExecution_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingExecution" ADD CONSTRAINT "FundingExecution_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Append-only records are enforced in PostgreSQL, including writes outside Prisma.
CREATE FUNCTION fundicate_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Fundicate: posted history is immutable'; END; $$;
CREATE TRIGGER immutable_votes BEFORE UPDATE OR DELETE ON "Vote" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_eligibility BEFORE UPDATE OR DELETE ON "EligibleVoter" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_transactions BEFORE UPDATE OR DELETE ON "LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_execution BEFORE UPDATE OR DELETE ON "FundingExecution" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT treasury_nonnegative CHECK ("kind" <> 'TREASURY' OR "balance" >= 0);
ALTER TABLE "TreasuryAccount" ADD CONSTRAINT valid_account_kind CHECK ("kind" IN ('TREASURY','EXTERNAL','PAID'));
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT positive_transaction CHECK ("amount" > 0 AND "sourceAccount" <> "destinationAccount");
ALTER TABLE "LedgerEntry" ADD CONSTRAINT nonzero_entry CHECK ("amount" <> 0);
ALTER TABLE "Proposal" ADD CONSTRAINT valid_ballot_rules CHECK ("closesAt" > "opensAt" AND "quorumBps" BETWEEN 1 AND 10000 AND "thresholdBps" BETWEEN 5001 AND 10000 AND "amount" >= 0);
ALTER TABLE "GovernancePolicy" ADD CONSTRAINT valid_policy CHECK ("quorumBps" BETWEEN 1 AND 10000 AND "thresholdBps" BETWEEN 5001 AND 10000 AND "admissionPolicy" IN ('VOTE','REVIEW') AND "votingDays" BETWEEN 1 AND 90);
CREATE UNIQUE INDEX one_pending_application ON "MembershipApplication" ("communityId","userId") WHERE status='PENDING';

CREATE FUNCTION fundicate_check_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; tx "LedgerTransaction"%ROWTYPE; entry_count int; entry_sum bigint;
BEGIN
  IF TG_TABLE_NAME='LedgerTransaction' THEN tid := NEW.id; ELSE tid := NEW."transactionId"; END IF;
  SELECT * INTO tx FROM "LedgerTransaction" WHERE id=tid;
  SELECT COUNT(*), COALESCE(SUM(amount),0) INTO entry_count, entry_sum FROM "LedgerEntry" WHERE "transactionId"=tid;
  IF entry_count <> 2 OR entry_sum <> 0 THEN RAISE EXCEPTION 'Fundicate: a transaction must have two balanced entries'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "LedgerEntry" e JOIN "TreasuryAccount" a ON a.id=e."accountId" WHERE e."transactionId"=tid AND e."accountId"=tx."sourceAccount" AND e.amount=-tx.amount AND a."communityId"=tx."communityId")
    OR NOT EXISTS (SELECT 1 FROM "LedgerEntry" e JOIN "TreasuryAccount" a ON a.id=e."accountId" WHERE e."transactionId"=tid AND e."accountId"=tx."destinationAccount" AND e.amount=tx.amount AND a."communityId"=tx."communityId")
    OR tx.currency <> (SELECT currency FROM "Community" WHERE id=tx."communityId") THEN
    RAISE EXCEPTION 'Fundicate: ledger source, destination, currency or amount mismatch';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER balanced_transaction AFTER INSERT ON "LedgerTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_ledger();
CREATE CONSTRAINT TRIGGER balanced_entries AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_ledger();

CREATE FUNCTION fundicate_check_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aid uuid; expected bigint; actual bigint;
BEGIN
  IF TG_TABLE_NAME='TreasuryAccount' THEN aid:=NEW.id; ELSE aid:=NEW."accountId"; END IF;
  SELECT COALESCE(SUM(amount),0) INTO expected FROM "LedgerEntry" WHERE "accountId"=aid;
  SELECT balance INTO actual FROM "TreasuryAccount" WHERE id=aid;
  IF actual <> expected THEN RAISE EXCEPTION 'Fundicate: account balance must equal posted ledger entries'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER account_balance_integrity AFTER INSERT OR UPDATE ON "TreasuryAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_balance();
CREATE CONSTRAINT TRIGGER entry_balance_integrity AFTER INSERT ON "LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_balance();

CREATE FUNCTION fundicate_check_administrator() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  IF TG_TABLE_NAME='Community' THEN cid:=NEW.id; ELSE cid:=NEW."communityId"; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Community" c JOIN "CommunityMembership" m ON m."communityId"=c.id AND m."userId"=c."adminId" WHERE c.id=cid AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Fundicate: the sole administrator must be an active member';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER community_administrator AFTER INSERT OR UPDATE ON "Community" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_administrator();
CREATE CONSTRAINT TRIGGER membership_administrator AFTER INSERT OR UPDATE ON "CommunityMembership" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_administrator();
