CREATE OR REPLACE FUNCTION portable_native_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='ChainVault' THEN
    IF NOT EXISTS (SELECT 1 FROM "FundingRound" r JOIN "RoundDecision" d ON d."roundId"=r.id WHERE r.id=NEW."roundId" AND r."communityId"=NEW."communityId" AND r."rulesVersion"=4 AND r.status='DECIDED' AND d."vetoFinalizedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Native pool requires a final scoped V4 decision'; END IF;
  ELSIF TG_TABLE_NAME='ChainObservation' THEN
    IF NOT EXISTS (SELECT 1 FROM "ChainOperation" o WHERE o.id=NEW."operationId" AND o."vaultId"=NEW."vaultId" AND o."transactionHash"=NEW."transactionHash") THEN RAISE EXCEPTION 'Observation does not match its immutable operation'; END IF;
  ELSIF TG_TABLE_NAME='FundingRound' THEN
    IF TG_OP='UPDATE' AND NEW."templateRevisionId" IS DISTINCT FROM OLD."templateRevisionId" THEN RAISE EXCEPTION 'Template provenance is immutable'; END IF;
    IF NEW."templateRevisionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "RoundTemplateRevision" v JOIN "RoundTemplate" t ON t.id=v."templateId" WHERE v.id=NEW."templateRevisionId" AND t."communityId"=NEW."communityId") THEN RAISE EXCEPTION 'Template crosses community scope'; END IF;
  END IF;
  RETURN NEW;
END $$;
