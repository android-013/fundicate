-- Part 3 additions. Historical V1/V2 meaning and all posted records are preserved.
ALTER TABLE "FundingRound" DROP CONSTRAINT round_rules;
ALTER TABLE "FundingRound" ADD CONSTRAINT round_rules CHECK ("proposalPolicy" IN ('STAFF','MEMBERS','EVERYONE') AND "quorumBps" BETWEEN 1 AND 10000 AND "rulesVersion" IN (1,2,3));
ALTER TABLE "RoundSettlement" DROP CONSTRAINT settlement_bounds;
ALTER TABLE "RoundSettlement" ADD CONSTRAINT settlement_bounds CHECK ("rulesVersion" IN (2,3) AND network='local-simulation' AND decimals=2 AND currency IN ('USD','BDT','EUR') AND "assetId"='fiat:'||currency AND "fundingTarget">0 AND "minimumContribution">0 AND "maximumContribution">="minimumContribution" AND received>=0 AND paid>=0 AND refunded>=0 AND status IN ('DRAFT','COLLECTING','HELD','QUEUED','SETTLED','REFUNDED'));
ALTER TABLE "RoundOperation" DROP CONSTRAINT round_operation_shape;
ALTER TABLE "RoundOperation" ADD CONSTRAINT round_operation_shape CHECK (amount>0 AND kind IN ('PAYOUT','REFUND') AND status IN ('PENDING','CONFIRMED','FAILED','UNKNOWN') AND attempts>=0 AND length(trim(recipient))>0 AND ((status='CONFIRMED' AND "transactionId" IS NOT NULL AND "completedAt" IS NOT NULL) OR (status<>'CONFIRMED' AND "transactionId" IS NULL AND "completedAt" IS NULL)));
ALTER TABLE "RoundExecutionAttempt" DROP CONSTRAINT round_attempt_shape;
ALTER TABLE "RoundExecutionAttempt" ADD CONSTRAINT round_attempt_shape CHECK (attempt>0 AND status IN ('CONFIRMED','FAILED','UNKNOWN'));
CREATE OR REPLACE FUNCTION fundicate_check_round_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; v int; s int;
BEGIN
  IF TG_TABLE_NAME='FundingRound' THEN rid:=NEW.id; ELSE rid:=NEW."roundId"; END IF;
  SELECT "rulesVersion" INTO v FROM "FundingRound" WHERE id=rid;
  SELECT "rulesVersion" INTO s FROM "RoundSettlement" WHERE "roundId"=rid;
  IF (v IN (2,3) AND s IS DISTINCT FROM v) OR (v=1 AND s IS NOT NULL) THEN RAISE EXCEPTION 'Funded settlement version must match its round'; END IF;
  RETURN NULL;
END; $$;

ALTER TABLE "RoundVotingPower" ADD CONSTRAINT power_nonnegative CHECK ("paidPower">=0 AND (eligible OR "paidPower"=0));
ALTER TABLE "RoundVetoVote" ADD CONSTRAINT veto_choice CHECK (choice IN ('REJECT','KEEP','ABSTAIN'));
ALTER TABLE "RoundDecision" ADD CONSTRAINT decision_shape CHECK ("totalVetoPower">=0 AND ("vetoClosesAt" IS NULL OR "vetoClosesAt"="publishedAt"+INTERVAL '24 hours') AND ("vetoFinalizedAt" IS NULL OR "vetoFinalizedAt">=COALESCE("vetoClosesAt","publishedAt")));

