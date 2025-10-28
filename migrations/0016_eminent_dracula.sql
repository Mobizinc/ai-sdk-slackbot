CREATE TABLE "interactive_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_ts" text NOT NULL,
	"thread_ts" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_interactive_channel_message" ON "interactive_states" USING btree ("channel_id","message_ts");--> statement-breakpoint
CREATE INDEX "idx_interactive_type" ON "interactive_states" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_interactive_status" ON "interactive_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_interactive_expires_at" ON "interactive_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_interactive_created_at" ON "interactive_states" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_interactive_type_pending" ON "interactive_states" USING btree ("type","status");