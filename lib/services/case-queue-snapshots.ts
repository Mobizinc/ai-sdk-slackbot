import { config } from "../config";
import { ConnectionPool } from "mssql";
import { sql as drizzleSql, desc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { caseQueueSnapshots } from "../db/schema";
import { getAllowedMobizDomains, isMobizEmail } from "./mobiz-filter";

const CASE_QUEUE_QUERY = `
SELECT
    COALESCE(NULLIF(c.assigned_to_name, ''), 'Unassigned') AS assigned_to_name,
    c.assigned_to_email,
    c.assignment_group_name,
    c.account_name,
    c.priority_code,
    c.active_escalation,
    c.last_seen_utc
FROM dbo.vw_customer_case_current AS c
WHERE c.state NOT IN ('Closed', 'Resolved', '7', '3', '6');`;

export interface CaseQueueRow {
  assignedToName: string;
  assignedToEmail: string | null;
  assignmentGroupName: string | null;
  openCases: number;
  highPriorityCases: number;
  escalatedCases: number;
  lastSeenUtc: Date | null;
  accountBreakdown?: Record<string, number>;
}

type SqlConnectionConfig = {
  user?: string;
  password?: string;
  server: string;
  port?: number;
  database: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
  };
  connectionTimeout?: number;
};

type ParseResult = {
  config: SqlConnectionConfig;
};

type DrizzleDb = NonNullable<ReturnType<typeof getDb>>;

let hasEnsuredTable = false;

async function ensureCaseQueueSnapshotTable(db: DrizzleDb) {
  if (hasEnsuredTable) {
    return;
  }

  await db.execute(drizzleSql`
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
    )
  `);

  await db.execute(
    drizzleSql`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_case_queue_snapshot"
      ON "case_queue_snapshots" ("snapshot_at", "assigned_to")
    `,
  );

  await db.execute(
    drizzleSql`
      CREATE INDEX IF NOT EXISTS "idx_case_queue_snapshot_timestamp"
      ON "case_queue_snapshots" ("snapshot_at")
    `,
  );

  await db.execute(
    drizzleSql`
      CREATE INDEX IF NOT EXISTS "idx_case_queue_snapshot_assignee"
      ON "case_queue_snapshots" ("assigned_to")
    `,
  );

  hasEnsuredTable = true;
}

function parseAzureSqlUrl(rawUrl?: string): ParseResult {
  const configuredUrl = config.azureSqlDatabaseUrl || rawUrl;
  if (!configuredUrl) {
    throw new Error("AZURE_SQL_DATABASE_URL environment variable is not set");
  }

  const normalized = configuredUrl.replace(/^mssql\+pyodbc:\/\//i, "https://");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error(`Invalid AZURE_SQL_DATABASE_URL: ${String(error)}`);
  }

  const user = decodeURIComponent(parsed.username || "");
  const password = decodeURIComponent(parsed.password || "");
  const server = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 1433;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  if (!server || !database) {
    throw new Error("AZURE_SQL_DATABASE_URL must include server and database");
  }

  const params = parsed.searchParams;
  const encryptParam = params.get("Encrypt") ?? params.get("encrypt") ?? "yes";
  const trustParam =
    params.get("TrustServerCertificate") ??
    params.get("trustservercertificate") ??
    "no";
  const connectionTimeoutSeconds =
    params.get("Connection Timeout") ?? params.get("connectiontimeout");

  const connectionConfig: SqlConnectionConfig = {
    user: user || undefined,
    password: password || undefined,
    server,
    port,
    database,
    options: {
      encrypt: encryptParam.toLowerCase() === "yes",
      trustServerCertificate: trustParam.toLowerCase() === "yes",
    },
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 30_000,
    },
  };

  if (connectionTimeoutSeconds) {
    const timeoutMs = Number(connectionTimeoutSeconds) * 1000;
    if (!Number.isNaN(timeoutMs) && timeoutMs > 0) {
      connectionConfig.connectionTimeout = timeoutMs;
    }
  }

  return { config: connectionConfig };
}

