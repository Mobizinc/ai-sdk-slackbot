-- Muscle Memory Tables for Agent Learning
-- Stores high-quality agent interactions for semantic retrieval
-- Requires pgvector extension (installed in 0026)

CREATE TABLE "exemplar_quality_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exemplar_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"signal_value" text NOT NULL,
	"signal_weight" real NOT NULL,
	"signal_metadata" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muscle_memory_exemplars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" text NOT NULL,
	"interaction_type" text NOT NULL,
	"input_context" jsonb NOT NULL,
	"action_taken" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"embedding" vector(1536),
	"quality_score" real NOT NULL,
	"quality_signals" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exemplar_quality_signals" ADD CONSTRAINT "exemplar_quality_signals_exemplar_id_muscle_memory_exemplars_id_fk" FOREIGN KEY ("exemplar_id") REFERENCES "public"."muscle_memory_exemplars"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_quality_signals_exemplar_id" ON "exemplar_quality_signals" USING btree ("exemplar_id");
--> statement-breakpoint
CREATE INDEX "idx_quality_signals_type" ON "exemplar_quality_signals" USING btree ("signal_type");
--> statement-breakpoint
CREATE INDEX "idx_quality_signals_recorded_at" ON "exemplar_quality_signals" USING btree ("recorded_at");
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_embedding_hnsw" ON "muscle_memory_exemplars" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_interaction_type" ON "muscle_memory_exemplars" USING btree ("interaction_type");
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_quality_score" ON "muscle_memory_exemplars" USING btree ("quality_score");
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_case_number" ON "muscle_memory_exemplars" USING btree ("case_number");
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_created_at" ON "muscle_memory_exemplars" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "idx_muscle_memory_type_quality" ON "muscle_memory_exemplars" USING btree ("interaction_type","quality_score");
