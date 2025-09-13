ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "home_league_team_id" uuid REFERENCES "league_teams"("id");
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "away_league_team_id" uuid REFERENCES "league_teams"("id");

