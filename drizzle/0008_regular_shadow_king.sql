ALTER TABLE "league_teams" ADD COLUMN "status" varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_players" ADD COLUMN "captain" boolean DEFAULT false NOT NULL;