ALTER TABLE "project_standup_responses"
  ADD COLUMN "context_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "insights" jsonb NOT NULL DEFAULT '{}'::jsonb;
