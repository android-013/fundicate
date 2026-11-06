

-- CreateTable
CREATE TABLE "RoundMethodBallot" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "ballot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundMethodBallot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationReview" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "dimension" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationRevision" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationModeration" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationModeration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationReport" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationAppeal" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "moderationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "statement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoundMethodBallot_roundId_userId_key" ON "RoundMethodBallot"("roundId", "userId");

-- CreateIndex
CREATE INDEX "ReputationReview_communityId_createdAt_idx" ON "ReputationReview"("communityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationReview_communityId_authorId_targetType_targetId_d_key" ON "ReputationReview"("communityId", "authorId", "targetType", "targetId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationRevision_reviewId_revision_key" ON "ReputationRevision"("reviewId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationModeration_reviewId_sequence_key" ON "ReputationModeration"("reviewId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationReport_reviewId_reporterId_key" ON "ReputationReport"("reviewId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationAppeal_moderationId_key" ON "ReputationAppeal"("moderationId");

-- AddForeignKey
ALTER TABLE "RoundMethodBallot" ADD CONSTRAINT "RoundMethodBallot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundMethodBallot" ADD CONSTRAINT "RoundMethodBallot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundMethodBallot" ADD CONSTRAINT "RoundMethodBallot_roundId_userId_fkey" FOREIGN KEY ("roundId", "userId") REFERENCES "RoundElectorate"("roundId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationReview" ADD CONSTRAINT "ReputationReview_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationReview" ADD CONSTRAINT "ReputationReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationRevision" ADD CONSTRAINT "ReputationRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ReputationReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationModeration" ADD CONSTRAINT "ReputationModeration_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ReputationReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationModeration" ADD CONSTRAINT "ReputationModeration_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationReport" ADD CONSTRAINT "ReputationReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ReputationReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationReport" ADD CONSTRAINT "ReputationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationAppeal" ADD CONSTRAINT "ReputationAppeal_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ReputationReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationAppeal" ADD CONSTRAINT "ReputationAppeal_moderationId_fkey" FOREIGN KEY ("moderationId") REFERENCES "ReputationModeration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationAppeal" ADD CONSTRAINT "ReputationAppeal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- V4 reuses the existing received-basis electorate and every settlement/veto gate.
ALTER TABLE "FundingRound" DROP CONSTRAINT round_rules;
ALTER TABLE "FundingRound" ADD CONSTRAINT round_rules CHECK ("proposalPolicy" IN ('STAFF','MEMBERS','EVERYONE') AND "quorumBps" BETWEEN 1 AND 10000 AND "rulesVersion" IN (1,2,3,4));
ALTER TABLE "RoundSettlement" DROP CONSTRAINT settlement_bounds;
ALTER TABLE "RoundSettlement" ADD CONSTRAINT settlement_bounds CHECK ("rulesVersion" IN (2,3,4) AND network='local-simulation' AND decimals=2 AND currency IN ('USD','BDT','EUR') AND "assetId"='fiat:'||currency AND "fundingTarget">0 AND "minimumContribution">0 AND "maximumContribution">="minimumContribution" AND received>=0 AND paid>=0 AND refunded>=0 AND status IN ('DRAFT','COLLECTING','HELD','QUEUED','SETTLED','REFUNDED'));
CREATE OR REPLACE FUNCTION fundicate_check_round_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; v int; s int;
BEGIN
  IF TG_TABLE_NAME='FundingRound' THEN rid:=NEW.id; ELSE rid:=NEW."roundId"; END IF;
  SELECT "rulesVersion" INTO v FROM "FundingRound" WHERE id=rid;
  SELECT "rulesVersion" INTO s FROM "RoundSettlement" WHERE "roundId"=rid;
  IF (v IN (2,3,4) AND s IS DISTINCT FROM v) OR (v=1 AND s IS NOT NULL) THEN RAISE EXCEPTION 'Funded settlement version must match its round'; END IF;
  RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_power_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; paid bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Voting power history cannot be deleted'; END IF;
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF r."rulesVersion" NOT IN (3,4) THEN RAISE EXCEPTION 'V3 power cannot be added to earlier rounds'; END IF;
  IF TG_OP='INSERT' THEN
    IF r.status NOT IN ('DRAFT','SUBMISSIONS') OR s.status NOT IN ('DRAFT','COLLECTING') OR NEW."createdAt">=s."collectionClosesAt" OR NEW."frozenAt" IS NOT NULL OR NEW."paidPower"<>0 OR NOT NEW.eligible OR NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'Electorate entries start as active eligible members before cutoff'; END IF;
  ELSE
    IF (NEW."roundId",NEW."userId",NEW."createdAt") IS DISTINCT FROM (OLD."roundId",OLD."userId",OLD."createdAt") OR (OLD."frozenAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Frozen voting power and identity are immutable'; END IF;
    IF NEW."frozenAt" IS NULL THEN
      IF NEW."paidPower"<>OLD."paidPower" OR (clock_timestamp() AT TIME ZONE 'UTC')>=s."collectionClosesAt" OR r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Eligibility is fixed at the contribution cutoff'; END IF;
    ELSE
      SELECT CASE WHEN NEW.eligible THEN COALESCE(sum(amount),0) ELSE 0 END INTO paid FROM "RoundContribution" WHERE "roundId"=NEW."roundId" AND "userId"=NEW."userId" AND "createdAt"<s."collectionClosesAt";
      IF NEW.eligible<>OLD.eligible OR NEW."frozenAt"<s."collectionClosesAt" OR NEW."paidPower"<>paid OR r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Frozen power must use the eligible received contribution basis'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_track_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  FOR rid IN SELECT r.id FROM "FundingRound" r JOIN "RoundSettlement" s ON s."roundId"=r.id WHERE r."communityId"=NEW."communityId" AND r."rulesVersion" IN (3,4) AND r.status='SUBMISSIONS' AND s.status='COLLECTING' AND (clock_timestamp() AT TIME ZONE 'UTC')<s."collectionClosesAt" LOOP
    IF NEW.status='ACTIVE' THEN
      INSERT INTO "RoundVotingPower" ("roundId","userId",eligible,"paidPower","createdAt") VALUES(rid,NEW."userId",true,0,(clock_timestamp() AT TIME ZONE 'UTC')) ON CONFLICT ("roundId","userId") DO UPDATE SET eligible=true WHERE "RoundVotingPower"."frozenAt" IS NULL;
    ELSE
      UPDATE "RoundVotingPower" SET eligible=false WHERE "roundId"=rid AND "userId"=NEW."userId" AND "frozenAt" IS NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_round_voter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  IF r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Electorate freezes when screening begins'; END IF;
  IF r."rulesVersion" IN (3,4) THEN
    IF NOT EXISTS(SELECT 1 FROM "RoundVotingPower" p WHERE p."roundId"=r.id AND p."userId"=NEW."userId" AND p.eligible AND p."frozenAt" IS NOT NULL) THEN RAISE EXCEPTION 'The voter must belong to the frozen cutoff basis'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'An active member is required'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_round_ballot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; mode text; power bigint;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  IF r."rulesVersion" IN (3,4) THEN
    SELECT "rulesSnapshot"->>CASE WHEN TG_TABLE_NAME='SchemeScreeningVote' THEN 'screeningWeight' ELSE 'selectionWeight' END INTO mode FROM "RoundSettlement" WHERE "roundId"=r.id;
    SELECT CASE WHEN mode='CONTRIBUTION' THEN "paidPower" ELSE 1 END INTO power FROM "RoundVotingPower" WHERE "roundId"=r.id AND "userId"=NEW."userId" AND eligible AND "frozenAt" IS NOT NULL;
    IF COALESCE(power,0)<=0 THEN RAISE EXCEPTION 'Positive frozen stage power is required'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'An active membership is required'; END IF;
  IF TG_TABLE_NAME='SchemeScreeningVote' THEN
    IF r.status<>'SCREENING' OR NEW."createdAt"<r."screeningOpensAt" OR NEW."createdAt">=r."screeningClosesAt" THEN RAISE EXCEPTION 'Screening is not open'; END IF;
  ELSE
    IF r.status<>'SELECTION' OR NEW."createdAt"<r."selectionOpensAt" OR NEW."createdAt">=r."selectionClosesAt" OR NOT EXISTS(SELECT 1 FROM "FundingScheme" s WHERE s.id=NEW."schemeId" AND s."roundId"=r.id AND s.status='QUALIFIED') THEN RAISE EXCEPTION 'Choose a qualified scheme during selection'; END IF;
  END IF;
  IF r."rulesVersion"=4 AND TG_TABLE_NAME='RoundSelectionVote' THEN RAISE EXCEPTION 'V4 selection requires a complete method ballot'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; total bigint; rejects bigint; enabled boolean; payout_sum numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published decision history cannot be deleted'; END IF;
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF TG_OP='INSERT' THEN
    enabled:=COALESCE((s."rulesSnapshot"->>'vetoEnabled')::boolean,false);
    SELECT COALESCE(sum(CASE WHEN s."rulesSnapshot"->>'vetoWeight'='CONTRIBUTION' THEN "paidPower" ELSE 1 END),0) INTO total FROM "RoundVotingPower" WHERE "roundId"=r.id AND eligible AND "frozenAt" IS NOT NULL;
    IF r."rulesVersion" NOT IN (3,4) OR r.status<>'DECIDED' OR NEW."publishedAt" IS DISTINCT FROM r."decidedAt" OR NEW."totalVetoPower"<>total OR NEW.rejected OR (enabled AND (NEW."vetoClosesAt" IS DISTINCT FROM NEW."publishedAt"+INTERVAL '24 hours' OR NEW."vetoFinalizedAt" IS NOT NULL)) OR (NOT enabled AND (NEW."vetoClosesAt" IS NOT NULL OR NEW."vetoFinalizedAt" IS NULL)) THEN RAISE EXCEPTION 'Decision requires final election and exact published veto rules/power'; END IF;
    IF NEW.allocation->>'assetId' IS DISTINCT FROM s."assetId" OR NEW.allocation->>'rulesVersion' IS DISTINCT FROM s."rulesVersion"::text OR NEW.allocation->>'received' IS DISTINCT FROM s.received::text OR jsonb_typeof(NEW.allocation->'payouts') IS DISTINCT FROM 'array' OR NEW.allocation->>'refundTotal' IS NULL THEN RAISE EXCEPTION 'A decision must publish its exact allocation'; END IF;
    SELECT COALESCE(sum((p->>'amount')::numeric),0) INTO payout_sum FROM jsonb_array_elements(NEW.allocation->'payouts') p;
    IF payout_sum+(NEW.allocation->>'refundTotal')::numeric<>s.received OR (NEW.allocation->>'refundTotal')::numeric<0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.allocation->'payouts') p WHERE (p->>'amount')::numeric<=0 OR NOT EXISTS(SELECT 1 FROM "FundingScheme" f WHERE f.id::text=p->>'schemeId' AND f."roundId"=r.id AND f.status='QUALIFIED' AND f.recipient=p->>'recipient' AND f."authorId"::text=p->>'beneficiaryId' AND f.amount>=(p->>'amount')::numeric)) OR (SELECT count(*) FROM jsonb_array_elements(NEW.allocation->'payouts'))<>(SELECT count(DISTINCT p->>'schemeId') FROM jsonb_array_elements(NEW.allocation->'payouts') p) THEN RAISE EXCEPTION 'Decision allocations must be capped, scoped and conserved'; END IF;
    IF (r.outcome NOT IN ('WINNER_SELECTED','ALLOCATION_SELECTED') OR s.received<s."fundingTarget") AND payout_sum<>0 THEN RAISE EXCEPTION 'Unsuccessful rounds cannot publish payouts'; END IF;
  ELSE
    IF (to_jsonb(NEW)-ARRAY['vetoFinalizedAt','rejected']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['vetoFinalizedAt','rejected']) OR OLD."vetoFinalizedAt" IS NOT NULL OR OLD."vetoClosesAt" IS NULL OR NEW."vetoFinalizedAt" IS NULL OR NEW."vetoFinalizedAt"<OLD."vetoClosesAt" THEN RAISE EXCEPTION 'A published allocation is immutable; the full veto window must elapse'; END IF;
    SELECT COALESCE(sum(CASE WHEN s."rulesSnapshot"->>'vetoWeight'='CONTRIBUTION' THEN p."paidPower" ELSE 1 END),0) INTO rejects FROM "RoundVetoVote" v JOIN "RoundVotingPower" p ON p."roundId"=v."roundId" AND p."userId"=v."userId" WHERE v."roundId"=r.id AND v.choice='REJECT' AND p.eligible AND p."frozenAt" IS NOT NULL;
    IF NEW.rejected IS DISTINCT FROM (OLD."totalVetoPower">0 AND 10::numeric*rejects>=9::numeric*OLD."totalVetoPower") THEN RAISE EXCEPTION 'Veto rejection must use at least 90 percent of all frozen eligible power'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_veto_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "RoundDecision"%ROWTYPE; mode text; power bigint;
BEGIN
  SELECT * INTO d FROM "RoundDecision" WHERE "roundId"=NEW."roundId";
  SELECT "rulesSnapshot"->>'vetoWeight' INTO mode FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  SELECT CASE WHEN mode='CONTRIBUTION' THEN "paidPower" ELSE 1 END INTO power FROM "RoundVotingPower" WHERE "roundId"=NEW."roundId" AND "userId"=NEW."userId" AND eligible AND "frozenAt" IS NOT NULL;
  IF d."vetoClosesAt" IS NULL OR d."vetoFinalizedAt" IS NOT NULL OR NEW."createdAt"<d."publishedAt" OR NEW."createdAt">=d."vetoClosesAt" OR COALESCE(power,0)<=0 THEN RAISE EXCEPTION 'A positive frozen voter can vote only inside the published veto window'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_decision_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."rulesVersion" IN (3,4) AND NEW.status='DECIDED' AND NOT EXISTS(SELECT 1 FROM "RoundDecision" WHERE "roundId"=NEW.id) THEN RAISE EXCEPTION 'V3 decisions must publish an immutable allocation before commit'; END IF;
  RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_v3_settlement_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "RoundSettlement"%ROWTYPE; d "RoundDecision"%ROWTYPE; at_time timestamp; transfer_kind text;
BEGIN
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  transfer_kind:=NEW.kind;
  IF transfer_kind<>'CONTRIBUTION' AND EXISTS(SELECT 1 FROM "RoundOperation" WHERE "roundId"=NEW."roundId" AND status='UNKNOWN') THEN RAISE EXCEPTION 'Unknown execution outcomes require reconciliation before submission or release'; END IF;
  IF s."rulesVersion" NOT IN (3,4) OR transfer_kind='CONTRIBUTION' THEN RETURN NEW; END IF;
  at_time:=NEW."createdAt";
  SELECT * INTO d FROM "RoundDecision" WHERE "roundId"=NEW."roundId";
  IF d."roundId" IS NULL THEN
    IF at_time<s."expiresAt" OR transfer_kind='PAYOUT' THEN RAISE EXCEPTION 'Only expired unresolved funds can refund without a published decision'; END IF;
  ELSE
    IF d."vetoClosesAt" IS NOT NULL AND (at_time<d."vetoClosesAt" OR d."vetoFinalizedAt" IS NULL) THEN RAISE EXCEPTION 'Every transfer path must wait for the full veto window and final decision'; END IF;
    IF transfer_kind='PAYOUT' AND TG_TABLE_NAME='RoundOperation' THEN
      IF d.rejected OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.allocation->'payouts') p WHERE p->>'schemeId'=NEW."schemeId"::text AND (p->>'amount')::numeric=NEW.amount AND p->>'recipient'=NEW.recipient AND p->>'beneficiaryId'=NEW."beneficiaryId"::text) THEN RAISE EXCEPTION 'Payout intent must match the published, unrejected allocation'; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='RoundOperation' THEN
    IF (transfer_kind='PAYOUT' AND (NEW."operationKey"<>'payout:'||NEW."schemeId"::text OR at_time>=s."expiresAt")) OR (transfer_kind='REFUND' AND NEW."operationKey"<>'refund:'||NEW."destinationAccountId"::text) THEN RAISE EXCEPTION 'Operation identity or expiry cannot change its allocation'; END IF;
  ELSIF transfer_kind IN ('PAYOUT','REFUND') THEN
    IF transfer_kind='PAYOUT' AND d.rejected THEN RAISE EXCEPTION 'Rejected rounds cannot pay recipients'; END IF;
    IF NOT EXISTS(SELECT 1 FROM "RoundOperation" o WHERE o."roundId"=NEW."roundId" AND NEW."operationKey"='execute:'||o.id::text AND o.kind=NEW.kind AND o.amount=NEW.amount AND o."sourceAccountId"=NEW."sourceAccountId" AND o."destinationAccountId"=NEW."destinationAccountId" AND o.status IN ('PENDING','FAILED')) THEN RAISE EXCEPTION 'Only a known immutable operation can post'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION fundicate_method_ballot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; power bigint; n int; k int; item jsonb;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=r.id;
  SELECT CASE WHEN s."rulesSnapshot"->>'selectionWeight'='CONTRIBUTION' THEN "paidPower" ELSE 1 END INTO power FROM "RoundVotingPower" WHERE "roundId"=r.id AND "userId"=NEW."userId" AND eligible AND "frozenAt" IS NOT NULL;
  IF r."rulesVersion"<>4 OR r.status<>'SELECTION' OR NEW."createdAt"<r."selectionOpensAt" OR NEW."createdAt">=r."selectionClosesAt" OR COALESCE(power,0)<=0 OR NEW.method IS DISTINCT FROM s."rulesSnapshot"->>'selectionMethod' OR jsonb_typeof(NEW.ballot) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'A V4 method ballot requires positive frozen power during selection'; END IF;
  SELECT count(*) INTO n FROM "FundingScheme" WHERE "roundId"=r.id AND status='QUALIFIED';
  SELECT count(*) INTO k FROM jsonb_object_keys(NEW.ballot);
  IF n<1 OR n>50 OR k<>1 THEN RAISE EXCEPTION 'Invalid method candidate set or ballot keys'; END IF;
  IF NEW.method='FPTP' THEN
    IF jsonb_typeof(NEW.ballot->'schemeId') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM "FundingScheme" WHERE "roundId"=r.id AND status='QUALIFIED' AND id::text=NEW.ballot->>'schemeId') THEN RAISE EXCEPTION 'Choose one qualified candidate'; END IF;
  ELSIF NEW.method IN ('IRV','STV') THEN
    IF jsonb_typeof(NEW.ballot->'ranking') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'A ranking array is required'; END IF;
    SELECT count(*),count(DISTINCT value) INTO n,k FROM jsonb_array_elements(NEW.ballot->'ranking');
    IF n<1 OR n>50 OR n<>k OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.ballot->'ranking') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM "FundingScheme" WHERE "roundId"=r.id AND status='QUALIFIED' AND to_jsonb(id::text)=v)) THEN RAISE EXCEPTION 'Rank distinct qualified candidates'; END IF;
  ELSIF NEW.method IN ('ELO','GLICKO_2','FORCED_PAIRWISE') THEN
    IF jsonb_typeof(NEW.ballot->'pairs') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.ballot->'pairs')<>n*(n-1)/2 THEN RAISE EXCEPTION 'Every assigned pair is required exactly once'; END IF;
    SELECT count(DISTINCT (value->>'a',value->>'b')) INTO k FROM jsonb_array_elements(NEW.ballot->'pairs');
    IF k<>n*(n-1)/2 THEN RAISE EXCEPTION 'Duplicate comparison'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.ballot->'pairs') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid pair'; END IF;
      SELECT count(*) INTO k FROM jsonb_object_keys(item);
      IF k<>3 OR item->>'a' IS NULL OR item->>'b' IS NULL OR item->>'a'>=item->>'b' OR item->>'choice' IS NULL OR item->>'choice' NOT IN ('A','B','DRAW') OR (NEW.method='FORCED_PAIRWISE' AND item->>'choice'='DRAW') OR NOT EXISTS(SELECT 1 FROM "FundingScheme" WHERE "roundId"=r.id AND status='QUALIFIED' AND id::text=item->>'a') OR NOT EXISTS(SELECT 1 FROM "FundingScheme" WHERE "roundId"=r.id AND status='QUALIFIED' AND id::text=item->>'b') THEN RAISE EXCEPTION 'Invalid, foreign, reversed or unsupported pair'; END IF;
    END LOOP;
  ELSE RAISE EXCEPTION 'Unsupported selection method'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER method_ballot_guard BEFORE INSERT ON "RoundMethodBallot" FOR EACH ROW EXECUTE FUNCTION fundicate_method_ballot_guard();