CREATE FUNCTION fundicate_v3_power_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; paid bigint;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Voting power history cannot be deleted'; END IF;
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF r."rulesVersion"<>3 THEN RAISE EXCEPTION 'V3 power cannot be added to earlier rounds'; END IF;
  IF TG_OP='INSERT' THEN
    IF r.status NOT IN ('DRAFT','SUBMISSIONS') OR s.status NOT IN ('DRAFT','COLLECTING') OR NEW."createdAt">=s."collectionClosesAt" OR NEW."frozenAt" IS NOT NULL OR NEW."paidPower"<>0 OR NOT NEW.eligible OR NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'Electorate entries start as active eligible members before cutoff'; END IF;
  ELSE
    IF (NEW."roundId",NEW."userId",NEW."createdAt") IS DISTINCT FROM (OLD."roundId",OLD."userId",OLD."createdAt") OR (OLD."frozenAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Frozen voting power and identity are immutable'; END IF;
    IF NEW."frozenAt" IS NULL THEN
      IF NEW."paidPower"<>OLD."paidPower" OR clock_timestamp()>=s."collectionClosesAt" OR r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Eligibility is fixed at the contribution cutoff'; END IF;
    ELSE
      SELECT CASE WHEN NEW.eligible THEN COALESCE(sum(amount),0) ELSE 0 END INTO paid FROM "RoundContribution" WHERE "roundId"=NEW."roundId" AND "userId"=NEW."userId" AND "createdAt"<s."collectionClosesAt";
      IF NEW.eligible<>OLD.eligible OR NEW."frozenAt"<s."collectionClosesAt" OR NEW."paidPower"<>paid OR r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Frozen power must use the eligible received contribution basis'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v3_power_guard BEFORE INSERT OR UPDATE OR DELETE ON "RoundVotingPower" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_power_guard();

CREATE FUNCTION fundicate_v3_track_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  FOR rid IN SELECT r.id FROM "FundingRound" r JOIN "RoundSettlement" s ON s."roundId"=r.id WHERE r."communityId"=NEW."communityId" AND r."rulesVersion"=3 AND r.status='SUBMISSIONS' AND s.status='COLLECTING' AND clock_timestamp()<s."collectionClosesAt" LOOP
    IF NEW.status='ACTIVE' THEN
      INSERT INTO "RoundVotingPower" ("roundId","userId",eligible,"paidPower","createdAt") VALUES(rid,NEW."userId",true,0,clock_timestamp()) ON CONFLICT ("roundId","userId") DO UPDATE SET eligible=true WHERE "RoundVotingPower"."frozenAt" IS NULL;
    ELSE
      UPDATE "RoundVotingPower" SET eligible=false WHERE "roundId"=rid AND "userId"=NEW."userId" AND "frozenAt" IS NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER v3_membership_basis AFTER INSERT OR UPDATE OF status ON "CommunityMembership" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_track_membership();

CREATE OR REPLACE FUNCTION fundicate_round_voter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  IF r.status<>'SUBMISSIONS' THEN RAISE EXCEPTION 'Electorate freezes when screening begins'; END IF;
  IF r."rulesVersion"=3 THEN
    IF NOT EXISTS(SELECT 1 FROM "RoundVotingPower" p WHERE p."roundId"=r.id AND p."userId"=NEW."userId" AND p.eligible AND p."frozenAt" IS NOT NULL) THEN RAISE EXCEPTION 'The voter must belong to the frozen cutoff basis'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'An active member is required'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION fundicate_round_ballot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; mode text; power bigint;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  IF r."rulesVersion"=3 THEN
    SELECT "rulesSnapshot"->>CASE WHEN TG_TABLE_NAME='SchemeScreeningVote' THEN 'screeningWeight' ELSE 'selectionWeight' END INTO mode FROM "RoundSettlement" WHERE "roundId"=r.id;
    SELECT CASE WHEN mode='CONTRIBUTION' THEN "paidPower" ELSE 1 END INTO power FROM "RoundVotingPower" WHERE "roundId"=r.id AND "userId"=NEW."userId" AND eligible AND "frozenAt" IS NOT NULL;
    IF COALESCE(power,0)<=0 THEN RAISE EXCEPTION 'Positive frozen stage power is required'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m.status='ACTIVE') THEN RAISE EXCEPTION 'An active membership is required'; END IF;
  IF TG_TABLE_NAME='SchemeScreeningVote' THEN
    IF r.status<>'SCREENING' OR NEW."createdAt"<r."screeningOpensAt" OR NEW."createdAt">=r."screeningClosesAt" THEN RAISE EXCEPTION 'Screening is not open'; END IF;
  ELSE
    IF r.status<>'SELECTION' OR NEW."createdAt"<r."selectionOpensAt" OR NEW."createdAt">=r."selectionClosesAt" OR NOT EXISTS(SELECT 1 FROM "FundingScheme" s WHERE s.id=NEW."schemeId" AND s."roundId"=r.id AND s.status='QUALIFIED') THEN RAISE EXCEPTION 'Choose a qualified scheme during selection'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION fundicate_v3_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; total bigint; rejects bigint; enabled boolean; payout_sum numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published decision history cannot be deleted'; END IF;
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF TG_OP='INSERT' THEN
    enabled:=COALESCE((s."rulesSnapshot"->>'vetoEnabled')::boolean,false);
    SELECT COALESCE(sum(CASE WHEN s."rulesSnapshot"->>'vetoWeight'='CONTRIBUTION' THEN "paidPower" ELSE 1 END),0) INTO total FROM "RoundVotingPower" WHERE "roundId"=r.id AND eligible AND "frozenAt" IS NOT NULL;
    IF r."rulesVersion"<>3 OR r.status<>'DECIDED' OR NEW."publishedAt" IS DISTINCT FROM r."decidedAt" OR NEW."totalVetoPower"<>total OR NEW.rejected OR (enabled AND NEW."vetoClosesAt" IS DISTINCT FROM NEW."publishedAt"+INTERVAL '24 hours') OR (NOT enabled AND (NEW."vetoClosesAt" IS NOT NULL OR NEW."vetoFinalizedAt" IS NULL)) THEN RAISE EXCEPTION 'Decision requires final election and exact published veto rules/power'; END IF;
    IF jsonb_typeof(NEW.allocation->'payouts') IS DISTINCT FROM 'array' OR NEW.allocation->>'refundTotal' IS NULL THEN RAISE EXCEPTION 'A decision must publish its exact allocation'; END IF;
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
CREATE TRIGGER v3_decision_guard BEFORE INSERT OR UPDATE OR DELETE ON "RoundDecision" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_decision_guard();
CREATE FUNCTION fundicate_v3_veto_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "RoundDecision"%ROWTYPE; mode text; power bigint;
BEGIN
  SELECT * INTO d FROM "RoundDecision" WHERE "roundId"=NEW."roundId";
  SELECT "rulesSnapshot"->>'vetoWeight' INTO mode FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  SELECT CASE WHEN mode='CONTRIBUTION' THEN "paidPower" ELSE 1 END INTO power FROM "RoundVotingPower" WHERE "roundId"=NEW."roundId" AND "userId"=NEW."userId" AND eligible AND "frozenAt" IS NOT NULL;
  IF d."vetoClosesAt" IS NULL OR d."vetoFinalizedAt" IS NOT NULL OR NEW."createdAt"<d."publishedAt" OR NEW."createdAt">=d."vetoClosesAt" OR COALESCE(power,0)<=0 THEN RAISE EXCEPTION 'A positive frozen voter can vote only inside the published veto window'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v3_veto_guard BEFORE INSERT ON "RoundVetoVote" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_veto_guard();
