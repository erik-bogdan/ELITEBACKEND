ALTER TABLE "league_teams" ADD COLUMN "invite_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "league_teams" ADD COLUMN "invite_sent_date" timestamp;