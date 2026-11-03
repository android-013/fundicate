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
