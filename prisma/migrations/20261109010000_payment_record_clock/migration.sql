-- Repair insert-time validation without changing any posted payment history.
-- CURRENT_TIMESTAMP is frozen at transaction start; legitimate inserts after
-- authorization/locking can occur later. Keep stored timestamps and the guard
-- on the same UTC wall clock and millisecond precision as these columns.
BEGIN;

ALTER TABLE "ExternalPaymentRecord"
  ALTER COLUMN "createdAt" SET DEFAULT timezone('UTC'::text, clock_timestamp());

CREATE OR REPLACE FUNCTION guard_external_payment_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "Community"; original "ExternalPaymentRecord"; checked_at timestamp(3);
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'External payment records are append-only'; END IF;
  SELECT * INTO c FROM "Community" WHERE id=NEW."communityId" FOR UPDATE;
  IF NEW.currency <> c.currency OR NOT EXISTS (
    SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=c.id
    AND m."userId"=NEW."recordedById" AND m.status='ACTIVE'
    AND (m.role='MODERATOR' OR c."adminId"=m."userId")
  ) THEN RAISE EXCEPTION 'External payment recorder or currency is invalid'; END IF;
  checked_at := timezone('UTC'::text, clock_timestamp())::timestamp(3);
  IF NEW."occurredAt" > checked_at OR NEW."createdAt" > checked_at THEN
    RAISE EXCEPTION 'External payment time is in the future'; END IF;
  IF NEW."roundId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FundingRound" WHERE id=NEW."roundId" AND "communityId"=c.id AND status NOT IN ('DRAFT','CANCELLED')
  ) THEN RAISE EXCEPTION 'External payment round scope is invalid'; END IF;
  IF NEW."counterpartyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "CommunityMembership" WHERE "communityId"=c.id AND "userId"=NEW."counterpartyId"
  ) THEN RAISE EXCEPTION 'External payment counterparty scope is invalid'; END IF;
  IF NEW."reversesId" IS NOT NULL THEN
    SELECT * INTO original FROM "ExternalPaymentRecord" WHERE id=NEW."reversesId";
    IF original.id IS NULL OR original.kind='REVERSAL' OR original."communityId"<>NEW."communityId"
      OR original.amount<>NEW.amount OR original.currency<>NEW.currency
      OR original."roundId" IS DISTINCT FROM NEW."roundId"
      OR original."counterpartyId" IS DISTINCT FROM NEW."counterpartyId"
      OR NEW."occurredAt" < original."occurredAt" OR length(btrim(NEW.note)) < 10
    THEN RAISE EXCEPTION 'External payment reversal does not match its source'; END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
