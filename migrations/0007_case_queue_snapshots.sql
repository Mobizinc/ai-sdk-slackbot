CREATE TABLE IF NOT EXISTS "case_queue_snapshots" (
    "id" serial PRIMARY KEY,
    "snapshot_at" timestamptz NOT NULL DEFAULT now(),
    "assigned_to" text NOT NULL,
    "assigned_to_email" text,
    "assignment_group" text,
    "open_cases" integer NOT NULL,
    "high_priority_cases" integer NOT NULL DEFAULT 0,
    "escalated_cases" integer NOT NULL DEFAULT 0,
    "last_seen_utc" timestamptz,
    "source" text NOT NULL DEFAULT 'azure_sql',
    "raw_payload" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_case_queue_snapshot" ON "case_queue_snapshots" ("snapshot_at", "assigned_to");
CREATE INDEX IF NOT EXISTS "idx_case_queue_snapshot_timestamp" ON "case_queue_snapshots" ("snapshot_at");
CREATE INDEX IF NOT EXISTS "idx_case_queue_snapshot_assignee" ON "case_queue_snapshots" ("assigned_to");
