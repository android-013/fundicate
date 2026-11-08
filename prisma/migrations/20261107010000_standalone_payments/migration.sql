-- Additive external payment attestations. Existing funds/history remain unchanged.
CREATE TABLE "ExternalPaymentRecord" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL REFERENCES "Community"(id) ON DELETE RESTRICT,
  "roundId" UUID REFERENCES "FundingRound"(id) ON DELETE RESTRICT,
  "recordedById" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "counterpartyId" UUID REFERENCES "User"(id) ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK (kind IN ('CONTRIBUTION','PAYOUT','REFUND','REVERSAL')),
  "amount" BIGINT NOT NULL CHECK (amount > 0 AND amount <= 999999999),
  "currency" TEXT NOT NULL CHECK (currency IN ('USD','BDT','EUR')),
  "reference" VARCHAR(120) NOT NULL CHECK (length(btrim(reference)) >= 3),
  "note" VARCHAR(2000) NOT NULL,
  "evidenceUrl" VARCHAR(2048),
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversesId" UUID REFERENCES "ExternalPaymentRecord"(id) ON DELETE RESTRICT,
  CONSTRAINT "ExternalPaymentRecord_pkey" PRIMARY KEY ("id"),
  CHECK ((kind='REVERSAL') = ("reversesId" IS NOT NULL)),
  CHECK ("evidenceUrl" IS NULL OR "evidenceUrl" ~ '^https://[^/@?#]+([/?#]|$)')
);
CREATE UNIQUE INDEX "ExternalPaymentRecord_communityId_reference_key" ON "ExternalPaymentRecord"("communityId",reference);
CREATE UNIQUE INDEX "ExternalPaymentRecord_reversesId_key" ON "ExternalPaymentRecord"("reversesId");
CREATE INDEX "ExternalPaymentRecord_communityId_createdAt_idx" ON "ExternalPaymentRecord"("communityId","createdAt");
CREATE FUNCTION guard_external_payment_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "Community"; original "ExternalPaymentRecord";
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'External payment records are append-only'; END IF;
  SELECT * INTO c FROM "Community" WHERE id=NEW."communityId" FOR UPDATE;
  IF NEW.currency <> c.currency OR NOT EXISTS (
    SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=c.id
    AND m."userId"=NEW."recordedById" AND m.status='ACTIVE'
    AND (m.role='MODERATOR' OR c."adminId"=m."userId")
  ) THEN RAISE EXCEPTION 'External payment recorder or currency is invalid'; END IF;
  IF NEW."occurredAt" > CURRENT_TIMESTAMP OR NEW."createdAt" > CURRENT_TIMESTAMP THEN
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
CREATE TRIGGER external_payment_record_guard BEFORE INSERT OR UPDATE OR DELETE ON "ExternalPaymentRecord"
FOR EACH ROW EXECUTE FUNCTION guard_external_payment_record();
