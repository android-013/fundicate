CREATE OR REPLACE FUNCTION fundicate_v3_power_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  FOR rid IN SELECT r.id FROM "FundingRound" r JOIN "RoundSettlement" s ON s."roundId"=r.id WHERE r."communityId"=NEW."communityId" AND r."rulesVersion"=3 AND r.status='SUBMISSIONS' AND s.status='COLLECTING' AND (clock_timestamp() AT TIME ZONE 'UTC')<s."collectionClosesAt" LOOP
    IF NEW.status='ACTIVE' THEN
      INSERT INTO "RoundVotingPower" ("roundId","userId",eligible,"paidPower","createdAt") VALUES(rid,NEW."userId",true,0,(clock_timestamp() AT TIME ZONE 'UTC')) ON CONFLICT ("roundId","userId") DO UPDATE SET eligible=true WHERE "RoundVotingPower"."frozenAt" IS NULL;
    ELSE
      UPDATE "RoundVotingPower" SET eligible=false WHERE "roundId"=rid AND "userId"=NEW."userId" AND "frozenAt" IS NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
