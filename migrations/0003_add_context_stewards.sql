ALTER TABLE "business_contexts"
  ADD COLUMN "context_stewards" jsonb DEFAULT '[]'::jsonb NOT NULL;
