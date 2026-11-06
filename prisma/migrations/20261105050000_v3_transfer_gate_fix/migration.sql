-- Match immutable operation intents without reading operation-only columns on ledger rows.
CREATE OR REPLACE FUNCTION fundicate_v3_settlement_gate() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE OR REPLACE FUNCTION fundicate_v3_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE; s "RoundSettlement"%ROWTYPE; total bigint; rejects bigint; enabled boolean; payout_sum numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published decision history cannot be deleted'; END IF;
  SELECT * INTO r FROM "FundingRound" WHERE id=NEW."roundId";
  SELECT * INTO s FROM "RoundSettlement" WHERE "roundId"=NEW."roundId";
  IF TG_OP='INSERT' THEN
    enabled:=COALESCE((s."rulesSnapshot"->>'vetoEnabled')::boolean,false);
    SELECT COALESCE(sum(CASE WHEN s."rulesSnapshot"->>'vetoWeight'='CONTRIBUTION' THEN "paidPower" ELSE 1 END),0) INTO total FROM "RoundVotingPower" WHERE "roundId"=r.id AND eligible AND "frozenAt" IS NOT NULL;
    IF r."rulesVersion"<>3 OR r.status<>'DECIDED' OR NEW."publishedAt" IS DISTINCT FROM r."decidedAt" OR NEW."totalVetoPower"<>total OR NEW.rejected OR (enabled AND (NEW."vetoClosesAt" IS DISTINCT FROM NEW."publishedAt"+INTERVAL '24 hours' OR NEW."vetoFinalizedAt" IS NOT NULL)) OR (NOT enabled AND (NEW."vetoClosesAt" IS NOT NULL OR NEW."vetoFinalizedAt" IS NULL)) THEN RAISE EXCEPTION 'Decision requires final election and exact published veto rules/power'; END IF;
    IF NEW.allocation->>'assetId' IS DISTINCT FROM s."assetId" OR NEW.allocation->>'rulesVersion' IS DISTINCT FROM '3' OR NEW.allocation->>'received' IS DISTINCT FROM s.received::text OR jsonb_typeof(NEW.allocation->'payouts') IS DISTINCT FROM 'array' OR NEW.allocation->>'refundTotal' IS NULL THEN RAISE EXCEPTION 'A decision must publish its exact allocation'; END IF;
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
