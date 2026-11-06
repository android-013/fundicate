-- A review root has no score of its own. Its first immutable revision must be
-- committed atomically; missing data can never manufacture a one-star rating.
CREATE FUNCTION fundicate_reputation_initial_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM "ReputationRevision" WHERE "reviewId"=NEW.id AND revision=1) THEN
    RAISE EXCEPTION 'A review requires its initial written score revision before commit';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER reputation_initial_revision AFTER INSERT ON "ReputationReview"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_reputation_initial_revision();
