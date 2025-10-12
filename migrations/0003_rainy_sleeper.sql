CREATE TABLE "case_classification_inbound" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"routing_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processing_error" text,
	"workflow_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "case_classification_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"workflow_id" text NOT NULL,
	"classification_json" jsonb NOT NULL,
	"token_usage" jsonb DEFAULT '{"promptTokens":0,"completionTokens":0,"totalTokens":0}'::jsonb NOT NULL,
	"cost" real DEFAULT 0 NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"processing_time_ms" real NOT NULL,
	"servicenow_updated" boolean DEFAULT false NOT NULL,
	"entities_count" integer DEFAULT 0 NOT NULL,
	"similar_cases_count" integer DEFAULT 0 NOT NULL,
	"kb_articles_count" integer DEFAULT 0 NOT NULL,
	"business_intelligence_detected" boolean DEFAULT false NOT NULL,
	"confidence_score" real NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"confidence_score" real NOT NULL,
	"urgency_level" text,
	"reasoning" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quick_summary" text,
	"immediate_next_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"technical_entities" jsonb DEFAULT '{"ip_addresses":[],"systems":[],"users":[],"software":[],"error_codes":[]}'::jsonb NOT NULL,
	"business_intelligence" jsonb DEFAULT '{"project_scope_detected":false,"outside_service_hours":false,"executive_visibility":false,"compliance_impact":false,"financial_impact":false}'::jsonb NOT NULL,
	"similar_cases_count" integer DEFAULT 0 NOT NULL,
	"kb_articles_count" integer DEFAULT 0 NOT NULL,
	"model_used" text NOT NULL,
	"classified_at" timestamp DEFAULT now() NOT NULL,
	"processing_time_ms" real,
	"servicenow_updated" boolean DEFAULT false NOT NULL,
	"work_note_content" text
);
--> statement-breakpoint
CREATE TABLE "case_discovered_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_value" text NOT NULL,
	"confidence" real NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_contexts" ADD COLUMN "slack_channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "business_contexts" ADD COLUMN "cmdb_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "business_contexts" ADD COLUMN "context_stewards" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inbound_case_number" ON "case_classification_inbound" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_inbound_case_sys_id" ON "case_classification_inbound" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_processed" ON "case_classification_inbound" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "idx_inbound_created_at" ON "case_classification_inbound" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_results_case_number" ON "case_classification_results" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_results_workflow_id" ON "case_classification_results" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_results_provider" ON "case_classification_results" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_results_created_at" ON "case_classification_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_results_confidence" ON "case_classification_results" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX "idx_case_number_classifications" ON "case_classifications" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_case_sys_id" ON "case_classifications" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_category" ON "case_classifications" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_classified_at" ON "case_classifications" USING btree ("classified_at");--> statement-breakpoint
CREATE INDEX "idx_confidence_score" ON "case_classifications" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX "idx_entities_case_number" ON "case_discovered_entities" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_entities_case_sys_id" ON "case_discovered_entities" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_entities_type" ON "case_discovered_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_entities_value" ON "case_discovered_entities" USING btree ("entity_value");--> statement-breakpoint
CREATE INDEX "idx_entities_status" ON "case_discovered_entities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_entities_confidence" ON "case_discovered_entities" USING btree ("confidence");