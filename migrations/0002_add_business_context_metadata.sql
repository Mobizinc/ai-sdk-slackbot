ALTER TABLE "business_contexts"
  ADD COLUMN "slack_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "cmdb_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;
