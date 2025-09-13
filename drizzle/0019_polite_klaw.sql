CREATE TABLE "player_gameday_mvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seasonId" uuid NOT NULL,
	"teamId" uuid NOT NULL,
	"playerId" uuid NOT NULL,
	"game_day" integer DEFAULT 0 NOT NULL,
	"mvp_type" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "player_gameday_mvps" ADD CONSTRAINT "player_gameday_mvps_seasonId_seasons_id_fk" FOREIGN KEY ("seasonId") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_gameday_mvps" ADD CONSTRAINT "player_gameday_mvps_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_gameday_mvps" ADD CONSTRAINT "player_gameday_mvps_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;