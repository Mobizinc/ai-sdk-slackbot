-- Prompts & Prompt Versions
-- Centralized storage for LLM prompts with version history

CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_prompts_name" ON "prompts" USING btree ("name");
--> statement-breakpoint
CREATE INDEX "idx_prompts_type" ON "prompts" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "idx_prompts_is_active" ON "prompts" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "idx_prompts_type_active" ON "prompts" USING btree ("type","is_active");
--> statement-breakpoint

CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"change_notes" text
);
--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_prompt_versions_prompt_id" ON "prompt_versions" USING btree ("prompt_id");
--> statement-breakpoint
CREATE INDEX "idx_prompt_versions_version" ON "prompt_versions" USING btree ("version");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_prompt_version" ON "prompt_versions" USING btree ("prompt_id","version");
