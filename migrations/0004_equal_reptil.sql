CREATE TABLE "servicenow_category_sync_log" (
	"sync_id" serial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"element" text NOT NULL,
	"started_at_utc" timestamp NOT NULL,
	"completed_at_utc" timestamp,
	"status" text NOT NULL,
	"choices_fetched" integer,
	"choices_added" integer,
	"choices_updated" integer,
	"choices_removed" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "servicenow_choice_cache" (
	"choice_id" serial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"element" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"inactive" boolean DEFAULT false NOT NULL,
	"dependent_value" text,
	"last_synced_utc" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sync_status" ON "servicenow_category_sync_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sync_started_at" ON "servicenow_category_sync_log" USING btree ("started_at_utc");--> statement-breakpoint
CREATE INDEX "idx_unique_choice" ON "servicenow_choice_cache" USING btree ("table_name","element","value","dependent_value");--> statement-breakpoint
CREATE INDEX "idx_element" ON "servicenow_choice_cache" USING btree ("element");--> statement-breakpoint
CREATE INDEX "idx_inactive" ON "servicenow_choice_cache" USING btree ("inactive");--> statement-breakpoint
CREATE INDEX "idx_last_synced" ON "servicenow_choice_cache" USING btree ("last_synced_utc");