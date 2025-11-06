DO $$
BEGIN
    CREATE TABLE "strategic_evaluations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_name" text NOT NULL,
        "requested_by" text NOT NULL,
        "requested_by_name" text,
        "channel_id" text,
        "command_text" text,
        "demand_request" jsonb NOT NULL,
        "analysis" jsonb NOT NULL,
        "summary" jsonb NOT NULL,
        "needs_clarification" boolean DEFAULT false NOT NULL,
        "total_score" integer,
        "recommendation" text,
        "confidence" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
EXCEPTION
    WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_strategic_eval_project" ON "strategic_evaluations" USING btree ("project_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_strategic_eval_requested_by" ON "strategic_evaluations" USING btree ("requested_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_strategic_eval_created_at" ON "strategic_evaluations" USING btree ("created_at");
