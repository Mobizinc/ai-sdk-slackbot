import { getSlackMessagingService } from "./slack-messaging";
import { isMobizEmail } from "./mobiz-filter";
import { getTableApiClient } from "../infrastructure/servicenow/repositories/factory";

const slackMessaging = getSlackMessagingService();
const tableApiClient = getTableApiClient();

const DEFAULT_LOOKBACK_DAYS = 14;
const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";
const TARGET_ASSIGNMENT_GROUPS = (process.env.CASE_LEADERBOARD_GROUPS ?? "Incident and Case Management,Network Engineers")
  .split(",")
  .map((group) => group.trim())
  .filter((group) => group.length > 0);
const parsedMaxRecords = parseInt(process.env.CASE_LEADERBOARD_MAX_RECORDS ?? "2000", 10);
const MAX_RECORDS = Number.isFinite(parsedMaxRecords) && parsedMaxRecords > 0 ? parsedMaxRecords : 2000;

export interface LeaderboardOptions {
  days?: number;
  channelId: string;
  mentionTop?: number;
  limit?: number;
}

interface LeaderboardRow {
  name: string;
  email: string | null;
  assigned: number;
  resolved: number;
  active: number;
  avgResolutionMinutes: number | null;
}

type RawTaskRecord = Record<string, any>;

interface TaskAggregate {
  name: string;
  email: string | null;
  assigned: number;
  resolved: number;
  active: number;
  resolutionMinutesTotal: number;
  resolutionSamples: number;
}

const CASE_FIELDS = [
  "sys_id",
  "number",
  "short_description",
  "assignment_group",
  "assigned_to",
  "assigned_to.email",
  "opened_at",
  "resolved_at",
  "closed_at",
  "state",
  "active",
].join(",");

const INCIDENT_FIELDS = [
  "sys_id",
  "number",
  "short_description",
  "assignment_group",
  "assigned_to",
  "assigned_to.email",
  "sys_created_on",
  "resolved_at",
  "closed_at",
  "state",
  "active",
].join(",");

function buildAssignmentGroupFilter(groups: string[]): string {
  // ServiceNow doesn't have an IN operator - use OR logic with exact match for each group
  // Use assignment_group.name= for exact match (more reliable than LIKE for full group names)
  return groups
    .map((group) => `assignment_group.name=${group}`)
    .join("^OR");
}

