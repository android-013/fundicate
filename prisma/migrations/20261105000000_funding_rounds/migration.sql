-- CreateEnum
CREATE TYPE "FundingRoundStatus" AS ENUM ('DRAFT', 'SUBMISSIONS', 'SCREENING', 'SELECTION', 'DECIDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchemeStatus" AS ENUM ('SUBMITTED', 'QUALIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "FundingRound" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposalPolicy" TEXT NOT NULL DEFAULT 'MEMBERS',
    "quorumBps" INTEGER NOT NULL DEFAULT 5000,
    "status" "FundingRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "submissionsCloseAt" TIMESTAMP(3) NOT NULL,
    "screeningOpensAt" TIMESTAMP(3),
    "screeningClosesAt" TIMESTAMP(3),
    "selectionOpensAt" TIMESTAMP(3),
    "selectionClosesAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "winnerSchemeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingScheme" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "recipient" TEXT NOT NULL,
    "supportingUrl" TEXT,
    "status" "SchemeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundElectorate" (
    "roundId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "RoundElectorate_pkey" PRIMARY KEY ("roundId","userId")
);

-- CreateTable
CREATE TABLE "SchemeScreeningVote" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemeScreeningVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundSelectionVote" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundSelectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingRound_communityId_createdAt_idx" ON "FundingRound"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "FundingScheme_roundId_createdAt_idx" ON "FundingScheme"("roundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundingScheme_roundId_id_key" ON "FundingScheme"("roundId", "id");

-- CreateIndex
CREATE INDEX "SchemeScreeningVote_roundId_idx" ON "SchemeScreeningVote"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "SchemeScreeningVote_schemeId_userId_key" ON "SchemeScreeningVote"("schemeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundSelectionVote_roundId_userId_key" ON "RoundSelectionVote"("roundId", "userId");

-- AddForeignKey
ALTER TABLE "FundingRound" ADD CONSTRAINT "FundingRound_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingRound" ADD CONSTRAINT "FundingRound_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingScheme" ADD CONSTRAINT "FundingScheme_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingScheme" ADD CONSTRAINT "FundingScheme_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundElectorate" ADD CONSTRAINT "RoundElectorate_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundElectorate" ADD CONSTRAINT "RoundElectorate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeScreeningVote" ADD CONSTRAINT "SchemeScreeningVote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeScreeningVote" ADD CONSTRAINT "SchemeScreeningVote_roundId_schemeId_fkey" FOREIGN KEY ("roundId", "schemeId") REFERENCES "FundingScheme"("roundId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeScreeningVote" ADD CONSTRAINT "SchemeScreeningVote_roundId_userId_fkey" FOREIGN KEY ("roundId", "userId") REFERENCES "RoundElectorate"("roundId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemeScreeningVote" ADD CONSTRAINT "SchemeScreeningVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSelectionVote" ADD CONSTRAINT "RoundSelectionVote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FundingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSelectionVote" ADD CONSTRAINT "RoundSelectionVote_roundId_schemeId_fkey" FOREIGN KEY ("roundId", "schemeId") REFERENCES "FundingScheme"("roundId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSelectionVote" ADD CONSTRAINT "RoundSelectionVote_roundId_userId_fkey" FOREIGN KEY ("roundId", "userId") REFERENCES "RoundElectorate"("roundId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundSelectionVote" ADD CONSTRAINT "RoundSelectionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive upgrade: existing proposals, votes, preferences and ledger rows are untouched.
ALTER TABLE "FundingRound" ADD CONSTRAINT round_rules CHECK ("proposalPolicy" IN ('MEMBERS','EVERYONE') AND "quorumBps" BETWEEN 1 AND 10000);
ALTER TABLE "FundingScheme" ADD CONSTRAINT positive_scheme_amount CHECK ("amount" > 0);
ALTER TABLE "FundingRound" ADD CONSTRAINT round_winner_scope FOREIGN KEY ("id","winnerSchemeId") REFERENCES "FundingScheme"("roundId","id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FundingRound" ADD CONSTRAINT round_stage_dates CHECK (
  ("screeningClosesAt" IS NULL OR "screeningClosesAt" = "screeningOpensAt" + INTERVAL '24 hours') AND
  ("selectionClosesAt" IS NULL OR "selectionClosesAt" = "selectionOpensAt" + INTERVAL '24 hours') AND
  ("screeningOpensAt" IS NULL OR "screeningOpensAt" >= "submissionsCloseAt") AND
  ("selectionOpensAt" IS NULL OR "selectionOpensAt" >= "screeningOpensAt") AND
  ("decidedAt" IS NULL OR "decidedAt" >= COALESCE("selectionOpensAt","screeningOpensAt"))
);
ALTER TABLE "FundingRound" ADD CONSTRAINT round_stage_shape CHECK (
  ("status" IN ('DRAFT','SUBMISSIONS','CANCELLED') AND "screeningOpensAt" IS NULL AND "screeningClosesAt" IS NULL AND "selectionOpensAt" IS NULL AND "selectionClosesAt" IS NULL AND "decidedAt" IS NULL AND "outcome" IS NULL AND "winnerSchemeId" IS NULL) OR
  ("status" = 'SCREENING' AND "screeningOpensAt" IS NOT NULL AND "screeningClosesAt" IS NOT NULL AND "selectionOpensAt" IS NULL AND "selectionClosesAt" IS NULL AND "decidedAt" IS NULL AND "outcome" IS NULL AND "winnerSchemeId" IS NULL) OR
  ("status" = 'SELECTION' AND "screeningOpensAt" IS NOT NULL AND "screeningClosesAt" IS NOT NULL AND "selectionOpensAt" IS NOT NULL AND "selectionClosesAt" IS NOT NULL AND "decidedAt" IS NULL AND "outcome" IS NULL AND "winnerSchemeId" IS NULL) OR
  ("status" = 'DECIDED' AND "screeningOpensAt" IS NOT NULL AND "screeningClosesAt" IS NOT NULL AND "decidedAt" IS NOT NULL AND "outcome" IS NOT NULL AND (
    ("outcome" = 'NO_QUALIFIED' AND "selectionOpensAt" IS NULL AND "selectionClosesAt" IS NULL AND "winnerSchemeId" IS NULL) OR
    ("outcome" IN ('WINNER_SELECTED','TIED','NO_QUORUM') AND "selectionOpensAt" IS NOT NULL AND "selectionClosesAt" IS NOT NULL AND (("outcome" = 'WINNER_SELECTED' AND "winnerSchemeId" IS NOT NULL) OR ("outcome" <> 'WINNER_SELECTED' AND "winnerSchemeId" IS NULL)))
  ))
);

CREATE FUNCTION fundicate_round_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Funding round history cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Funding rounds start as drafts'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id",NEW."communityId",NEW."creatorId",NEW."createdAt") IS DISTINCT FROM (OLD."id",OLD."communityId",OLD."creatorId",OLD."createdAt") THEN
    RAISE EXCEPTION 'Funding round identity is immutable';
  END IF;
  IF OLD."status" <> 'DRAFT' AND (NEW."title",NEW."description",NEW."proposalPolicy",NEW."quorumBps",NEW."submissionsCloseAt") IS DISTINCT FROM (OLD."title",OLD."description",OLD."proposalPolicy",OLD."quorumBps",OLD."submissionsCloseAt") THEN
    RAISE EXCEPTION 'Published funding round rules are locked';
  END IF;
  IF OLD."status" IN ('SCREENING','SELECTION','DECIDED') AND (NEW."screeningOpensAt",NEW."screeningClosesAt") IS DISTINCT FROM (OLD."screeningOpensAt",OLD."screeningClosesAt") THEN RAISE EXCEPTION 'Screening dates are locked'; END IF;
  IF OLD."status" IN ('SELECTION','DECIDED') AND (NEW."selectionOpensAt",NEW."selectionClosesAt") IS DISTINCT FROM (OLD."selectionOpensAt",OLD."selectionClosesAt") THEN RAISE EXCEPTION 'Selection dates are locked'; END IF;
  IF NEW."status" = OLD."status" THEN
    IF OLD."status" <> 'DRAFT' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Published rounds change only by a stage transition'; END IF;
  ELSIF NOT ((OLD."status"='DRAFT' AND NEW."status" IN ('SUBMISSIONS','CANCELLED')) OR (OLD."status"='SUBMISSIONS' AND NEW."status"='SCREENING') OR (OLD."status"='SCREENING' AND NEW."status" IN ('SELECTION','DECIDED')) OR (OLD."status"='SELECTION' AND NEW."status"='DECIDED')) THEN
    RAISE EXCEPTION 'Invalid funding round transition';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER funding_round_guard BEFORE INSERT OR UPDATE OR DELETE ON "FundingRound" FOR EACH ROW EXECUTE FUNCTION fundicate_round_guard();

CREATE FUNCTION fundicate_scheme_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stage TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Funding scheme history cannot be deleted'; END IF;
  SELECT "status"::text INTO stage FROM "FundingRound" WHERE "id"=NEW."roundId";
  IF TG_OP = 'INSERT' THEN
    IF stage <> 'SUBMISSIONS' OR NEW."status" <> 'SUBMITTED' THEN RAISE EXCEPTION 'Schemes can only be submitted during submissions'; END IF;
  ELSIF stage <> 'SCREENING' OR OLD."status" <> 'SUBMITTED' OR NEW."status" NOT IN ('QUALIFIED','REJECTED') OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
    RAISE EXCEPTION 'Scheme content is immutable; only the screening result can be recorded';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER funding_scheme_guard BEFORE INSERT OR UPDATE OR DELETE ON "FundingScheme" FOR EACH ROW EXECUTE FUNCTION fundicate_scheme_guard();

CREATE FUNCTION fundicate_round_voter_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stage TEXT;
BEGIN
  SELECT r."status"::text INTO stage FROM "FundingRound" r JOIN "CommunityMembership" m ON m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m."status"='ACTIVE' WHERE r."id"=NEW."roundId";
  IF stage IS DISTINCT FROM 'SUBMISSIONS' THEN RAISE EXCEPTION 'Electorate freezes when screening begins'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER round_voter_guard BEFORE INSERT ON "RoundElectorate" FOR EACH ROW EXECUTE FUNCTION fundicate_round_voter_guard();
CREATE TRIGGER immutable_round_electorate BEFORE UPDATE OR DELETE ON "RoundElectorate" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();

CREATE FUNCTION fundicate_round_ballot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "FundingRound"%ROWTYPE;
BEGIN
  SELECT * INTO r FROM "FundingRound" WHERE "id"=NEW."roundId";
  IF NOT EXISTS (SELECT 1 FROM "CommunityMembership" m WHERE m."communityId"=r."communityId" AND m."userId"=NEW."userId" AND m."status"='ACTIVE') THEN RAISE EXCEPTION 'An active membership is required'; END IF;
  IF TG_TABLE_NAME = 'SchemeScreeningVote' THEN
    IF r."status" <> 'SCREENING' OR NEW."createdAt" < r."screeningOpensAt" OR NEW."createdAt" >= r."screeningClosesAt" THEN RAISE EXCEPTION 'Screening is not open'; END IF;
  ELSE
    IF r."status" <> 'SELECTION' OR NEW."createdAt" < r."selectionOpensAt" OR NEW."createdAt" >= r."selectionClosesAt" OR NOT EXISTS (SELECT 1 FROM "FundingScheme" s WHERE s."id"=NEW."schemeId" AND s."roundId"=NEW."roundId" AND s."status"='QUALIFIED') THEN RAISE EXCEPTION 'Choose a qualified scheme during selection'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER screening_ballot_guard BEFORE INSERT ON "SchemeScreeningVote" FOR EACH ROW EXECUTE FUNCTION fundicate_round_ballot_guard();
CREATE TRIGGER selection_ballot_guard BEFORE INSERT ON "RoundSelectionVote" FOR EACH ROW EXECUTE FUNCTION fundicate_round_ballot_guard();
CREATE TRIGGER immutable_screening_ballots BEFORE UPDATE OR DELETE ON "SchemeScreeningVote" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
CREATE TRIGGER immutable_selection_ballots BEFORE UPDATE OR DELETE ON "RoundSelectionVote" FOR EACH ROW EXECUTE FUNCTION fundicate_immutable();
