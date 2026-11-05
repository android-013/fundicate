-- Every contribution row must describe its own received deposit, never a reserve or payout.
CREATE FUNCTION fundicate_round_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "RoundLedgerTransaction" t JOIN "RoundAccount" a ON a.id=t."sourceAccountId"
    WHERE t.id=NEW."transactionId" AND t.kind='CONTRIBUTION'
      AND t."roundId"=NEW."roundId" AND t.amount=NEW.amount
      AND t."sourceAccountId"=NEW."sourceAccountId"
      AND t."initiatedById"=NEW."userId" AND a."ownerId"=NEW."userId"
  ) THEN RAISE EXCEPTION 'A contribution must match its original received deposit'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER original_round_receipt BEFORE INSERT ON "RoundContribution" FOR EACH ROW EXECUTE FUNCTION fundicate_round_receipt_guard();