async function queryAzureCaseQueue(): Promise<CaseQueueRow[]> {
  const { config: sqlConfig } = parseAzureSqlUrl();
  const pool = new ConnectionPool(sqlConfig as any);
  await pool.connect();

  try {
    const request = pool.request();
    const result = await request.query(CASE_QUEUE_QUERY);
    const merged = new Map<string, CaseQueueRow>();

    for (const row of result.recordset ?? []) {
      const assignedToName = row.assigned_to_name ?? "Unassigned";
      const assignmentGroupName = row.assignment_group_name ?? null;
      const accountName = row.account_name ?? "Unknown";
      const assignedToEmail = row.assigned_to_email ?? null;
      const priorityCode = Number(row.priority_code);
      const escalated = Boolean(row.active_escalation);
      const lastSeen = row.last_seen_utc ? new Date(row.last_seen_utc) : null;

      if (assignedToEmail) {
        const allowed = isMobizEmail(assignedToEmail);
        if (!allowed && assignedToName !== "Unassigned") {
          continue;
        }
      }

      let key = assignedToName;
      const isUnassigned = assignedToName === "Unassigned";
      if (isUnassigned) {
        const groupLabel = assignmentGroupName ?? "Unknown";
        key = `Unassigned • ${groupLabel}`;
      }

      let aggregate = merged.get(key);
      if (!aggregate) {
        aggregate = {
          assignedToName: key,
          assignedToEmail: isUnassigned ? null : assignedToEmail,
          assignmentGroupName,
          openCases: 0,
          highPriorityCases: 0,
          escalatedCases: 0,
          lastSeenUtc: lastSeen,
          accountBreakdown: isUnassigned ? {} : undefined,
        };
        merged.set(key, aggregate);
      }

      aggregate.openCases += 1;
      if (priorityCode === 1) {
        aggregate.highPriorityCases += 1;
      }
      if (escalated) {
        aggregate.escalatedCases += 1;
      }
      if (lastSeen && (!aggregate.lastSeenUtc || lastSeen > aggregate.lastSeenUtc)) {
        aggregate.lastSeenUtc = lastSeen;
      }
      if (!aggregate.assignedToEmail && assignedToEmail && !isUnassigned) {
        aggregate.assignedToEmail = assignedToEmail;
      }
      if (
        aggregate.assignmentGroupName &&
        assignmentGroupName &&
        aggregate.assignmentGroupName !== assignmentGroupName
      ) {
        aggregate.assignmentGroupName = "Multiple";
      }
      if (aggregate.accountBreakdown) {
        const breakdownKey = `${accountName}|||${assignmentGroupName ?? "Unknown group"}`;
        aggregate.accountBreakdown[breakdownKey] =
          (aggregate.accountBreakdown[breakdownKey] ?? 0) + 1;
      }
    }

    return Array.from(merged.values()).sort(
      (a, b) => b.openCases - a.openCases,
    );
  } finally {
    await pool.close();
  }
}

export interface PullSnapshotOptions {
  snapshotAt?: Date;
  source?: string;
}

export async function pullAndStoreCaseQueueSnapshot(
  options: PullSnapshotOptions = {}
) {
  const rows = await queryAzureCaseQueue();
  const db = getDb();

  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  await ensureCaseQueueSnapshotTable(db);

  if (rows.length === 0) {
    return { snapshotAt: options.snapshotAt ?? new Date(), inserted: 0 };
  }

  const snapshotAt = options.snapshotAt ?? new Date();
  const source = options.source ?? "azure_sql";

  await db
    .delete(caseQueueSnapshots)
    .where(eq(caseQueueSnapshots.snapshotAt, snapshotAt));

  await db.insert(caseQueueSnapshots).values(
    rows.map((row) => ({
      snapshotAt,
      assignedTo: row.assignedToName,
      assignedToEmail: row.assignedToEmail,
      assignmentGroup: row.assignmentGroupName,
      openCases: row.openCases,
      highPriorityCases: row.highPriorityCases,
      escalatedCases: row.escalatedCases,
      lastSeenUtc: row.lastSeenUtc ?? undefined,
      source,
      rawPayload: row.accountBreakdown
        ? JSON.stringify(row.accountBreakdown)
        : undefined,
    })),
  );

  return { snapshotAt, inserted: rows.length };
}

export async function previewAzureCaseQueue() {
  return queryAzureCaseQueue();
}

