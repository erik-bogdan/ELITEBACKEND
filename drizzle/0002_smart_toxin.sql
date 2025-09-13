CREATE TABLE "team_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teamId" uuid NOT NULL,
	"playerId" uuid NOT NULL,
	"seasonId" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_seasonId_seasons_id_fk" FOREIGN KEY ("seasonId") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;