-- This file is copied verbatim into the additive funded-round migration.
ALTER TABLE "Community" ADD CONSTRAINT governance_profile_valid CHECK ("governanceProfile" IN ('LEGACY','STRICT'));
ALTER TABLE "CommunityMembership" ADD CONSTRAINT declaration_pair CHECK (("declaredContribution" IS NULL AND "declaredAt" IS NULL) OR ("declaredContribution" IS NOT NULL AND "declaredContribution" >= 0 AND "declaredAt" IS NOT NULL));
CREATE UNIQUE INDEX one_open_strict_succession ON "Proposal" ("communityId") WHERE "status"='OPEN' AND "type"='REMOVAL' AND "governanceProfile"='STRICT' AND "successorId" IS NOT NULL;
CREATE FUNCTION fundicate_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Community' THEN
    IF NEW."governanceProfile" IS DISTINCT FROM OLD."governanceProfile" THEN RAISE EXCEPTION 'Governance profile is immutable'; END IF;
  ELSE
    IF TG_OP='UPDATE' AND OLD."declaredContribution" IS NOT NULL AND (NEW."declaredContribution",NEW."declaredAt") IS DISTINCT FROM (OLD."declaredContribution",OLD."declaredAt") THEN RAISE EXCEPTION 'Contribution declaration is immutable'; END IF;
    IF NEW.status='ACTIVE' AND (TG_OP='INSERT' OR OLD.status<>'ACTIVE') AND EXISTS(SELECT 1 FROM "Community" c WHERE c.id=NEW."communityId" AND c."governanceProfile"='STRICT' AND (NEW."declaredContribution" IS NULL OR NEW."declaredContribution"<c."minimumContribution")) THEN RAISE EXCEPTION 'Strict members must declare the required contribution'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER immutable_community_profile BEFORE UPDATE ON "Community" FOR EACH ROW EXECUTE FUNCTION fundicate_profile_guard();
CREATE TRIGGER membership_declaration_guard BEFORE INSERT OR UPDATE ON "CommunityMembership" FOR EACH ROW EXECUTE FUNCTION fundicate_profile_guard();

CREATE FUNCTION fundicate_proposal_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."governanceProfile" IS DISTINCT FROM OLD."governanceProfile" OR (OLD.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['status','finalizedAt','cancellationReason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finalizedAt','cancellationReason'])) THEN RAISE EXCEPTION 'Published proposal rules and successor are immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER immutable_proposal_snapshot BEFORE UPDATE ON "Proposal" FOR EACH ROW EXECUTE FUNCTION fundicate_proposal_snapshot_guard();

ALTER TABLE "FundingRound" DROP CONSTRAINT round_rules;
ALTER TABLE "FundingRound" ADD CONSTRAINT round_rules CHECK ("proposalPolicy" IN ('STAFF','MEMBERS','EVERYONE') AND "quorumBps" BETWEEN 1 AND 10000 AND "rulesVersion" IN (1,2));
ALTER TABLE "FundingScheme" ADD CONSTRAINT scheme_category CHECK (category IN ('UNSPECIFIED','DONATION','CROWDFUNDING','INVESTMENT_REQUEST'));
CREATE FUNCTION fundicate_round_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."rulesVersion"<>OLD."rulesVersion" THEN RAISE EXCEPTION 'Round version is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER immutable_round_version BEFORE UPDATE ON "FundingRound" FOR EACH ROW EXECUTE FUNCTION fundicate_round_version_guard();
CREATE FUNCTION fundicate_check_round_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; v int; s int;
BEGIN
  IF TG_TABLE_NAME='FundingRound' THEN rid:=NEW.id; ELSE rid:=NEW."roundId"; END IF;
  SELECT "rulesVersion" INTO v FROM "FundingRound" WHERE id=rid;
  SELECT "rulesVersion" INTO s FROM "RoundSettlement" WHERE "roundId"=rid;
  IF (v=2 AND s IS DISTINCT FROM 2) OR (v=1 AND s IS NOT NULL) THEN RAISE EXCEPTION 'Only funded V2 rounds have a settlement'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER round_version_integrity AFTER INSERT ON "FundingRound" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_round_version();
CREATE CONSTRAINT TRIGGER settlement_version_integrity AFTER INSERT ON "RoundSettlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_round_version();

