-- Add new columns to project_interviews table for enhanced matching
ALTER TABLE "project_interviews" ADD COLUMN "skill_gaps" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "onboarding_recommendations" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "strengths" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "time_to_productivity" text;
--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "interest_id" uuid;
--> statement-breakpoint
CREATE INDEX "idx_project_interviews_interest" ON "project_interviews" USING btree ("interest_id");
--> statement-breakpoint
-- Create project_interests table to track candidate interest and prevent duplicates
CREATE TABLE "project_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"candidate_slack_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"interview_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"abandoned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_project_interests_project" ON "project_interests" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_project_interests_candidate" ON "project_interests" USING btree ("candidate_slack_id");
--> statement-breakpoint
CREATE INDEX "idx_project_interests_status" ON "project_interests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_project_interests_project_candidate" ON "project_interests" USING btree ("project_id", "candidate_slack_id");
--> statement-breakpoint
CREATE INDEX "idx_project_interests_created_at" ON "project_interests" USING btree ("created_at");
