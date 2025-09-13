ALTER TABLE "league_teams" ADD COLUMN IF NOT EXISTS "invite_sent" boolean NOT NULL DEFAULT false;
ALTER TABLE "league_teams" ADD COLUMN IF NOT EXISTS "invite_sent_date" timestamp;

