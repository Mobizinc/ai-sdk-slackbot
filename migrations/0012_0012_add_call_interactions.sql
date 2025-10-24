CREATE TABLE "call_interactions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"contact_id" text,
	"case_number" text,
	"direction" text,
	"ani" text,
	"dnis" text,
	"agent_id" text,
	"agent_name" text,
	"queue_name" text,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"duration_seconds" integer,
	"wrap_up_code" text,
	"recording_id" text,
	"transcript_status" text DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"language" text,
	"transcript_text" text,
	"transcript_json" jsonb,
	"audio_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_transcripts" ADD CONSTRAINT "call_transcripts_session_id_call_interactions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."call_interactions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_call_interactions_case" ON "call_interactions" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_call_interactions_start" ON "call_interactions" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_call_interactions_transcript_status" ON "call_interactions" USING btree ("transcript_status");--> statement-breakpoint
CREATE INDEX "idx_call_transcripts_status" ON "call_transcripts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_call_transcripts_session" ON "call_transcripts" USING btree ("session_id");