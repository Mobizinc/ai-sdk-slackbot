CREATE TABLE "case_contexts" (
	"case_number" text NOT NULL,
	"thread_ts" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_name" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "case_contexts_case_number_thread_ts_pk" PRIMARY KEY("case_number","thread_ts")
);
--> statement-breakpoint
CREATE TABLE "case_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"thread_ts" text NOT NULL,
	"user_id" text NOT NULL,
	"message_text" text NOT NULL,
	"message_timestamp" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_generation_states" (
	"case_number" text NOT NULL,
	"thread_ts" text NOT NULL,
	"channel_id" text NOT NULL,
	"state" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"user_responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assessment_score" integer,
	"missing_info" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_generation_states_case_number_thread_ts_pk" PRIMARY KEY("case_number","thread_ts")
);
--> statement-breakpoint
CREATE INDEX "idx_resolved" ON "case_contexts" USING btree ("is_resolved","notified");--> statement-breakpoint
CREATE INDEX "idx_case_number" ON "case_contexts" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_last_updated" ON "case_contexts" USING btree ("last_updated");--> statement-breakpoint
CREATE INDEX "idx_case_thread" ON "case_messages" USING btree ("case_number","thread_ts");--> statement-breakpoint
CREATE INDEX "idx_timestamp" ON "case_messages" USING btree ("message_timestamp");--> statement-breakpoint
CREATE INDEX "idx_state" ON "kb_generation_states" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_last_updated_state" ON "kb_generation_states" USING btree ("last_updated");