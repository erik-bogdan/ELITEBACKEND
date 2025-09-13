ALTER TABLE "leagues" ADD COLUMN "is_started" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "phase" varchar(32) DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "knockout_round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "regular_round" integer DEFAULT 0 NOT NULL;