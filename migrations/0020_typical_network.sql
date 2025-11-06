DO $$
BEGIN
	CREATE TABLE "project_initiation_requests" (
		"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
		"project_id" text NOT NULL,
		"requested_by" text NOT NULL,
		"requested_by_name" text,
		"idea_summary" text,
		"context_summary" text,
		"llm_model" text,
		"status" text DEFAULT 'drafted' NOT NULL,
		"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
		"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"raw_response" text,
		"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
		"created_at" timestamp with time zone DEFAULT now() NOT NULL,
		"updated_at" timestamp with time zone DEFAULT now() NOT NULL
	);
EXCEPTION
	WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	CREATE TABLE "projects" (
		"id" text PRIMARY KEY NOT NULL,
		"name" text NOT NULL,
		"status" text DEFAULT 'draft' NOT NULL,
		"github_url" text,
		"summary" text NOT NULL,
		"background" text,
		"tech_stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"skills_required" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"skills_nice_to_have" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"difficulty_level" text,
		"estimated_hours" text,
		"learning_opportunities" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"open_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
		"mentor_slack_user_id" text,
		"mentor_name" text,
		"interview_config" jsonb DEFAULT 'null'::jsonb,
		"standup_config" jsonb DEFAULT 'null'::jsonb,
		"max_candidates" integer,
		"posted_date" timestamp with time zone,
		"expires_date" timestamp with time zone,
		"channel_id" text,
		"created_at" timestamp with time zone DEFAULT now() NOT NULL,
		"updated_at" timestamp with time zone DEFAULT now() NOT NULL
	);
EXCEPTION
	WHEN duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_initiation_project" ON "project_initiation_requests" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_initiation_status" ON "project_initiation_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_initiation_requester" ON "project_initiation_requests" USING btree ("requested_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "projects" USING btree ("status");