ALTER TABLE "RoundSettlement" ADD CONSTRAINT settlement_bounds CHECK ("rulesVersion"=2 AND network='local-simulation' AND decimals=2 AND currency IN ('USD','BDT','EUR') AND "assetId"='fiat:'||currency AND "fundingTarget">0 AND "minimumContribution">0 AND "maximumContribution">="minimumContribution" AND received>=0 AND paid>=0 AND refunded>=0 AND status IN ('DRAFT','COLLECTING','HELD','QUEUED','SETTLED','REFUNDED'));
ALTER TABLE "RoundAccount" ADD CONSTRAINT round_account_shape CHECK (("key" IN ('HELD','RESERVED','PAID') AND "ownerId" IS NULL AND balance>=0) OR ("key"='EXTERNAL:'||"ownerId"::text AND "ownerId" IS NOT NULL));
ALTER TABLE "RoundLedgerTransaction" ADD CONSTRAINT round_transaction_shape CHECK (amount>0 AND "sourceAccountId"<>"destinationAccountId" AND kind IN ('CONTRIBUTION','RESERVE','PAYOUT','REFUND'));
ALTER TABLE "RoundLedgerEntry" ADD CONSTRAINT round_entry_nonzero CHECK (amount<>0);
ALTER TABLE "RoundContribution" ADD CONSTRAINT round_contribution_positive CHECK (amount>0);
ALTER TABLE "RoundOperation" ADD CONSTRAINT round_operation_shape CHECK (amount>0 AND kind IN ('PAYOUT','REFUND') AND status IN ('PENDING','CONFIRMED','FAILED') AND attempts>=0 AND length(trim(recipient))>0 AND ((status='CONFIRMED' AND "transactionId" IS NOT NULL AND "completedAt" IS NOT NULL) OR (status<>'CONFIRMED' AND "transactionId" IS NULL AND "completedAt" IS NULL)));
ALTER TABLE "RoundExecutionAttempt" ADD CONSTRAINT round_attempt_shape CHECK (attempt>0 AND status IN ('CONFIRMED','FAILED'));
CREATE TRIGGER immutable_round_transactions BEFORE UPDATE OR DELETE ON "RoundLedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_round_entries BEFORE UPDATE OR DELETE ON "RoundLedgerEntry" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_round_contributions BEFORE UPDATE OR DELETE ON "RoundContribution" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_round_attempts BEFORE UPDATE OR DELETE ON "RoundExecutionAttempt" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();

