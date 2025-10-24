ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "incident_number" text;--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "incident_sys_id" text;--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "incident_url" text;--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "problem_number" text;--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "problem_sys_id" text;--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "problem_url" text;