import { getSlackMessagingService } from "./slack-messaging";
import { CaseSearchService } from "./case-search-service";
import type { Case } from "../infrastructure/servicenow/types/domain-models";
import { config } from "../config";

const slackMessaging = getSlackMessagingService();
const caseSearchService = new CaseSearchService();

const DEFAULT_LOOKBACK_DAYS = 14;
const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";
const TARGET_ASSIGNMENT_GROUPS = (process.env.CASE_LEADERBOARD_GROUPS ?? "Incident and Case Management,Network Engineers")
  .split(",")
  .map((group) => group.trim())
  .filter((group) => group.length > 0);
const parsedMaxRecords = parseInt(process.env.CASE_LEADERBOARD_MAX_RECORDS ?? "2000", 10);
const MAX_RECORDS = Number.isFinite(parsedMaxRecords) && parsedMaxRecords > 0 ? parsedMaxRecords : 2000;
const SEARCH_PAGE_SIZE = Math.min(
  Number(process.env.CASE_LEADERBOARD_PAGE_SIZE ?? "50"),
  50,
);

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

async function fetchCasesForLeaderboard(start: Date): Promise<Case[]> {
  const collected = new Map<string, Case>();

  // Simple approach: Get ALL active cases for each group (proven to work like stale case does)
  // Then filter/aggregate in memory based on dates
  for (const group of TARGET_ASSIGNMENT_GROUPS) {
    let offset = 0;
    let page = 0;
    const limit = SEARCH_PAGE_SIZE;

    while (true) {
      const result = await caseSearchService.searchWithMetadata({
        assignmentGroup: group,
        activeOnly: true, // Get all active cases (works like stale case query)
        includeChildDomains: true,
        limit,
        offset,
      });

      result.cases.forEach((caseItem) => {
        if (!collected.has(caseItem.sysId)) {
          collected.set(caseItem.sysId, caseItem);
        }
      });

      console.log(
        `[Leaderboard] Fetched page ${page} for group "${group}": ${result.cases.length} cases (total: ${collected.size})`,
      );

      if (!result.hasMore || result.cases.length === 0) {
        break;
      }
      offset = result.nextOffset ?? offset + result.cases.length;
      page += 1;

      if (collected.size >= MAX_RECORDS) {
        break;
      }
    }

    if (collected.size >= MAX_RECORDS) {
      break;
    }
  }

  return Array.from(collected.values());
}

function normalizeName(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractCaseAssignee(record: Case): { name: string | null; email: string | null } {
  const name = normalizeName(record.assignedTo);
  const email = record.assignedToEmail ? record.assignedToEmail.toLowerCase() : null;
  return { name, email };
}

function isCaseActive(record: Case): boolean {
  if (typeof record.active === "boolean") {
    return record.active;
  }
  const stateRaw = record.state?.toLowerCase() ?? "";
  if (!stateRaw) {
    return true;
  }
  if (stateRaw.includes("closed") || stateRaw.includes("resolved") || stateRaw.includes("cancel")) {
    return false;
  }
  return true;
}

async function collectLeaderboardRows(start: Date): Promise<LeaderboardRow[]> {
  // Use the custom case table directly (x_mobit_serv_case_service_case)
  const caseRecords = await fetchCasesForLeaderboard(start);
  console.log(`[Leaderboard] Retrieved ${caseRecords.length} ServiceNow cases for aggregation.`);

  const cutoff = start.getTime();
  const aggregates = new Map<string, TaskAggregate>();

  const processRecord = (record: Case) => {
    const { name, email } = extractCaseAssignee(record);
    if (!name) {
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
    const openedAt = record.openedAt ?? null;
    const resolvedAt = record.resolvedAt ?? record.closedAt ?? null;
    const active = isCaseActive(record);

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

  caseRecords.forEach((record) => processRecord(record));

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
  const limit = options.limit ?? 10;
  const now = new Date();
  const end = now;

  // Use month-to-date by default (first day of current month to today)
  // Allow override via days parameter for testing/manual runs
  const start = options.days
    ? new Date(end.getTime() - options.days * 24 * 60 * 60 * 1000)
    : new Date(now.getFullYear(), now.getMonth(), 1);

  const leaderboard = await collectLeaderboardRows(start);
  console.log(`[Leaderboard] Collected ${leaderboard.length} rows:`, JSON.stringify(leaderboard.slice(0, 5), null, 2));
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