CREATE FUNCTION fundicate_funds_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Round financial history cannot be deleted'; END IF;
  IF TG_TABLE_NAME='RoundAccount' AND (to_jsonb(NEW)-'balance') IS DISTINCT FROM (to_jsonb(OLD)-'balance') THEN RAISE EXCEPTION 'Round account identity is immutable'; END IF;
  IF TG_TABLE_NAME='RoundSettlement' THEN
    IF (to_jsonb(NEW)-ARRAY['status','contributionSnapshot','frozenAt','received','paid','refunded','allocationSnapshot','preparedAt','settledAt','reason','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','contributionSnapshot','frozenAt','received','paid','refunded','allocationSnapshot','preparedAt','settledAt','reason','updatedAt']) THEN RAISE EXCEPTION 'Funded rules are immutable'; END IF;
    IF OLD."frozenAt" IS NOT NULL AND (NEW."frozenAt",NEW."contributionSnapshot") IS DISTINCT FROM (OLD."frozenAt",OLD."contributionSnapshot") THEN RAISE EXCEPTION 'Contributor snapshot is immutable'; END IF;
    IF OLD."preparedAt" IS NOT NULL AND (NEW."preparedAt",NEW."allocationSnapshot",NEW.reason) IS DISTINCT FROM (OLD."preparedAt",OLD."allocationSnapshot",OLD.reason) THEN RAISE EXCEPTION 'Settlement plan is immutable'; END IF;
    IF OLD.status IN ('SETTLED','REFUNDED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Final settlement is immutable'; END IF;
  END IF;
  IF TG_TABLE_NAME='RoundOperation' THEN
    IF OLD.status='CONFIRMED' OR (to_jsonb(NEW)-ARRAY['status','attempts','lastError','transactionId','updatedAt','completedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','attempts','lastError','transactionId','updatedAt','completedAt']) THEN RAISE EXCEPTION 'Execution intent is immutable'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER round_account_identity BEFORE UPDATE OR DELETE ON "RoundAccount" FOR EACH ROW EXECUTE FUNCTION fundicate_funds_identity_guard();
CREATE TRIGGER round_settlement_identity BEFORE UPDATE OR DELETE ON "RoundSettlement" FOR EACH ROW EXECUTE FUNCTION fundicate_funds_identity_guard();
CREATE TRIGGER round_operation_identity BEFORE UPDATE OR DELETE ON "RoundOperation" FOR EACH ROW EXECUTE FUNCTION fundicate_funds_identity_guard();

CREATE FUNCTION fundicate_round_post_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "RoundSettlement"%ROWTYPE; a "RoundAccount"%ROWTYPE; b "RoundAccount"%ROWTYPE;
BEGIN
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF TG_TABLE_NAME='RoundOperation' THEN
    IF s.status<>'HELD' THEN RAISE EXCEPTION 'Operations are sealed when the plan is queued'; END IF;
  ELSE
    SELECT * INTO a FROM "RoundAccount" WHERE id=NEW."sourceAccountId";
    SELECT * INTO b FROM "RoundAccount" WHERE id=NEW."destinationAccountId";
    IF a."roundId"<>NEW."roundId" OR b."roundId"<>NEW."roundId" OR NEW."assetId"<>s."assetId" THEN RAISE EXCEPTION 'Cross-round or asset ledger posting'; END IF;
    IF (NEW.kind='CONTRIBUTION' AND (s.status<>'COLLECTING' OR NEW."createdAt">=s."collectionClosesAt" OR a."ownerId" IS DISTINCT FROM NEW."initiatedById" OR b.key<>'HELD' OR a.key NOT LIKE 'EXTERNAL:%')) OR
      (NEW.kind='RESERVE' AND (s.status<>'HELD' OR a.key<>'HELD' OR b.key<>'RESERVED')) OR
      (NEW.kind='PAYOUT' AND (s.status<>'QUEUED' OR a.key<>'RESERVED' OR b.key<>'PAID')) OR
      (NEW.kind='REFUND' AND (s.status<>'QUEUED' OR a.key<>'RESERVED' OR b.key NOT LIKE 'EXTERNAL:%')) THEN RAISE EXCEPTION 'Invalid round posting gate or account route'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER round_post_guard BEFORE INSERT ON "RoundLedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_round_post_guard();
CREATE TRIGGER round_plan_gate BEFORE INSERT ON "RoundOperation" FOR EACH ROW EXECUTE FUNCTION fundicate_round_post_guard();

CREATE FUNCTION fundicate_round_ledger_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t "RoundLedgerTransaction"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='RoundLedgerTransaction' THEN tid:=NEW.id; ELSE tid:=NEW."transactionId"; END IF;
  SELECT * INTO t FROM "RoundLedgerTransaction" WHERE id=tid;
  IF (SELECT count(*) FROM "RoundLedgerEntry" WHERE "transactionId"=tid)<>2 OR NOT EXISTS(SELECT 1 FROM "RoundLedgerEntry" WHERE "transactionId"=tid AND "accountId"=t."sourceAccountId" AND amount=-t.amount) OR NOT EXISTS(SELECT 1 FROM "RoundLedgerEntry" WHERE "transactionId"=tid AND "accountId"=t."destinationAccountId" AND amount=t.amount) THEN RAISE EXCEPTION 'Round transaction requires two balanced scoped entries'; END IF;
  IF t.kind='CONTRIBUTION' AND NOT EXISTS(SELECT 1 FROM "RoundContribution" c JOIN "RoundAccount" a ON a.id=c."sourceAccountId" WHERE c."transactionId"=tid AND c."roundId"=t."roundId" AND c.amount=t.amount AND c."sourceAccountId"=t."sourceAccountId" AND c."userId"=a."ownerId" AND c."userId"=t."initiatedById") THEN RAISE EXCEPTION 'Missing attributable contribution receipt'; END IF;
  IF t.kind IN ('PAYOUT','REFUND') AND NOT EXISTS(SELECT 1 FROM "RoundOperation" o WHERE o."transactionId"=tid AND o.status='CONFIRMED' AND o."roundId"=t."roundId" AND o.kind=t.kind AND o.amount=t.amount AND o."sourceAccountId"=t."sourceAccountId" AND o."destinationAccountId"=t."destinationAccountId" AND t."operationKey"='execute:'||o.id::text) THEN RAISE EXCEPTION 'Posting requires its immutable execution intent'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER round_ledger_integrity AFTER INSERT ON "RoundLedgerTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_ledger_check();
CREATE CONSTRAINT TRIGGER round_entry_integrity AFTER INSERT ON "RoundLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_ledger_check();
CREATE CONSTRAINT TRIGGER round_contribution_integrity AFTER INSERT ON "RoundContribution" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_ledger_check();

CREATE FUNCTION fundicate_round_balance_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; s "RoundSettlement"%ROWTYPE; held bigint; reserved bigint; paid bigint; received bigint; refunded bigint;
BEGIN
  IF TG_TABLE_NAME='RoundLedgerEntry' THEN SELECT "roundId" INTO rid FROM "RoundAccount" WHERE id=NEW."accountId";
  ELSIF TG_TABLE_NAME='RoundExecutionAttempt' THEN SELECT "roundId" INTO rid FROM "RoundOperation" WHERE id=NEW."operationId";
  ELSE rid:=NEW."roundId"; END IF;
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=rid;
  IF EXISTS(SELECT 1 FROM "RoundAccount" a WHERE a."roundId"=rid AND a.balance<>COALESCE((SELECT sum(e.amount) FROM "RoundLedgerEntry" e WHERE e."accountId"=a.id),0)) THEN RAISE EXCEPTION 'Round balances must match posted entries'; END IF;
  SELECT COALESCE(sum(amount) FILTER(WHERE kind='CONTRIBUTION'),0),COALESCE(sum(amount) FILTER(WHERE kind='PAYOUT'),0),COALESCE(sum(amount) FILTER(WHERE kind='REFUND'),0) INTO received,paid,refunded FROM "RoundLedgerTransaction" WHERE "roundId"=rid;
  SELECT COALESCE(sum(balance) FILTER(WHERE key='HELD'),0),COALESCE(sum(balance) FILTER(WHERE key='RESERVED'),0) INTO held,reserved FROM "RoundAccount" WHERE "roundId"=rid;
  IF (s.received,s.paid,s.refunded) IS DISTINCT FROM (received,paid,refunded) OR received<>held+reserved+paid+refunded OR reserved<>COALESCE((SELECT sum(amount) FROM "RoundOperation" WHERE "roundId"=rid AND status<>'CONFIRMED'),0) THEN RAISE EXCEPTION 'Round conservation, counters or reserved plan mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM "RoundOperation" o JOIN "RoundAccount" a ON a.id=o."sourceAccountId" JOIN "RoundAccount" b ON b.id=o."destinationAccountId" WHERE o."roundId"=rid AND (a."roundId"<>rid OR b."roundId"<>rid OR a.key<>'RESERVED' OR (o.kind='PAYOUT' AND (b.key<>'PAID' OR NOT EXISTS(SELECT 1 FROM "FundingScheme" f WHERE f.id=o."schemeId" AND f."roundId"=rid AND f."authorId"=o."beneficiaryId" AND f.recipient=o.recipient))) OR (o.kind='REFUND' AND (b."ownerId" IS DISTINCT FROM o."beneficiaryId" OR NOT EXISTS(SELECT 1 FROM "RoundContribution" c WHERE c."roundId"=rid AND c."sourceAccountId"=b.id))))) THEN RAISE EXCEPTION 'Round operation beneficiary or source mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM "RoundOperation" o WHERE o."roundId"=rid AND (o.attempts<>(SELECT count(*) FROM "RoundExecutionAttempt" x WHERE x."operationId"=o.id) OR (o.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM "RoundLedgerTransaction" t WHERE t.id=o."transactionId" AND t."roundId"=rid AND t.kind=o.kind AND t.amount=o.amount)))) THEN RAISE EXCEPTION 'Execution attempts and receipts must reconcile'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER settlement_conservation AFTER INSERT OR UPDATE ON "RoundSettlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_balance_check();
CREATE CONSTRAINT TRIGGER round_account_conservation AFTER INSERT OR UPDATE ON "RoundAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_balance_check();
CREATE CONSTRAINT TRIGGER round_entries_conservation AFTER INSERT ON "RoundLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_balance_check();
CREATE CONSTRAINT TRIGGER round_operations_conservation AFTER INSERT OR UPDATE ON "RoundOperation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_balance_check();
CREATE CONSTRAINT TRIGGER round_attempts_conservation AFTER INSERT ON "RoundExecutionAttempt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_round_balance_check();
