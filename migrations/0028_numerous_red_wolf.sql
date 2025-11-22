CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_type" text NOT NULL,
	"workflow_reference_id" text NOT NULL,
	"current_state" text NOT NULL,
	"last_transition_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transition_reason" text,
	"context_key" text,
	"correlation_id" text,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_modified_by" text
);
--> statement-breakpoint
CREATE INDEX "idx_workflows_type" ON "workflows" USING btree ("workflow_type");--> statement-breakpoint
CREATE INDEX "idx_workflows_reference_id" ON "workflows" USING btree ("workflow_reference_id");--> statement-breakpoint
CREATE INDEX "idx_workflows_current_state" ON "workflows" USING btree ("current_state");--> statement-breakpoint
CREATE INDEX "idx_workflows_context_key" ON "workflows" USING btree ("context_key");--> statement-breakpoint
CREATE INDEX "idx_workflows_expires_at" ON "workflows" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_active_workflow" ON "workflows" USING btree ("workflow_type","workflow_reference_id") WHERE "current_state" NOT IN ('COMPLETED', 'FAILED', 'EXPIRED');