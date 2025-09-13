ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "is_started" boolean NOT NULL DEFAULT false;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "phase" varchar(32) NOT NULL DEFAULT 'regular';
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "knockout_round" integer NOT NULL DEFAULT 0;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "regular_round" integer NOT NULL DEFAULT 0;

