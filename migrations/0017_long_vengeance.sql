DO $$
BEGIN
    CREATE TABLE "incident_enrichment_states" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "incident_sys_id" text NOT NULL,
        "incident_number" text NOT NULL,
        "case_sys_id" text,
        "case_number" text,
        "enrichment_stage" text DEFAULT 'created' NOT NULL,
        "matched_cis" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "extracted_entities" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "confidence_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "clarification_requested_at" timestamp with time zone,
        "clarification_slack_ts" text,
        "enrichment_attempts" integer DEFAULT 0 NOT NULL,
        "last_work_note_at" timestamp with time zone,
        "last_processed_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
    );
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
    CREATE TABLE "project_interviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" text NOT NULL,
        "candidate_slack_id" text NOT NULL,
        "mentor_slack_id" text,
        "answers" jsonb NOT NULL,
        "questions" jsonb NOT NULL,
        "scoring_prompt" text,
        "match_score" integer NOT NULL,
        "match_summary" text NOT NULL,
        "recommended_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "concerns" text,
        "started_at" timestamp with time zone NOT NULL,
        "completed_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_enrichment_incident_sys_id" ON "incident_enrichment_states" USING btree ("incident_sys_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrichment_case_sys_id" ON "incident_enrichment_states" USING btree ("case_sys_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrichment_stage" ON "incident_enrichment_states" USING btree ("enrichment_stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrichment_last_processed" ON "incident_enrichment_states" USING btree ("last_processed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrichment_created_at" ON "incident_enrichment_states" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_enrichment_stage_processed" ON "incident_enrichment_states" USING btree ("enrichment_stage","last_processed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_interviews_project" ON "project_interviews" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_interviews_candidate" ON "project_interviews" USING btree ("candidate_slack_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_interviews_completed_at" ON "project_interviews" USING btree ("completed_at");
