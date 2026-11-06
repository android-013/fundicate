-- DropForeignKey

-- AlterTable
ALTER TABLE "FundingRound" ADD COLUMN     "templateRevisionId" UUID;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "reauthenticatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RoundTemplate" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundTemplateRevision" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "network" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WalletLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainVault" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'testnet',
    "provider" TEXT NOT NULL DEFAULT 'near-testnet',
    "assetId" TEXT NOT NULL DEFAULT 'near:testnet:NEAR',
    "decimals" INTEGER NOT NULL DEFAULT 24,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rulesVersion" INTEGER NOT NULL DEFAULT 1,
    "rulesSnapshot" JSONB NOT NULL,
    "collectionClosesAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "vetoEnabled" BOOLEAN NOT NULL,
    "allocationHash" TEXT,
    "plan" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainVault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainOperation" (
    "id" UUID NOT NULL,
    "vaultId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "recipient" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "attachedDeposit" DECIMAL(78,0) NOT NULL,
    "expectedSigner" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "transactionHash" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainObservation" (
    "id" UUID NOT NULL,
    "vaultId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "finality" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "receiptIds" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundTemplate_communityId_createdAt_idx" ON "RoundTemplate"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoundTemplateRevision_templateId_number_key" ON "RoundTemplateRevision"("templateId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "WalletChallenge_nonce_key" ON "WalletChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletChallenge_userId_expiresAt_idx" ON "WalletChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "WalletLink_userId_revokedAt_idx" ON "WalletLink"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLink_network_accountId_key" ON "WalletLink"("network", "accountId");

-- CreateIndex
CREATE INDEX "ChainVault_communityId_createdAt_idx" ON "ChainVault"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChainOperation_operationKey_key" ON "ChainOperation"("operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChainOperation_transactionHash_key" ON "ChainOperation"("transactionHash");

-- CreateIndex
CREATE INDEX "ChainOperation_vaultId_status_idx" ON "ChainOperation"("vaultId", "status");

-- CreateIndex
CREATE INDEX "ChainObservation_vaultId_observedAt_idx" ON "ChainObservation"("vaultId", "observedAt");

-- AddForeignKey
ALTER TABLE "RoundTemplate" ADD CONSTRAINT "RoundTemplate_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTemplate" ADD CONSTRAINT "RoundTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundTemplateRevision" ADD CONSTRAINT "RoundTemplateRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RoundTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletChallenge" ADD CONSTRAINT "WalletChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLink" ADD CONSTRAINT "WalletLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainVault" ADD CONSTRAINT "ChainVault_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainVault" ADD CONSTRAINT "ChainVault_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainVault" ADD CONSTRAINT "ChainVault_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainOperation" ADD CONSTRAINT "ChainOperation_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "ChainVault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainOperation" ADD CONSTRAINT "ChainOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainObservation" ADD CONSTRAINT "ChainObservation_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "ChainVault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainObservation" ADD CONSTRAINT "ChainObservation_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ChainOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRound" ADD CONSTRAINT "FundingRound_templateRevisionId_fkey" FOREIGN KEY ("templateRevisionId") REFERENCES "RoundTemplateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION portable_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable history cannot be changed'; END $$;
CREATE TRIGGER immutable_template_revision BEFORE UPDATE OR DELETE ON "RoundTemplateRevision" FOR EACH ROW EXECUTE FUNCTION portable_append_only();
CREATE TRIGGER immutable_chain_observation BEFORE UPDATE OR DELETE ON "ChainObservation" FOR EACH ROW EXECUTE FUNCTION portable_append_only();
CREATE FUNCTION portable_template_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest integer;
BEGIN
  PERFORM 1 FROM "RoundTemplate" WHERE id=NEW."templateId" FOR UPDATE;
  SELECT COALESCE(MAX(number),0) INTO latest FROM "RoundTemplateRevision" WHERE "templateId"=NEW."templateId";
  IF NEW.number<>latest+1 OR jsonb_typeof(NEW.rules)<>'object' THEN RAISE EXCEPTION 'Invalid template revision sequence'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_revision_sequence BEFORE INSERT ON "RoundTemplateRevision" FOR EACH ROW EXECUTE FUNCTION portable_template_guard();
