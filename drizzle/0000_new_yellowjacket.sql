CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_subscriptions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "league_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leagueId" uuid NOT NULL,
	"teamId" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seasonId" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sub_name" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"logo" text,
	"slug" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"description" text,
	"properties" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leagueId" uuid NOT NULL,
	"teamId" uuid NOT NULL,
	"homeTeamId" uuid NOT NULL,
	"awayTeamId" uuid NOT NULL,
	"home_team_score" integer NOT NULL,
	"away_team_score" integer NOT NULL,
	"homeTeamBestPlayerId" uuid,
	"awayTeamBestPlayerId" uuid,
	"match_date" timestamp NOT NULL,
	"match_time" timestamp NOT NULL,
	"match_status" varchar(255) NOT NULL,
	"match_type" varchar(255) NOT NULL,
	"match_round" integer NOT NULL,
	"match_table" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "news_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"newsId" uuid NOT NULL,
	"language" varchar(10) NOT NULL,
	"title" varchar(255) NOT NULL,
	"lead" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "player_mvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leagueId" uuid NOT NULL,
	"teamId" uuid NOT NULL,
	"playerId" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"teamId" uuid NOT NULL,
	"birth_date" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"logo" text,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"lang" text DEFAULT 'en',
	"nickname" text NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_leagueId_leagues_id_fk" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_teams" ADD CONSTRAINT "league_teams_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_seasonId_seasons_id_fk" FOREIGN KEY ("seasonId") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_leagueId_leagues_id_fk" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_homeTeamId_teams_id_fk" FOREIGN KEY ("homeTeamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_awayTeamId_teams_id_fk" FOREIGN KEY ("awayTeamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_homeTeamBestPlayerId_players_id_fk" FOREIGN KEY ("homeTeamBestPlayerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_awayTeamBestPlayerId_players_id_fk" FOREIGN KEY ("awayTeamBestPlayerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_translations" ADD CONSTRAINT "news_translations_newsId_news_id_fk" FOREIGN KEY ("newsId") REFERENCES "public"."news"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_mvps" ADD CONSTRAINT "player_mvps_leagueId_leagues_id_fk" FOREIGN KEY ("leagueId") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_mvps" ADD CONSTRAINT "player_mvps_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_mvps" ADD CONSTRAINT "player_mvps_playerId_players_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_teamId_teams_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;