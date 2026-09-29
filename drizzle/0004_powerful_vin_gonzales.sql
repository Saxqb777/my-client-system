CREATE TYPE "public"."meeting_output_kind" AS ENUM('details', 'notes');--> statement-breakpoint
CREATE TYPE "public"."meeting_processing" AS ENUM('received', 'processing', 'processed', 'needs_review', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meeting_source" AS ENUM('app', 'upload', 'mac_helper', 'import');--> statement-breakpoint
CREATE TYPE "public"."vocabulary_type" AS ENUM('client', 'person', 'product', 'acronym');--> statement-breakpoint
CREATE TABLE "meeting_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" "meeting_output_kind" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"full_text" text DEFAULT '' NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(full_text, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"type" "vocabulary_type" DEFAULT 'acronym' NOT NULL,
	"meaning" text,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "duration_min" integer;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "source" "meeting_source" DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_title" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "other_work" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "match_confidence" real;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "match_reason" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "processing" "meeting_processing";--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ingest_hash" text;--> statement-breakpoint
ALTER TABLE "meeting_outputs" ADD CONSTRAINT "meeting_outputs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_transcripts" ADD CONSTRAINT "meeting_transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_outputs_meeting_kind_idx" ON "meeting_outputs" USING btree ("meeting_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_transcripts_meeting_idx" ON "meeting_transcripts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_transcripts_search_idx" ON "meeting_transcripts" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_term_idx" ON "vocabulary" USING btree (lower("term"));--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_ingest_hash_idx" ON "meetings" USING btree ("ingest_hash");--> statement-breakpoint
CREATE INDEX "meetings_processing_idx" ON "meetings" USING btree ("processing");