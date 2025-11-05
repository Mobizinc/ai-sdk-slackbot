CREATE TABLE "project_standup_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standup_id" uuid NOT NULL,
	"participant_slack_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"blocker_flag" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_standups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"collect_until" timestamp with time zone NOT NULL,
	"channel_id" text,
	"status" text DEFAULT 'collecting' NOT NULL,
	"summary" jsonb DEFAULT 'null'::jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "status" text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_project_standup_responses_standup" ON "project_standup_responses" USING btree ("standup_id");--> statement-breakpoint
CREATE INDEX "idx_project_standup_responses_participant" ON "project_standup_responses" USING btree ("participant_slack_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_project_standup_participant" ON "project_standup_responses" USING btree ("standup_id","participant_slack_id");--> statement-breakpoint
CREATE INDEX "idx_project_standups_project" ON "project_standups" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_standups_status" ON "project_standups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_standups_scheduled" ON "project_standups" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_project_interviews_status" ON "project_interviews" USING btree ("status");