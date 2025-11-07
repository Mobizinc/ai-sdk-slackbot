CREATE TABLE "change_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_number" text NOT NULL,
	"change_sys_id" text NOT NULL,
	"component_type" text NOT NULL,
	"component_sys_id" text,
	"payload" jsonb NOT NULL,
	"hmac_signature" text,
	"requested_by" text,
	"status" text DEFAULT 'received' NOT NULL,
	"validation_results" jsonb,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_time_ms" integer,
	"retry_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_change_validations_change_number" ON "change_validations" USING btree ("change_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_change_validations_change_sys_id" ON "change_validations" USING btree ("change_sys_id");--> statement-breakpoint
CREATE INDEX "idx_change_validations_status" ON "change_validations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_change_validations_component_type" ON "change_validations" USING btree ("component_type");--> statement-breakpoint
CREATE INDEX "idx_change_validations_created_at" ON "change_validations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_change_validations_processed_at" ON "change_validations" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "idx_change_validations_status_created" ON "change_validations" USING btree ("status", "created_at");
