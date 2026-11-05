-- Preserve the first declaration across a rejoin. New applications still enforce
-- the current minimum in the service, without rewriting the original declaration.
CREATE OR REPLACE FUNCTION fundicate_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Community' THEN
    IF NEW."governanceProfile" IS DISTINCT FROM OLD."governanceProfile" THEN RAISE EXCEPTION 'Governance profile is immutable'; END IF;
  ELSE
    IF TG_OP='UPDATE' AND OLD."declaredContribution" IS NOT NULL AND (NEW."declaredContribution",NEW."declaredAt") IS DISTINCT FROM (OLD."declaredContribution",OLD."declaredAt") THEN RAISE EXCEPTION 'Contribution declaration is immutable'; END IF;
    IF EXISTS (
      SELECT 1 FROM "Community" c WHERE c.id=NEW."communityId" AND c."governanceProfile"='STRICT' AND (
        (NEW.status='ACTIVE' AND NEW."declaredContribution" IS NULL) OR
        (NEW."declaredContribution" IS NOT NULL AND (TG_OP='INSERT' OR OLD."declaredContribution" IS NULL) AND NEW."declaredContribution"<c."minimumContribution")
      )
    ) THEN RAISE EXCEPTION 'Strict members must record an honest minimum contribution declaration'; END IF;
  END IF;
  RETURN NEW;
END; $$;
