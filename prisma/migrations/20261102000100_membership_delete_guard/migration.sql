CREATE OR REPLACE FUNCTION fundicate_check_administrator() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  IF TG_TABLE_NAME='Community' THEN cid:=NEW.id;
  ELSIF TG_OP='DELETE' THEN cid:=OLD."communityId";
  ELSE cid:=NEW."communityId"; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Community" c JOIN "CommunityMembership" m ON m."communityId"=c.id AND m."userId"=c."adminId" WHERE c.id=cid AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Fundicate: the sole administrator must be an active member';
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER membership_administrator ON "CommunityMembership";
CREATE CONSTRAINT TRIGGER membership_administrator AFTER INSERT OR UPDATE OR DELETE ON "CommunityMembership" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fundicate_check_administrator();
