CREATE TYPE "public"."change_entity" AS ENUM('client', 'milestone', 'task', 'document');--> statement-breakpoint
CREATE TYPE "public"."task_origin" AS ENUM('manual', 'meeting', 'email');--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "change_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"client_id" uuid,
	"meeting_id" uuid,
	"activity_id" uuid,
	"field" text NOT NULL,
	"label" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"evidence_quote" text,
	"evidence_at" real,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "origin" "task_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "evidence_quote" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "evidence_at" real;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_client_idx" ON "change_log" USING btree ("client_id","applied_at");--> statement-breakpoint
CREATE INDEX "change_log_meeting_idx" ON "change_log" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "change_log_entity_idx" ON "change_log" USING btree ("entity_type","entity_id");