CREATE TABLE "business_contexts" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_name" text NOT NULL,
	"entity_type" text NOT NULL,
	"industry" text,
	"description" text,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"technology_portfolio" text,
	"service_details" text,
	"key_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_contexts_entity_name_unique" UNIQUE("entity_name")
);
--> statement-breakpoint
ALTER TABLE "case_contexts" ADD COLUMN "channel_topic" text;--> statement-breakpoint
ALTER TABLE "case_contexts" ADD COLUMN "channel_purpose" text;--> statement-breakpoint
CREATE INDEX "idx_entity_name" ON "business_contexts" USING btree ("entity_name");--> statement-breakpoint
CREATE INDEX "idx_entity_type" ON "business_contexts" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_is_active" ON "business_contexts" USING btree ("is_active");