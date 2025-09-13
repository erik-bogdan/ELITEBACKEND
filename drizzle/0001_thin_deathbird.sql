ALTER TABLE "players" RENAME COLUMN "name" TO "nickname";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "first_name" varchar(255);--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "email" varchar(255);