-- SPM (Service Portfolio Management) Integration
-- Extends projects table with ServiceNow SPM linkage fields

-- Add SPM integration fields to projects table
ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "spm_sys_id" text,
ADD COLUMN IF NOT EXISTS "spm_number" text,
ADD COLUMN IF NOT EXISTS "spm_state" text,
ADD COLUMN IF NOT EXISTS "spm_priority" text,
ADD COLUMN IF NOT EXISTS "spm_percent_complete" integer,
ADD COLUMN IF NOT EXISTS "spm_lifecycle_stage" text,
ADD COLUMN IF NOT EXISTS "spm_project_manager_sys_id" text,
ADD COLUMN IF NOT EXISTS "spm_project_manager_name" text,
ADD COLUMN IF NOT EXISTS "spm_assignment_group_sys_id" text,
ADD COLUMN IF NOT EXISTS "spm_assignment_group_name" text,
ADD COLUMN IF NOT EXISTS "spm_parent_sys_id" text,
ADD COLUMN IF NOT EXISTS "spm_parent_number" text,
ADD COLUMN IF NOT EXISTS "spm_portfolio_name" text,
ADD COLUMN IF NOT EXISTS "spm_url" text,
ADD COLUMN IF NOT EXISTS "spm_opened_at" timestamptz,
ADD COLUMN IF NOT EXISTS "spm_closed_at" timestamptz,
ADD COLUMN IF NOT EXISTS "spm_due_date" timestamptz,
ADD COLUMN IF NOT EXISTS "spm_last_synced_at" timestamptz,
ADD COLUMN IF NOT EXISTS "spm_sync_enabled" boolean DEFAULT false;
--> statement-breakpoint

-- Add indexes for SPM lookups
CREATE INDEX IF NOT EXISTS idx_projects_spm_sys_id ON "projects"("spm_sys_id") WHERE "spm_sys_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_spm_number ON "projects"("spm_number") WHERE "spm_number" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_spm_state ON "projects"("spm_state") WHERE "spm_state" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_spm_sync ON "projects"("spm_sync_enabled", "spm_last_synced_at");
--> statement-breakpoint

-- Add comments explaining SPM integration
COMMENT ON COLUMN "projects"."spm_sys_id" IS 'ServiceNow SPM project sys_id - links to pm_project table';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_number" IS 'ServiceNow SPM project number (e.g., PRJ0001234)';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_state" IS 'ServiceNow SPM project state (-5=Pending, -4=Open, -3=Work in Progress, -2=On Hold, 0=Closed Complete, 1=Closed Incomplete, 2=Closed Cancelled)';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_priority" IS 'ServiceNow SPM project priority (1-5)';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_percent_complete" IS 'ServiceNow SPM project completion percentage (0-100)';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_lifecycle_stage" IS 'ServiceNow SPM project lifecycle phase';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_project_manager_sys_id" IS 'ServiceNow SPM project manager user sys_id';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_project_manager_name" IS 'ServiceNow SPM project manager display name';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_assignment_group_sys_id" IS 'ServiceNow SPM assignment group sys_id';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_assignment_group_name" IS 'ServiceNow SPM assignment group display name';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_parent_sys_id" IS 'ServiceNow SPM parent project sys_id';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_parent_number" IS 'ServiceNow SPM parent project number';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_portfolio_name" IS 'ServiceNow SPM portfolio display name';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_url" IS 'Direct URL to ServiceNow SPM project record';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_opened_at" IS 'ServiceNow SPM project opened date';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_closed_at" IS 'ServiceNow SPM project closed date';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_due_date" IS 'ServiceNow SPM project due date';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_last_synced_at" IS 'Last time SPM data was synced from ServiceNow';
--> statement-breakpoint
COMMENT ON COLUMN "projects"."spm_sync_enabled" IS 'Whether to automatically sync with ServiceNow SPM';
--> statement-breakpoint