CREATE TRIGGER immutable_veto_ballots BEFORE UPDATE OR DELETE ON "RoundVetoVote" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE FUNCTION fundicate_v3_decision_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."rulesVersion"=3 AND NEW.status='DECIDED' AND NOT EXISTS(SELECT 1 FROM "RoundDecision" WHERE "roundId"=NEW.id) THEN RAISE EXCEPTION 'V3 decisions must publish an immutable allocation before commit'; END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER v3_published_decision AFTER INSERT OR UPDATE ON "FundingRound" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_v3_decision_required();

CREATE FUNCTION fundicate_v3_settlement_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s "RoundSettlement"%ROWTYPE; d "RoundDecision"%ROWTYPE; at_time timestamp; transfer_kind text;
BEGIN
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  transfer_kind:=NEW.kind;
  IF transfer_kind<>'CONTRIBUTION' AND EXISTS(SELECT 1 FROM "RoundOperation" WHERE "roundId"=NEW."roundId" AND status='UNKNOWN') THEN RAISE EXCEPTION 'Unknown execution outcomes require reconciliation before submission or release'; END IF;
  IF s."rulesVersion"<>3 OR transfer_kind='CONTRIBUTION' THEN RETURN NEW; END IF;
  at_time:=NEW."createdAt";
  SELECT * INTO d FROM "RoundDecision" WHERE "roundId"=NEW."roundId";
  IF d."roundId" IS NULL THEN
    IF at_time<s."expiresAt" OR transfer_kind='PAYOUT' THEN RAISE EXCEPTION 'Only expired unresolved funds can refund without a published decision'; END IF;
  ELSE
    IF d."vetoClosesAt" IS NOT NULL AND (at_time<d."vetoClosesAt" OR d."vetoFinalizedAt" IS NULL) THEN RAISE EXCEPTION 'Every transfer path must wait for the full veto window and final decision'; END IF;
    IF transfer_kind='PAYOUT' THEN
      IF d.rejected OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.allocation->'payouts') p WHERE p->>'schemeId'=NEW."schemeId"::text AND (p->>'amount')::numeric=NEW.amount AND p->>'recipient'=NEW.recipient AND p->>'beneficiaryId'=NEW."beneficiaryId"::text) THEN
        -- Ledger transactions identify intent by execute:<operation UUID>, not scheme fields.
        IF TG_TABLE_NAME='RoundOperation' THEN RAISE EXCEPTION 'Payout intent must match the published, unrejected allocation'; END IF;
      END IF;
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
CREATE TRIGGER v3_operation_gate BEFORE INSERT ON "RoundOperation" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_settlement_gate();
CREATE TRIGGER v3_transfer_gate BEFORE INSERT ON "RoundLedgerTransaction" FOR EACH ROW EXECUTE FUNCTION fundicate_v3_settlement_gate();
