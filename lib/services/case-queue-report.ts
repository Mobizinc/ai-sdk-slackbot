import { getSlackMessagingService } from "./slack-messaging";
import {
  getLatestCaseQueueSnapshot,
  type LatestSnapshotOptions,
} from "./case-queue-snapshots";

const slackMessaging = getSlackMessagingService();

interface ChartArtifact {
  buffer: Buffer;
  filename: string;
  title: string;
  altText: string;
  shareUrl: string;
}

const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";

async function generateChart(
  rows: Array<{ assignedTo: string; openCases: number; highPriorityCases: number }>,
  snapshotAt: Date,
  includeHighPriorityDataset: boolean,
): Promise<ChartArtifact | null> {
  const filteredRows = rows.filter(
    (row) => !row.assignedTo.startsWith("Unassigned"),
  );

  if (filteredRows.length === 0) {
    return null;
  }

  const topRows = filteredRows.slice(0, 12);
  const labels = topRows.map((row) => row.assignedTo);
  const openCasesDataset = topRows.map((row) => row.openCases);
  const highPriorityDataset = topRows.map((row) => row.highPriorityCases);

  const datasets: Array<Record<string, unknown>> = [
    {
      label: "Open Cases",
      data: openCasesDataset,
      backgroundColor: "#1f77b4",
    },
  ];

  if (includeHighPriorityDataset) {
    datasets.push({
      label: "High Priority",
      data: highPriorityDataset,
      backgroundColor: "#d62728",
    });
  }

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets,
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: {
              size: 12,
            },
          },
        },
        title: {
          display: true,
      text: includeHighPriorityDataset
        ? "Service Desk Queue (open vs high priority)"
        : "Service Desk Queue",
          font: {
            size: 18,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            precision: 0,
            font: { size: 12 },
          },
        },
        y: {
          ticks: {
            font: { size: 12 },
          },
        },
      },
    },
  };

  const payload = {
    version: 2,
    backgroundColor: "white",
    width: 800,
    height: 500,
    format: "png",
    chart: chartConfig,
  };

  const response = await fetch(QUICKCHART_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`QuickChart request failed (${response.status}): ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const title = `Service Desk Queue — ${formatter.format(snapshotAt)} UTC`;

  const altText = `Service desk queue snapshot showing ${topRows
    .map(
      (row) =>
        includeHighPriorityDataset
          ? `${row.assignedTo}: ${row.openCases} open (${row.highPriorityCases} high priority)`
          : `${row.assignedTo}: ${row.openCases} open`
    )
    .join(", ")}.`;

  const shareUrl = `${QUICKCHART_ENDPOINT}?c=${encodeURIComponent(
    JSON.stringify(chartConfig),
  )}&w=800&h=500&bkg=white`;

  return {
    buffer,
    filename: "service-desk-queue.png",
    title,
    altText,
    shareUrl,
  };
}

async function generateUnassignedChart(
  entries: Array<{ label: string; openCases: number }>,
  snapshotAt: Date,
): Promise<ChartArtifact | null> {
  if (entries.length === 0) {
    return null;
  }

  const topRows = entries.slice(0, 12);
  const labels = topRows.map((entry) => entry.label);
  const dataset = topRows.map((entry) => entry.openCases);

  const chartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Unassigned Cases",
          data: dataset,
          backgroundColor: "#9467bd",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: "Unassigned Queue by Client",
          font: { size: 18 },
        },
      },
      scales: {
        x: {
          ticks: { precision: 0, font: { size: 12 } },
        },
        y: {
          ticks: { font: { size: 12 } },
        },
      },
    },
  };

  const payload = {
    version: 2,
    backgroundColor: "white",
    width: 800,
    height: 500,
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
    throw new Error(
      `QuickChart unassigned request failed (${response.status}): ${text}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const title = `Unassigned Queue by Client — ${formatter.format(snapshotAt)} UTC`;
  const altText = `Unassigned cases by client: ${topRows
    .map((row) => `${row.label}: ${row.openCases}`)
    .join(", ")}.`;
  const shareUrl = `${QUICKCHART_ENDPOINT}?c=${encodeURIComponent(
    JSON.stringify(chartConfig),
  )}&w=800&h=500&bkg=white`;

  return {
    buffer,
    filename: "unassigned-queue.png",
    title,
    altText,
    shareUrl,
  };
}

function buildMessage({
  snapshotAt,
  totalOpen,
  totalHigh,
  totalEscalated,
  topAssignees,
  unassignedTotal,
  unassignedGroups,
  mentionUserIds,
}: {
  snapshotAt: Date;
  totalOpen: number;
  totalHigh: number;
  totalEscalated: number;
  topAssignees: Array<{ name: string; openCases: number }>;
  unassignedTotal?: number;
  unassignedGroups?: Array<{ label: string; openCases: number }>;
  mentionUserIds?: string[];
}): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const headline = `Service desk queue snapshot (${formatter.format(snapshotAt)} UTC)`;
  const totals = `Total open: ${totalOpen}  |  High priority: ${totalHigh}  |  Escalated: ${totalEscalated}`;

  const topLine = topAssignees.length
    ? `Top queues: ${topAssignees
        .map((entry) => `${entry.name} (${entry.openCases})`)
        .join(", ")}`
    : undefined;

  const unassignedTotalLine =
    typeof unassignedTotal === "number" && unassignedTotal > 0
      ? `Unassigned total: ${unassignedTotal}`
      : undefined;

  const unassignedGroupsLine =
    unassignedGroups && unassignedGroups.length > 0
      ? `Unassigned queues: ${unassignedGroups
          .map((entry) => `${entry.label} (${entry.openCases})`)
          .join(", ")}`
      : undefined;

  const mentions = mentionUserIds?.length
    ? mentionUserIds.map((id) => `<@${id}>`).join(" ")
    : undefined;

  return [mentions, headline, totals, topLine, unassignedTotalLine, unassignedGroupsLine]
    .filter(Boolean)
    .join("\n");
}

