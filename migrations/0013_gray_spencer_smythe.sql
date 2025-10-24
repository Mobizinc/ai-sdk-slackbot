ALTER TABLE "call_interactions" ADD COLUMN "servicenow_interaction_sys_id" text;--> statement-breakpoint
ALTER TABLE "call_interactions" ADD COLUMN "servicenow_interaction_number" text;--> statement-breakpoint
ALTER TABLE "call_interactions" ADD COLUMN "servicenow_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_call_interactions_sn_interaction" ON "call_interactions" USING btree ("servicenow_interaction_sys_id");