CREATE TABLE "player_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playerId" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "player_invitations" ADD CONSTRAINT "player_invitations_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;