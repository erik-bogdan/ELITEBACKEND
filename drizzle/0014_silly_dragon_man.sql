ALTER TABLE "matches" ADD COLUMN "home_first_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_second_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_first_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_second_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_first_player_id_players_id_fk" FOREIGN KEY ("home_first_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_second_player_id_players_id_fk" FOREIGN KEY ("home_second_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_first_player_id_players_id_fk" FOREIGN KEY ("away_first_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_second_player_id_players_id_fk" FOREIGN KEY ("away_second_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;