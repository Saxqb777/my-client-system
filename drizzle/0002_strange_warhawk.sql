CREATE TYPE "public"."meeting_status" AS ENUM('planned', 'held', 'minuted', 'cancelled');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mom_format" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "status" "meeting_status" DEFAULT 'held' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;