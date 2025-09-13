ALTER TABLE "matches" ADD COLUMN "tracking_active" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "tracking_started_at" timestamp;