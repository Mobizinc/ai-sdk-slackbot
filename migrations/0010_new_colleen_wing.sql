CREATE TABLE "cmdb_reconciliation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"entity_value" text NOT NULL,
	"entity_type" text NOT NULL,
	"original_entity_value" text NOT NULL,
	"resolved_entity_value" text,
	"reconciliation_status" text NOT NULL,
	"cmdb_sys_id" text,
	"cmdb_name" text,
	"cmdb_class" text,
	"cmdb_url" text,
	"confidence" real NOT NULL,
	"business_context_match" text,
	"child_task_number" text,
	"child_task_sys_id" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_case_number" ON "cmdb_reconciliation_results" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_case_sys_id" ON "cmdb_reconciliation_results" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_entity_value" ON "cmdb_reconciliation_results" USING btree ("entity_value");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_entity_type" ON "cmdb_reconciliation_results" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_status" ON "cmdb_reconciliation_results" USING btree ("reconciliation_status");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_confidence" ON "cmdb_reconciliation_results" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_cmdb_reconcile_created_at" ON "cmdb_reconciliation_results" USING btree ("created_at");