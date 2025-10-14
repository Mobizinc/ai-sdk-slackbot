import { postCaseLeaderboard } from "../../lib/services/case-leaderboard";
import { APP_SETTING_KEYS, getAppSettingWithFallback } from "../../lib/services/app-settings";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function run(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channelParam = url.searchParams.get("channel");
  const channel = channelParam
    ?? (await getAppSettingWithFallback(
      APP_SETTING_KEYS.leaderboardChannel,
      process.env.MOBIZ_LEADERBOARD_CHANNEL ?? process.env.CASE_QUEUE_CHANNEL_ID ?? null,
    ));

  if (!channel) {
    return json({ status: "error", message: "Missing channel parameter or MOBIZ_LEADERBOARD_CHANNEL" }, 400);
  }

  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Number(daysParam) : undefined;

  try {
    await postCaseLeaderboard({
      channelId: channel,
      days,
    });

    return json({ status: "ok", message: "Leaderboard posted", channel, days: days ?? undefined });
  } catch (error) {
    console.error("[Cron] case-leaderboard failed", error);
    const message = error instanceof Error ? error.message : "Failed to post leaderboard";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
