-- Add Service Portfolio Classification columns to case_classification_results
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "service_offering" text;
--> statement-breakpoint
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "application_service" text;
--> statement-breakpoint
-- Add Service Portfolio Classification columns to case_classifications
ALTER TABLE "case_classifications" ADD COLUMN IF NOT EXISTS "service_offering" text;
--> statement-breakpoint
ALTER TABLE "case_classifications" ADD COLUMN IF NOT EXISTS "application_service" text;
