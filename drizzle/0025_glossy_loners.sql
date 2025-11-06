CREATE TABLE "live_match_poll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"groupMatchId" uuid NOT NULL,
	"question" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_match_poll_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pollId" uuid NOT NULL,
	"text" varchar(255) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_match_poll_vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"anonymous_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_anonymous_user_poll" UNIQUE("poll_id","anonymous_user_id")
);
--> statement-breakpoint
ALTER TABLE "live_matches_group" ADD COLUMN "active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "live_match_poll" ADD CONSTRAINT "live_match_poll_groupMatchId_live_matches_group_matches_id_fk" FOREIGN KEY ("groupMatchId") REFERENCES "public"."live_matches_group_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_match_poll_option" ADD CONSTRAINT "live_match_poll_option_pollId_live_match_poll_id_fk" FOREIGN KEY ("pollId") REFERENCES "public"."live_match_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_match_poll_vote" ADD CONSTRAINT "live_match_poll_vote_poll_id_live_match_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."live_match_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_match_poll_vote" ADD CONSTRAINT "live_match_poll_vote_option_id_live_match_poll_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."live_match_poll_option"("id") ON DELETE cascade ON UPDATE no action;