CREATE TRIGGER immutable_method_ballot BEFORE UPDATE OR DELETE ON "RoundMethodBallot" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();

ALTER TABLE "ReputationReview" ADD CONSTRAINT reputation_shape CHECK (
 "targetType" IN ('MEMBER','SCHEME','PROPOSAL','ROUND') AND "contextType" IN ('ROUND','PROPOSAL') AND
 (("targetType" IN ('MEMBER','ROUND') AND dimension='PARTICIPATION') OR ("targetType" IN ('SCHEME','PROPOSAL') AND dimension='PRESENTATION') OR ("targetType" IN ('MEMBER','SCHEME','PROPOSAL') AND dimension='VERIFIED_RECIPIENT_PERFORMANCE')));
ALTER TABLE "ReputationRevision" ADD CONSTRAINT reputation_revision_shape CHECK (revision>0 AND score BETWEEN 1 AND 5 AND length(trim(text)) BETWEEN 20 AND 3000);
ALTER TABLE "ReputationModeration" ADD CONSTRAINT reputation_moderation_shape CHECK (sequence>0 AND action IN ('HIDE','RESTORE') AND length(trim(reason)) BETWEEN 10 AND 1500);
ALTER TABLE "ReputationReport" ADD CONSTRAINT reputation_report_shape CHECK (length(trim(reason)) BETWEEN 10 AND 1500);
ALTER TABLE "ReputationAppeal" ADD CONSTRAINT reputation_appeal_shape CHECK (length(trim(statement)) BETWEEN 20 AND 2000);
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON "ReputationReview" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_review_revision BEFORE UPDATE OR DELETE ON "ReputationRevision" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_review_moderation BEFORE UPDATE OR DELETE ON "ReputationModeration" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_review_report BEFORE UPDATE OR DELETE ON "ReputationReport" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_review_appeal BEFORE UPDATE OR DELETE ON "ReputationAppeal" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();

