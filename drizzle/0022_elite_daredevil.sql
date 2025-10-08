ALTER TABLE "matches" ADD COLUMN "is_delayed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "delayed_round" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "delayed_date" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "delayed_time" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "delayed_table" integer;