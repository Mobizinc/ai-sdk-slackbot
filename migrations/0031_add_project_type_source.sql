-- Add project type/source classifications
-- type: delivery | internal | demand | learning (default: internal)
-- source: spm | github | local (default: local)

ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'internal',
ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'local';

CREATE INDEX IF NOT EXISTS idx_projects_type ON "projects"("type");
CREATE INDEX IF NOT EXISTS idx_projects_source ON "projects"("source");