CREATE FUNCTION portable_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='RoundTemplate' THEN
    IF TG_OP='DELETE' OR (NEW.id,NEW."communityId",NEW."authorId",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."communityId",OLD."authorId",OLD."createdAt") THEN RAISE EXCEPTION 'Template ownership is immutable'; END IF;
  ELSIF TG_TABLE_NAME='WalletChallenge' THEN
    IF TG_OP='DELETE' OR (to_jsonb(NEW)-'consumedAt') IS DISTINCT FROM (to_jsonb(OLD)-'consumedAt') OR OLD."consumedAt" IS NOT NULL OR NEW."consumedAt" IS NULL THEN RAISE EXCEPTION 'Wallet challenges are single use'; END IF;
  ELSIF TG_TABLE_NAME='WalletLink' THEN
    IF TG_OP='DELETE' OR (NEW.id,NEW."userId",NEW.network,NEW."accountId") IS DISTINCT FROM (OLD.id,OLD."userId",OLD.network,OLD."accountId") THEN RAISE EXCEPTION 'Wallet ownership is immutable'; END IF;
  ELSIF TG_TABLE_NAME='ChainVault' THEN
    IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['allocationHash','plan','publishedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['allocationHash','plan','publishedAt']) OR OLD.plan IS NOT NULL THEN RAISE EXCEPTION 'Published native custody rules are immutable'; END IF;
  ELSIF TG_TABLE_NAME='ChainOperation' THEN
    IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','transactionHash','submittedAt','confirmedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','transactionHash','submittedAt','confirmedAt']) THEN RAISE EXCEPTION 'Native operation intent is immutable'; END IF;
    IF OLD.status='CONFIRMED' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Confirmed native operation is immutable'; END IF;
    IF OLD."transactionHash" IS NOT NULL AND NEW."transactionHash" IS DISTINCT FROM OLD."transactionHash" THEN RAISE EXCEPTION 'Reconcile existing transaction before any replacement'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER template_scope BEFORE UPDATE OR DELETE ON "RoundTemplate" FOR EACH ROW EXECUTE FUNCTION portable_scope_guard();
CREATE TRIGGER challenge_once BEFORE UPDATE OR DELETE ON "WalletChallenge" FOR EACH ROW EXECUTE FUNCTION portable_scope_guard();
CREATE TRIGGER wallet_owner BEFORE UPDATE OR DELETE ON "WalletLink" FOR EACH ROW EXECUTE FUNCTION portable_scope_guard();
CREATE TRIGGER native_vault_snapshot BEFORE UPDATE OR DELETE ON "ChainVault" FOR EACH ROW EXECUTE FUNCTION portable_scope_guard();
CREATE TRIGGER native_operation_intent BEFORE UPDATE OR DELETE ON "ChainOperation" FOR EACH ROW EXECUTE FUNCTION portable_scope_guard();
ALTER TABLE "WalletChallenge" ADD CONSTRAINT wallet_challenge_testnet CHECK (network='testnet' AND "expiresAt">"createdAt");
ALTER TABLE "WalletLink" ADD CONSTRAINT wallet_link_testnet CHECK (network='testnet');
ALTER TABLE "ChainVault" ADD CONSTRAINT native_asset_scope CHECK (network='testnet' AND provider='near-testnet' AND "assetId"='near:testnet:NEAR' AND decimals=24 AND "rulesVersion"=1 AND "expiresAt">"collectionClosesAt");
ALTER TABLE "ChainOperation" ADD CONSTRAINT native_amount CHECK (amount>=0 AND "attachedDeposit">=0 AND status IN ('PREPARED','SUBMITTED','CONFIRMED','FAILED','UNKNOWN'));
CREATE FUNCTION portable_native_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='ChainVault' THEN
    IF NOT EXISTS (SELECT 1 FROM "FundingRound" r JOIN "RoundDecision" d ON d."roundId"=r.id WHERE r.id=NEW."roundId" AND r."communityId"=NEW."communityId" AND r."rulesVersion"=4 AND r.status='DECIDED' AND d."vetoFinalizedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Native pool requires a final scoped V4 decision'; END IF;
  ELSIF TG_TABLE_NAME='ChainObservation' THEN
    IF NOT EXISTS (SELECT 1 FROM "ChainOperation" o WHERE o.id=NEW."operationId" AND o."vaultId"=NEW."vaultId" AND o."transactionHash"=NEW."transactionHash") THEN RAISE EXCEPTION 'Observation does not match its immutable operation'; END IF;
  ELSIF TG_TABLE_NAME='FundingRound' AND NEW."templateRevisionId" IS NOT NULL THEN
    IF TG_OP='UPDATE' AND NEW."templateRevisionId" IS DISTINCT FROM OLD."templateRevisionId" THEN RAISE EXCEPTION 'Template provenance is immutable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "RoundTemplateRevision" v JOIN "RoundTemplate" t ON t.id=v."templateId" WHERE v.id=NEW."templateRevisionId" AND t."communityId"=NEW."communityId") THEN RAISE EXCEPTION 'Template crosses community scope'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER native_pool_scope BEFORE INSERT ON "ChainVault" FOR EACH ROW EXECUTE FUNCTION portable_native_scope();
CREATE TRIGGER native_observation_scope BEFORE INSERT ON "ChainObservation" FOR EACH ROW EXECUTE FUNCTION portable_native_scope();
CREATE TRIGGER round_template_scope BEFORE INSERT OR UPDATE ON "FundingRound" FOR EACH ROW EXECUTE FUNCTION portable_native_scope();
