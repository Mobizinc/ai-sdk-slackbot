ALTER TABLE "project_interviews" ADD COLUMN "question_source" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_interviews" ADD COLUMN "generator_model" text;