ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "home_first_player_id" uuid REFERENCES "players"("id");
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "home_second_player_id" uuid REFERENCES "players"("id");
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "away_first_player_id" uuid REFERENCES "players"("id");
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "away_second_player_id" uuid REFERENCES "players"("id");