CREATE FUNCTION fundicate_reputation_participant(kind text,cid uuid,uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN kind='ROUND' THEN EXISTS(SELECT 1 FROM "FundingRound" r WHERE r.id=cid AND r.status='DECIDED' AND r."decidedAt" IS NOT NULL AND
  NOT EXISTS(SELECT 1 FROM "RoundDecision" d WHERE d."roundId"=r.id AND d."vetoClosesAt">(clock_timestamp() AT TIME ZONE 'UTC')) AND
  (r."creatorId"=uid OR EXISTS(SELECT 1 FROM "FundingScheme" WHERE "roundId"=cid AND "authorId"=uid) OR EXISTS(SELECT 1 FROM "SchemeScreeningVote" WHERE "roundId"=cid AND "userId"=uid) OR EXISTS(SELECT 1 FROM "RoundSelectionVote" WHERE "roundId"=cid AND "userId"=uid) OR EXISTS(SELECT 1 FROM "RoundMethodBallot" WHERE "roundId"=cid AND "userId"=uid) OR EXISTS(SELECT 1 FROM "RoundVetoVote" WHERE "roundId"=cid AND "userId"=uid) OR EXISTS(SELECT 1 FROM "RoundContribution" WHERE "roundId"=cid AND "userId"=uid)))
 ELSE EXISTS(SELECT 1 FROM "Proposal" p WHERE p.id=cid AND p.status IN ('CLOSED','APPROVED','REJECTED','EXECUTED') AND p."finalizedAt" IS NOT NULL AND (p."proposerId"=uid OR EXISTS(SELECT 1 FROM "Vote" WHERE "proposalId"=cid AND "userId"=uid))) END;
$$;
CREATE FUNCTION fundicate_reputation_target_owner(kind text,tid uuid,cid uuid) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE owner_id uuid;
BEGIN
 IF kind='MEMBER' THEN SELECT "userId" INTO owner_id FROM "CommunityMembership" WHERE "communityId"=cid AND "userId"=tid;
 ELSIF kind='SCHEME' THEN SELECT s."authorId" INTO owner_id FROM "FundingScheme" s JOIN "FundingRound" r ON r.id=s."roundId" WHERE s.id=tid AND r."communityId"=cid;
 ELSIF kind='PROPOSAL' THEN SELECT "proposerId" INTO owner_id FROM "Proposal" WHERE id=tid AND "communityId"=cid;
 ELSIF kind='ROUND' THEN SELECT "creatorId" INTO owner_id FROM "FundingRound" WHERE id=tid AND "communityId"=cid;
 END IF; RETURN owner_id;
END; $$;
CREATE FUNCTION fundicate_reputation_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;
BEGIN
 owner_id:=fundicate_reputation_target_owner(NEW."targetType",NEW."targetId",NEW."communityId");
 IF owner_id IS NULL OR owner_id=NEW."authorId" OR NOT EXISTS(SELECT 1 FROM "CommunityMembership" WHERE "communityId"=NEW."communityId" AND "userId"=NEW."authorId" AND status='ACTIVE') OR NOT fundicate_reputation_participant(NEW."contextType",NEW."contextId",NEW."authorId") OR NOT fundicate_reputation_participant(NEW."contextType",NEW."contextId",owner_id) THEN RAISE EXCEPTION 'An active, nonself reviewer and actual shared completed participation are required'; END IF;
 IF (NEW."contextType"='ROUND' AND NOT EXISTS(SELECT 1 FROM "FundingRound" WHERE id=NEW."contextId" AND "communityId"=NEW."communityId")) OR (NEW."contextType"='PROPOSAL' AND NOT EXISTS(SELECT 1 FROM "Proposal" WHERE id=NEW."contextId" AND "communityId"=NEW."communityId")) OR (NEW."targetType"='SCHEME' AND (NEW."contextType"<>'ROUND' OR NOT EXISTS(SELECT 1 FROM "FundingScheme" WHERE id=NEW."targetId" AND "roundId"=NEW."contextId"))) OR (NEW."targetType" IN ('ROUND','PROPOSAL') AND (NEW."targetType"<>NEW."contextType" OR NEW."targetId"<>NEW."contextId")) THEN RAISE EXCEPTION 'The review target and context must share their community and scope'; END IF;
 IF NEW.dimension='VERIFIED_RECIPIENT_PERFORMANCE' AND NOT (
  (NEW."contextType"='ROUND' AND NEW."targetType" IN ('MEMBER','SCHEME') AND EXISTS(SELECT 1 FROM "RoundOperation" o JOIN "RoundLedgerTransaction" t ON t.id=o."transactionId" WHERE o."roundId"=NEW."contextId" AND o.kind='PAYOUT' AND o.status='CONFIRMED' AND o.amount>0 AND t.kind='PAYOUT' AND t.amount=o.amount AND ((NEW."targetType"='MEMBER' AND o."beneficiaryId"=NEW."targetId") OR (NEW."targetType"='SCHEME' AND o."schemeId"=NEW."targetId")))) OR
  (NEW."contextType"='PROPOSAL' AND NEW."targetType"='PROPOSAL' AND EXISTS(SELECT 1 FROM "FundingExecution" f JOIN "LedgerTransaction" t ON t.id=f."transactionId" WHERE f."proposalId"=NEW."targetId" AND f.status='CONFIRMED' AND t.status='CONFIRMED' AND t.amount>0))) THEN RAISE EXCEPTION 'A matching confirmed recipient payment is required'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER reputation_review_guard BEFORE INSERT ON "ReputationReview" FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_review_guard();
CREATE FUNCTION fundicate_reputation_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ReputationReview"%ROWTYPE; m "ReputationModeration"%ROWTYPE; owner_id uuid; prior int;
BEGIN
 SELECT * INTO r FROM "ReputationReview" WHERE id=NEW."reviewId";
 IF TG_TABLE_NAME='ReputationRevision' THEN
  SELECT COALESCE(max(revision),0) INTO prior FROM "ReputationRevision" WHERE "reviewId"=r.id;
  IF NEW.revision<>prior+1 THEN RAISE EXCEPTION 'Review revisions must append in order'; END IF;
 ELSIF TG_TABLE_NAME='ReputationReport' THEN
  IF NEW."reporterId"=r."authorId" OR NOT EXISTS(SELECT 1 FROM "CommunityMembership" WHERE "communityId"=r."communityId" AND "userId"=NEW."reporterId" AND status='ACTIVE') THEN RAISE EXCEPTION 'A nonauthor active member may report'; END IF;
 ELSE
  SELECT * INTO m FROM "ReputationModeration" WHERE "reviewId"=r.id ORDER BY sequence DESC LIMIT 1;
  IF TG_TABLE_NAME='ReputationAppeal' THEN
   IF NEW."authorId"<>r."authorId" OR NEW."moderationId" IS DISTINCT FROM m.id OR m.action IS DISTINCT FROM 'HIDE' THEN RAISE EXCEPTION 'Only the author may appeal the current hiding decision'; END IF;
  ELSE
   owner_id:=fundicate_reputation_target_owner(r."targetType",r."targetId",r."communityId");
   IF NEW.sequence<>COALESCE(m.sequence,0)+1 OR NEW."actorId" IN (r."authorId",owner_id) OR NOT EXISTS(SELECT 1 FROM "CommunityMembership" p JOIN "Community" c ON c.id=p."communityId" WHERE c.id=r."communityId" AND p."userId"=NEW."actorId" AND p.status='ACTIVE' AND (p.role='MODERATOR' OR c."adminId"=NEW."actorId")) OR (NEW.action='RESTORE') IS DISTINCT FROM (m.action IS NOT DISTINCT FROM 'HIDE') OR (NEW.action='RESTORE' AND m."actorId"=NEW."actorId" AND EXISTS(SELECT 1 FROM "ReputationAppeal" WHERE "moderationId"=m.id)) THEN RAISE EXCEPTION 'Moderation requires an unconflicted authority and ordered visibility transition; appeals require a different moderator'; END IF;
  END IF;
 END IF; RETURN NEW;
END; $$;
CREATE TRIGGER reputation_revision_guard BEFORE INSERT ON "ReputationRevision" FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_event_guard();
CREATE TRIGGER reputation_report_guard BEFORE INSERT ON "ReputationReport" FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_event_guard();
CREATE TRIGGER reputation_moderation_guard BEFORE INSERT ON "ReputationModeration" FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_event_guard();
CREATE TRIGGER reputation_appeal_guard BEFORE INSERT ON "ReputationAppeal" FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_event_guard();