export interface PostCaseQueueReportOptions extends LatestSnapshotOptions {
  channelId: string;
  mentionUserIds?: string[];
  includeHighPriorityDataset?: boolean;
  includeUnassignedDetails?: boolean;
  includeUnassignedChart?: boolean;
}

export async function postCaseQueueReport(
  options: PostCaseQueueReportOptions,
): Promise<{ snapshotAt: Date; rowsPersisted: number } | null> {
  const {
    channelId,
    mentionUserIds,
    includeHighPriorityDataset,
    includeUnassignedDetails = true,
    includeUnassignedChart = true,
    ...snapshotOptions
  } = options;

  const snapshot = await getLatestCaseQueueSnapshot(snapshotOptions);

  if (!snapshot) {
    console.warn("No case queue snapshot available to post");
    return null;
  }

  const { snapshotAt, rows, totalEscalatedCases, totalHighPriorityCases, totalOpenCases } = snapshot;

  const assignedRows = rows.filter(
    (row) => !row.assignedTo.startsWith("Unassigned"),
  );

  const unassignedRows = rows.filter((row) =>
    row.assignedTo.startsWith("Unassigned"),
  );

  const unassignedTotal = unassignedRows.reduce(
    (sum, row) => sum + row.openCases,
    0,
  );

  const unassignedGroupMap = new Map<string, number>();

  for (const row of unassignedRows) {
    const breakdown = row.unassignedBreakdown;
    if (breakdown && Object.keys(breakdown).length > 0) {
      for (const [account, count] of Object.entries(breakdown)) {
        const [accountName, groupName = "Unknown group"] = account.split("|||");
        const label = `${accountName || "Unknown"} (${groupName})`;
        unassignedGroupMap.set(
          label,
          (unassignedGroupMap.get(label) ?? 0) + Number(count ?? 0),
        );
      }
    } else {
      const fallbackLabel = row.assignmentGroup
        ? row.assignmentGroup
        : row.assignedTo.replace(/^Unassigned •\s*/, "Unknown");
      unassignedGroupMap.set(
        fallbackLabel,
        (unassignedGroupMap.get(fallbackLabel) ?? 0) + row.openCases,
      );
    }
  }

  const unassignedGroups = Array.from(unassignedGroupMap.entries())
    .map(([label, openCases]) => ({ label, openCases }))
    .sort((a, b) => b.openCases - a.openCases);

  const chart = await generateChart(
    assignedRows.map((row) => ({
      assignedTo: row.assignedTo,
      openCases: row.openCases,
      highPriorityCases: row.highPriorityCases,
    })),
    snapshotAt,
    !!includeHighPriorityDataset,
  );

  const unassignedChartData = unassignedGroups.slice(0, 12);
  const unassignedChart =
    includeUnassignedChart && unassignedChartData.length
      ? await generateUnassignedChart(unassignedChartData, snapshotAt)
      : null;

  const message = buildMessage({
    snapshotAt,
    totalOpen: totalOpenCases,
    totalHigh: totalHighPriorityCases,
    totalEscalated: totalEscalatedCases,
    topAssignees: assignedRows.slice(0, 5).map((row) => ({
      name: row.assignedTo,
      openCases: row.openCases,
    })),
    unassignedTotal: includeUnassignedDetails ? unassignedTotal : undefined,
    unassignedGroups: includeUnassignedDetails
      ? unassignedGroups.slice(0, 5)
      : undefined,
    mentionUserIds,
  });

  if (chart) {
    try {
      await slackMessaging.uploadFile({
        channelId: channelId,
        filename: chart.filename,
        title: chart.title,
        initialComment: message,
        file: chart.buffer,
      });
    } catch (error) {
      const slackError =
        typeof error === "object" && error !== null ? (error as any) : null;
      const apiError = slackError?.data?.error ?? slackError?.message;
      const apiErrorString = String(apiError ?? "");

      if (apiErrorString === "missing_scope") {
        console.warn(
          "Slack files.uploadV2 missing scope; falling back to text-only report",
        );
        await slackMessaging.postMessage({
          channel: channelId,
          text: `${message}\nChart: ${chart.shareUrl}`,
        });
      } else {
        throw error;
      }
    }
  } else {
    await slackMessaging.postMessage({
      channel: channelId,
      text: message,
    });
  }

  if (includeUnassignedChart && unassignedChart) {
    try {
      await slackMessaging.uploadFile({
        channelId: channelId,
        filename: unassignedChart.filename,
        title: unassignedChart.title,
        initialComment: "Unassigned backlog by client",
        file: unassignedChart.buffer,
      });
    } catch (error) {
      const slackError =
        typeof error === "object" && error !== null ? (error as any) : null;
      const apiError = slackError?.data?.error ?? slackError?.message;
      const apiErrorString = String(apiError ?? "");

      if (apiErrorString === "missing_scope") {
        console.warn(
          "Slack files.uploadV2 missing scope for unassigned chart; posting link instead",
        );
        await slackMessaging.postMessage({
          channel: channelId,
          text: `Unassigned backlog by client: ${unassignedChart.shareUrl}`,
        });
      } else {
        throw error;
      }
    }
  }

  return { snapshotAt, rowsPersisted: rows.length };
}
