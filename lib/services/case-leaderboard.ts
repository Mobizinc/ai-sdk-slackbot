import { ConnectionPool } from "mssql";

import { getSlackMessagingService } from "./slack-messaging";
import { getAllowedMobizDomains, isMobizEmail } from "./mobiz-filter";

const slackMessaging = getSlackMessagingService();

const DEFAULT_LOOKBACK_DAYS = 7;
const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";

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

interface SqlLeaderboardRow {
  assigned_to_name: string;
  assigned_to_email: string | null;
  assigned_count: number;
  resolved_count: number;
  resolution_minutes_total: number;
  resolution_samples: number;
}

interface SqlActiveRow {
  assigned_to_name: string;
  assigned_to_email: string | null;
  active_cases: number;
}

function parseConnectionUrl(rawUrl?: string) {
  if (!rawUrl) {
    throw new Error("AZURE_SQL_DATABASE_URL environment variable is not set");
  }

  const normalized = rawUrl.replace(/^mssql\+pyodbc:\/\//i, "https://");
  const parsed = new URL(normalized);

  return {
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    server: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 1433,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };
}

async function withSqlPool<T>(callback: (pool: ConnectionPool) => Promise<T>): Promise<T> {
  const config = parseConnectionUrl(process.env.AZURE_SQL_DATABASE_URL);
  const pool = new ConnectionPool(config as any);
  await pool.connect();

  try {
    return await callback(pool);
  } finally {
    await pool.close();
  }
}

async function fetchLeaderboardRows(start: Date, end: Date): Promise<SqlLeaderboardRow[]> {
  return withSqlPool(async (pool) => {
    const request = pool.request();
    request.input("startUtc", start.toISOString());
    request.input("endUtc", end.toISOString());

    const query = `
      SELECT
        assigned_to_name,
        assigned_to_email,
        SUM(CASE WHEN assigned_on IS NOT NULL AND assigned_on >= @startUtc AND assigned_on < @endUtc THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN resolved_at IS NOT NULL AND resolved_at >= @startUtc AND resolved_at < @endUtc THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN resolved_at IS NOT NULL AND resolved_at >= @startUtc AND resolved_at < @endUtc AND assigned_on IS NOT NULL THEN DATEDIFF(minute, assigned_on, resolved_at) ELSE 0 END) AS resolution_minutes_total,
        SUM(CASE WHEN resolved_at IS NOT NULL AND resolved_at >= @startUtc AND resolved_at < @endUtc AND assigned_on IS NOT NULL THEN 1 ELSE 0 END) AS resolution_samples
      FROM dbo.customer_cases_denormalized
      WHERE assigned_to_name IS NOT NULL
        AND assigned_to_name <> ''
        AND (
          (assigned_on IS NOT NULL AND assigned_on >= @startUtc AND assigned_on < @endUtc)
          OR (resolved_at IS NOT NULL AND resolved_at >= @startUtc AND resolved_at < @endUtc)
        )
      GROUP BY assigned_to_name, assigned_to_email;
    `;

    const result = await request.query(query);
    return result.recordset as SqlLeaderboardRow[];
  });
}

async function fetchActiveRows(): Promise<SqlActiveRow[]> {
  return withSqlPool(async (pool) => {
    const request = pool.request();
    const result = await request.query(`
      SELECT
        assigned_to_name,
        assigned_to_email,
        COUNT(*) AS active_cases
      FROM dbo.vw_customer_case_current
      WHERE assigned_to_name IS NOT NULL
        AND assigned_to_name <> ''
        AND state NOT IN ('Closed', 'Resolved', '7', '3', '6')
      GROUP BY assigned_to_name, assigned_to_email;
    `);
    return result.recordset as SqlActiveRow[];
  });
}

function mergeLeaderboardData(
  resolvedRows: SqlLeaderboardRow[],
  activeRows: SqlActiveRow[],
): LeaderboardRow[] {
  const activeMap = new Map<string, SqlActiveRow>();
  for (const row of activeRows) {
    const email = row.assigned_to_email?.toLowerCase() ?? "";
    const name = row.assigned_to_name ?? "";
    const key = `${name}::${email}`;
    activeMap.set(key, row);
  }

  const allowedDomains = getAllowedMobizDomains();
  const results: LeaderboardRow[] = [];

  for (const row of resolvedRows) {
    const email = row.assigned_to_email?.toLowerCase() ?? null;
    if (!email || !isMobizEmail(email)) {
      continue;
    }

    const name = row.assigned_to_name?.trim();
    if (!name) {
      continue;
    }

    const key = `${name}::${email}`;
    const active = activeMap.get(key)?.active_cases ?? 0;
    const avgMinutes = row.resolution_samples > 0
      ? row.resolution_minutes_total / row.resolution_samples
      : null;

    results.push({
      name,
      email,
      assigned: Number(row.assigned_count ?? 0),
      resolved: Number(row.resolved_count ?? 0),
      active,
      avgResolutionMinutes: avgMinutes,
    });
  }

  return results.sort((a, b) => {
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

  const [resolvedRows, activeRows] = await Promise.all([
    fetchLeaderboardRows(start, end),
    fetchActiveRows(),
  ]);

  const leaderboard = mergeLeaderboardData(resolvedRows, activeRows);
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
