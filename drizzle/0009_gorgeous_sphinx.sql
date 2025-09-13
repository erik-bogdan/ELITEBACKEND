ALTER TABLE "league_teams" ADD COLUMN "heir" uuid;--> statement-breakpoint
ALTER TABLE "league_teams" ADD COLUMN "decline_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_heir_teams_id_fk" FOREIGN KEY ("heir") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;