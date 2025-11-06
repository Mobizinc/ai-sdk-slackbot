CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"status" text NOT NULL DEFAULT 'draft',
	"github_url" text,
	"summary" text NOT NULL,
	"background" text,
	"tech_stack" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"skills_required" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"skills_nice_to_have" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"difficulty_level" text,
	"estimated_hours" text,
	"learning_opportunities" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"open_tasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"mentor_slack_user_id" text,
	"mentor_name" text,
	"interview_config" jsonb DEFAULT NULL,
	"standup_config" jsonb DEFAULT NULL,
	"max_candidates" integer,
	"posted_date" timestamptz,
	"expires_date" timestamptz,
	"channel_id" text,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status");