function formatDateForQuery(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchRecordsFromTable(
  table: string,
  fields: string,
  start: Date,
  extraQueries: string[] = [],
): Promise<RawTaskRecord[]> {
  const baseFilter = buildAssignmentGroupFilter(TARGET_ASSIGNMENT_GROUPS);
  const startDate = formatDateForQuery(start);

  // Single comprehensive query that gets ALL relevant records for the period:
  // - Cases/incidents in the target assignment groups AND
  // - (opened, resolved, or closed during the period OR currently active)
  const query = `(${baseFilter})^(opened_at>=${startDate}^ORresolved_at>=${startDate}^ORclosed_at>=${startDate}^ORactive=true)`;

  const rows = await tableApiClient.fetchAll<RawTaskRecord>(table, {
    sysparm_query: query,
    sysparm_fields: fields,
    sysparm_display_value: "all",
    pageSize: 500,
    maxRecords: MAX_RECORDS,
  });

  return rows;
}

function mergeRecords(target: RawTaskRecord, source: RawTaskRecord): RawTaskRecord {
  const merged = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractDisplayValue(field: any): string | undefined {
  if (typeof field === "string") {
    return field;
  }
  if (field && typeof field === "object") {
    return field.display_value ?? field.value ?? undefined;
  }
  return undefined;
}

function isTaskActive(record: RawTaskRecord): boolean {
  if (typeof record.active === "string") {
    if (record.active.toLowerCase() === "true") return true;
    if (record.active.toLowerCase() === "false") return false;
  } else if (typeof record.active === "boolean") {
    return record.active;
  }

  const stateRaw = extractDisplayValue(record.state)?.toLowerCase() ?? "";
  if (!stateRaw) {
    return true;
  }
  if (stateRaw.includes("closed") || stateRaw.includes("resolved") || stateRaw.includes("cancel")) {
    return false;
  }
  return true;
}

function extractAssignee(record: RawTaskRecord): { name: string | null; email: string | null } {
  const directAssignee = record["assigned_to"];
  const dotEmail = record["assigned_to.email"];
  let name = extractDisplayValue(directAssignee);
  if (!name && typeof record["assigned_to.name"] === "string") {
    name = record["assigned_to.name"];
  }
  const emailValue = typeof dotEmail === "string" ? dotEmail : dotEmail?.display_value ?? dotEmail?.value;
  const email = emailValue ? emailValue.toLowerCase() : null;
  return { name: name ?? null, email };
}

async function collectLeaderboardRows(start: Date): Promise<LeaderboardRow[]> {
  const [caseRecords, incidentRecords] = await Promise.all([
    fetchRecordsFromTable("sn_customerservice_case", CASE_FIELDS, start),
    fetchRecordsFromTable("incident", INCIDENT_FIELDS, start, [
      `sys_created_on>=${formatDateForQuery(start)}`,
    ]),
  ]);

  const cutoff = start.getTime();
  const aggregates = new Map<string, TaskAggregate>();

  const processRecord = (record: RawTaskRecord, defaultOpenedField: string = "opened_at") => {
    const { name, email } = extractAssignee(record);
    if (!name) {
      return;
    }
    if (email && !isMobizEmail(email)) {
      return;
    }

    const key = (email ?? name).toLowerCase();
    if (!aggregates.has(key)) {
      aggregates.set(key, {
        name,
        email,
        assigned: 0,
        resolved: 0,
        active: 0,
        resolutionMinutesTotal: 0,
        resolutionSamples: 0,
      });
    }

    const aggregate = aggregates.get(key)!;
    const openedAt = parseDate(record[defaultOpenedField] ?? record.sys_created_on);
    const resolvedAt = parseDate(record.resolved_at ?? record.closed_at);
    const active = isTaskActive(record);

    if (openedAt && openedAt.getTime() >= cutoff) {
      aggregate.assigned += 1;
    }

    if (resolvedAt && resolvedAt.getTime() >= cutoff) {
      aggregate.resolved += 1;
      if (openedAt) {
        aggregate.resolutionMinutesTotal += (resolvedAt.getTime() - openedAt.getTime()) / (60 * 1000);
        aggregate.resolutionSamples += 1;
      }
    }

    if (active) {
      aggregate.active += 1;
    }
  };

  caseRecords.forEach((record) => processRecord(record, "opened_at"));
  incidentRecords.forEach((record) => processRecord(record, "sys_created_on"));

  return Array.from(aggregates.values())
    .filter((row) => row.assigned > 0 || row.resolved > 0 || row.active > 0)
    .map((row) => ({
      name: row.name,
      email: row.email,
      assigned: row.assigned,
      resolved: row.resolved,
      active: row.active,
      avgResolutionMinutes:
        row.resolutionSamples > 0 ? row.resolutionMinutesTotal / row.resolutionSamples : null,
    }))
    .sort((a, b) => {
      if (b.resolved !== a.resolved) return b.resolved - a.resolved;
      if (b.assigned !== a.assigned) return b.assigned - a.assigned;
      return a.name.localeCompare(b.name);
    });
}

function formatHours(minutes: number | null): string {
  if (!minutes || minutes <= 0) {
    return "–";
  }
  const hours = minutes / 60;
  if (hours >= 24) {
    return `${(hours / 24).toFixed(1)}d`;
  }
  return `${hours.toFixed(1)}h`;
}

function formatRangeLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function buildLeaderboardMessage(
  rows: LeaderboardRow[],
  start: Date,
  end: Date,
  limit: number,
): string {
  const rangeLabel = formatRangeLabel(start, end);
  const heading = `Mobiz Service Desk Leaderboard (${rangeLabel})`;
  const body = rows.slice(0, limit).map((row, index) => {
    const net = row.resolved - row.assigned;
    const netLabel = net === 0 ? "±0" : net > 0 ? `+${net}` : `${net}`;
    const displayName = index === 0 ? `⭐ ${row.name}` : row.name;
    return `${index + 1}. ${displayName} — resolved ${row.resolved}, received ${row.assigned} (net ${netLabel}, open ${row.active}, avg ${formatHours(row.avgResolutionMinutes)})`;
  });

  if (rows.length === 0) {
    body.push("No closed cases in this window.");
  }

  return [heading, ...body].join("\n");
}

async function generateLeaderboardChart(
  rows: LeaderboardRow[],
  limit: number,
  start: Date,
  end: Date,
): Promise<{ buffer: Buffer; shareUrl: string } | null> {
  const top = rows.slice(0, limit);
  if (top.length === 0) {
    return null;
  }

  const labels = top.map((row, index) => (index === 0 ? `⭐ ${row.name}` : row.name));
  const resolvedData = top.map((row) => row.resolved);
  const receivedData = top.map((row) => row.assigned);
  const rangeLabel = formatRangeLabel(start, end);

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Resolved",
          data: resolvedData,
          backgroundColor: "#2ca02c",
        },
        {
          label: "Received",
          data: receivedData,
          backgroundColor: "#1f77b4",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { position: "top" },
        title: {
          display: true,
          text: `Mobiz Case Handling (${rangeLabel})`,
          font: { size: 18 },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { precision: 0 },
        },
        y: {
          stacked: false,
        },
      },
    },
  };

  const payload = {
    version: 2,
    backgroundColor: "white",
    width: 900,
    height: 600,
    format: "png",
    chart: chartConfig,
  };

  const response = await fetch(QUICKCHART_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickChart leaderboard request failed (${response.status}): ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const shareUrl = `${QUICKCHART_ENDPOINT}?c=${encodeURIComponent(
    JSON.stringify(chartConfig),
  )}&w=900&h=600&bkg=white`;

  return { buffer, shareUrl };
}

export async function postCaseLeaderboard(options: LeaderboardOptions) {
  const days = options.days ?? DEFAULT_LOOKBACK_DAYS;
  const limit = options.limit ?? 10;
  const now = new Date();
  const end = now;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const leaderboard = await collectLeaderboardRows(start);
  const message = buildLeaderboardMessage(leaderboard, start, end, limit);

  const chart = await generateLeaderboardChart(leaderboard, limit, start, end);

  if (chart) {
    try {
      await slackMessaging.uploadFile({
        channelId: options.channelId,
        filename: "mobiz-case-leaderboard.png",
        title: "Mobiz Service Desk Leaderboard",
        initialComment: message,
        file: chart.buffer,
      });
    } catch (error) {
      const slackError =
        typeof error === "object" && error !== null ? (error as any) : null;
      const apiError = slackError?.data?.error ?? slackError?.message;
      if (String(apiError ?? "") === "missing_scope") {
        console.warn("files.uploadV2 missing scope; sending link instead");
        await slackMessaging.postMessage({
          channel: options.channelId,
          text: `${message}\nChart: ${chart.shareUrl}`,
        });
      } else {
        throw error;
      }
    }
  } else {
    await slackMessaging.postMessage({
      channel: options.channelId,
      text: message,
    });
  }
}
