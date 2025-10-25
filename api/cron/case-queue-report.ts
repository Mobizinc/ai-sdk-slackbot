import { postCaseQueueReport } from "../../lib/services/case-queue-report";
import { APP_SETTING_KEYS, getAppSettingWithFallback } from "../../lib/services/app-settings";
import { config } from "../../lib/config";

function parseMentions(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

type JsonBody =
  | {
      status: "ok";
      message: string;
      snapshotAt: string;
      rowsPersisted: number;
    }
  | { status: "error"; message: string };

function json(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function run(trigger: URL): Promise<Response> {
  try {
    const channelParam = trigger.searchParams.get("channel");
    const channelId = channelParam
      ?? (await getAppSettingWithFallback(
        APP_SETTING_KEYS.queueReportChannel,
        config.caseQueueChannelId || undefined,
      ));

    if (!channelId) {
      return json({ status: "error", message: "Missing channel parameter" }, 500);
    }

    const mentionIds = parseMentions(trigger.searchParams.get("mentions") ?? undefined);
    const maxAgeMinutesParam = trigger.searchParams.get("maxAgeMinutes");
    const maxAgeMinutes = maxAgeMinutesParam ? Number(maxAgeMinutesParam) : undefined;
    const includeUnassignedParam = trigger.searchParams.get("includeUnassigned");
    const includeUnassigned = includeUnassignedParam
      ? includeUnassignedParam === "1" || includeUnassignedParam === "true"
      : false;

    const mentionUserIds = mentionIds ?? (includeUnassigned ? undefined : []);

    const result = await postCaseQueueReport({
      channelId,
      mentionUserIds,
      includeHighPriorityDataset: true,
      maxAgeMinutes: maxAgeMinutes ?? 240,
      minRows: 3,
      includeUnassignedDetails: includeUnassigned,
      includeUnassignedChart: includeUnassigned,
    });

    if (!result) {
      return json({ status: "ok", message: "No snapshot to post", snapshotAt: "", rowsPersisted: 0 });
    }

    return json({
      status: "ok",
      message: "Case queue report posted",
      snapshotAt: result.snapshotAt.toISOString(),
      rowsPersisted: result.rowsPersisted,
    });
  } catch (error) {
    console.error("[Cron] case-queue-report failed", error);
    const message = error instanceof Error ? error.message : "Failed to post case queue report";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  const triggerUrl = new URL(request.url);
  return run(triggerUrl);
}

export async function POST(request: Request): Promise<Response> {
  const triggerUrl = new URL(request.url);
  return run(triggerUrl);
}
