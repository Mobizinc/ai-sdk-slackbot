CREATE TABLE "case_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"escalation_reason" text NOT NULL,
	"business_intelligence_score" integer,
	"trigger_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"slack_channel" text NOT NULL,
	"slack_thread_ts" text,
	"slack_message_ts" text NOT NULL,
	"assigned_to" text,
	"assignment_group" text,
	"company_name" text,
	"category" text,
	"subcategory" text,
	"priority" text,
	"urgency" text,
	"status" text DEFAULT 'active' NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_action" text,
	"resolved_at" timestamp with time zone,
	"llm_generated" boolean DEFAULT false NOT NULL,
	"token_usage" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_escalations_case_number" ON "case_escalations" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_escalations_case_sys_id" ON "case_escalations" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_escalations_status" ON "case_escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_escalations_channel" ON "case_escalations" USING btree ("slack_channel");--> statement-breakpoint
CREATE INDEX "idx_escalations_created_at" ON "case_escalations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_escalations_active_case" ON "case_escalations" USING btree ("case_number","status");