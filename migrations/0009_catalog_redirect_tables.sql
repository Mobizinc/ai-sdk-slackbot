CREATE TABLE "catalog_redirect_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" text NOT NULL,
	"case_sys_id" text NOT NULL,
	"client_id" text,
	"client_name" text,
	"request_type" text NOT NULL,
	"confidence" real NOT NULL,
	"confidence_threshold" real NOT NULL,
	"catalog_items_provided" integer NOT NULL,
	"catalog_item_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_closed" boolean NOT NULL,
	"close_state" text,
	"matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submitted_by" text,
	"short_description" text,
	"category" text,
	"subcategory" text,
	"redirected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"catalog_redirect_enabled" boolean DEFAULT true NOT NULL,
	"catalog_redirect_confidence_threshold" real DEFAULT 0.5 NOT NULL,
	"catalog_redirect_auto_close" boolean DEFAULT false NOT NULL,
	"support_contact_info" text,
	"custom_catalog_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "client_settings_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE INDEX "idx_redirect_case_number" ON "catalog_redirect_log" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "idx_redirect_case_sys_id" ON "catalog_redirect_log" USING btree ("case_sys_id");--> statement-breakpoint
CREATE INDEX "idx_redirect_client_id" ON "catalog_redirect_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_redirect_request_type" ON "catalog_redirect_log" USING btree ("request_type");--> statement-breakpoint
CREATE INDEX "idx_redirect_redirected_at" ON "catalog_redirect_log" USING btree ("redirected_at");--> statement-breakpoint
CREATE INDEX "idx_redirect_case_closed" ON "catalog_redirect_log" USING btree ("case_closed");--> statement-breakpoint
CREATE INDEX "idx_client_id" ON "client_settings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_name" ON "client_settings" USING btree ("client_name");--> statement-breakpoint
CREATE INDEX "idx_catalog_redirect_enabled" ON "client_settings" USING btree ("catalog_redirect_enabled");