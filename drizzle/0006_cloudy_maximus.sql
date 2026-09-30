CREATE TYPE "public"."brd_item_kind" AS ENUM('requirement', 'business_rule', 'exception', 'integration', 'pain_point');--> statement-breakpoint
CREATE TYPE "public"."brd_item_status" AS ENUM('open', 'covered', 'dropped');--> statement-breakpoint
CREATE TABLE "brd_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"sections" jsonb NOT NULL,
	"model" text,
	"prompt_version" text,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brd_gap_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"source_name" text NOT NULL,
	"source_text" text NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brd_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"meeting_id" uuid,
	"kind" "brd_item_kind" DEFAULT 'requirement' NOT NULL,
	"text" text NOT NULL,
	"group_name" text,
	"evidence_quote" text,
	"evidence_at" real,
	"status" "brd_item_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "brd_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brd_drafts" ADD CONSTRAINT "brd_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brd_gap_checks" ADD CONSTRAINT "brd_gap_checks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brd_items" ADD CONSTRAINT "brd_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brd_items" ADD CONSTRAINT "brd_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brd_drafts_client_idx" ON "brd_drafts" USING btree ("client_id","version");--> statement-breakpoint
CREATE INDEX "brd_gap_checks_client_idx" ON "brd_gap_checks" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "brd_items_client_idx" ON "brd_items" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "brd_items_meeting_idx" ON "brd_items" USING btree ("meeting_id");