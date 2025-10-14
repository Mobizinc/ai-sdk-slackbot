-- Add target_table column to category_mismatch_log table
ALTER TABLE "category_mismatch_log" ADD COLUMN "target_table" text DEFAULT 'sn_customerservice_case' NOT NULL;
--> statement-breakpoint
-- Add index for target_table
CREATE INDEX "idx_mismatch_target_table" ON "category_mismatch_log" USING btree ("target_table");