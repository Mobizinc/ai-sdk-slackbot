import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const { getAppSettingWithFallback, APP_SETTING_KEYS } = await import(
    "../lib/services/app-settings"
  );
  const args = process.argv.slice(2);
  let channelId: string | undefined;
  let mentionUserIds: string[] | undefined;
  let includeUnassignedDetails = true;
  let includeUnassignedChart = true;

  for (const arg of args) {
    if (arg.startsWith("--mentions=")) {
      mentionUserIds = arg
        .replace("--mentions=", "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (arg === "--no-unassigned" || arg === "--no-unassigned-chart") {
      includeUnassignedDetails = false;
      includeUnassignedChart = false;
    } else if (!channelId && !arg.startsWith("--")) {
      channelId = arg;
    }
  }

  if (!channelId) {
    channelId = await getAppSettingWithFallback(
      APP_SETTING_KEYS.queueReportChannel,
      process.env.CASE_QUEUE_CHANNEL_ID ?? null,
    ) ?? undefined;
  }

  if (!channelId) {
    console.error("❌ Missing channel ID. Pass as argument or set CASE_QUEUE_CHANNEL_ID.");
    process.exit(1);
  }

  const { postCaseQueueReport } = await import("../lib/services/case-queue-report");

  const result = await postCaseQueueReport({
    channelId,
    mentionUserIds,
    maxAgeMinutes: 240,
    minRows: 3,
    includeHighPriorityDataset: true,
    includeUnassignedDetails,
    includeUnassignedChart,
  });

  if (!result) {
    console.warn("⚠️ No snapshot posted (nothing to report)");
    return;
  }

  console.log(
    `✅ Posted case queue report to ${channelId} for snapshot ${result.snapshotAt.toISOString()} (${result.rowsPersisted} assignees)`
  );
}

main().catch((error) => {
  console.error("❌ Failed to post case queue report", error);
  process.exit(1);
});