export interface SnapshotRow {
  assignedTo: string;
  assignedToEmail: string | null;
  assignmentGroup: string | null;
  openCases: number;
  highPriorityCases: number;
  escalatedCases: number;
  lastSeenUtc: Date | null;
  unassignedBreakdown?: Record<string, number>;
}

export interface LatestSnapshotResult {
  snapshotAt: Date;
  rows: SnapshotRow[];
  totalOpenCases: number;
  totalHighPriorityCases: number;
  totalEscalatedCases: number;
}

export interface LatestSnapshotOptions {
  /**
   * Require the snapshot to be newer than this many minutes (optional).
   */
  maxAgeMinutes?: number;

  /**
   * Require at least this many assignees in the snapshot (optional).
   */
  minRows?: number;
}

export async function getLatestCaseQueueSnapshot(
  options: LatestSnapshotOptions = {}
): Promise<LatestSnapshotResult | null> {
  const db = getDb();

  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  await ensureCaseQueueSnapshotTable(db);

  const latest = await db
    .select({ snapshotAt: caseQueueSnapshots.snapshotAt })
    .from(caseQueueSnapshots)
    .orderBy(desc(caseQueueSnapshots.snapshotAt))
    .limit(1);

  const latestEntry = latest[0];
  if (!latestEntry?.snapshotAt) {
    return null;
  }

  const snapshotAt =
    latestEntry.snapshotAt instanceof Date
      ? latestEntry.snapshotAt
      : new Date(latestEntry.snapshotAt);

  const rows = await db
    .select({
      assignedTo: caseQueueSnapshots.assignedTo,
      assignedToEmail: caseQueueSnapshots.assignedToEmail,
      assignmentGroup: caseQueueSnapshots.assignmentGroup,
      openCases: caseQueueSnapshots.openCases,
      highPriorityCases: caseQueueSnapshots.highPriorityCases,
      escalatedCases: caseQueueSnapshots.escalatedCases,
      lastSeenUtc: caseQueueSnapshots.lastSeenUtc,
      rawPayload: caseQueueSnapshots.rawPayload,
    })
    .from(caseQueueSnapshots)
    .where(eq(caseQueueSnapshots.snapshotAt, snapshotAt))
    .orderBy(desc(caseQueueSnapshots.openCases));

  const normalizedRows: SnapshotRow[] = rows.map((row) => ({
    assignedTo: row.assignedTo,
    assignedToEmail: row.assignedToEmail ?? null,
    assignmentGroup: row.assignmentGroup ?? null,
    openCases: Number(row.openCases ?? 0),
    highPriorityCases: Number(row.highPriorityCases ?? 0),
    escalatedCases: Number(row.escalatedCases ?? 0),
    lastSeenUtc: row.lastSeenUtc ? new Date(row.lastSeenUtc) : null,
    unassignedBreakdown: (() => {
      if (!row.rawPayload) return undefined;
      try {
        if (typeof row.rawPayload === "string") {
          return JSON.parse(row.rawPayload) as Record<string, number>;
        }
        return row.rawPayload as Record<string, number>;
      } catch (error) {
        console.warn("Failed to parse unassigned breakdown payload", error);
        return undefined;
      }
    })(),
  }));

  const totalOpenCases = normalizedRows.reduce((sum, row) => sum + row.openCases, 0);
  const totalHighPriorityCases = normalizedRows.reduce(
    (sum, row) => sum + row.highPriorityCases,
    0
  );
  const totalEscalatedCases = normalizedRows.reduce(
    (sum, row) => sum + row.escalatedCases,
    0
  );

  if (options.minRows && normalizedRows.length < options.minRows) {
    throw new Error(
      `Latest case queue snapshot only has ${normalizedRows.length} rows (expected >= ${options.minRows})`
    );
  }

  if (options.maxAgeMinutes) {
    const maxAgeMs = options.maxAgeMinutes * 60 * 1000;
    const ageMs = Date.now() - snapshotAt.getTime();
    if (ageMs > maxAgeMs) {
      const ageMinutes = Math.round(ageMs / 60000);
      throw new Error(
        `Latest case queue snapshot is stale (${ageMinutes} minutes old; allowed <= ${options.maxAgeMinutes})`
      );
    }
  }

  return {
    snapshotAt,
    rows: normalizedRows,
    totalOpenCases,
    totalHighPriorityCases,
    totalEscalatedCases,
  };
}
