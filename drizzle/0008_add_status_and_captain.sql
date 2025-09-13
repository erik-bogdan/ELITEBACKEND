-- Add status column to league_teams with default 'pending'
ALTER TABLE "league_teams" ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'pending';

-- Add captain column to team_players with default false
ALTER TABLE "team_players" ADD COLUMN IF NOT EXISTS "captain" boolean NOT NULL DEFAULT false;


