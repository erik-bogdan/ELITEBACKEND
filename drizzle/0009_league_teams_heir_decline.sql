ALTER TABLE "league_teams" ADD COLUMN IF NOT EXISTS "heir" uuid REFERENCES "teams"("id");
ALTER TABLE "league_teams" ADD COLUMN IF NOT EXISTS "decline_reason" varchar(64);

