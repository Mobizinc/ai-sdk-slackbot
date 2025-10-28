import { fetchVoiceInteractions } from "../../lib/services/webex-contact-center";
import {
  upsertCallInteractions,
  getMostRecentInteractionSync,
} from "../../lib/db/repositories/call-interaction-repository";
import {
  getAppSettingValue,
  setAppSetting,
} from "../../lib/db/repositories/app-settings-repository";

type JsonResponse =
  | {
      status: "ok";
      processed: number;
      stored: number;
      latestEndTime: string | null;
      startedAt: string;
      endedAt: string;
      message?: string;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      message: string;
    };

const SETTING_KEY = "webex:last_voice_sync_at";
const FALLBACK_MINUTES = parseInt(process.env.CALL_SYNC_LOOKBACK_MINUTES || "15", 10);

function json(body: JsonResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function isConfigured(): boolean {
  // Require either an access token or refresh credentials
  const hasDirectToken = Boolean(process.env.WEBEX_CC_ACCESS_TOKEN);
  const hasRefreshFlow =
    Boolean(process.env.WEBEX_CC_CLIENT_ID) &&
    Boolean(process.env.WEBEX_CC_CLIENT_SECRET) &&
    Boolean(process.env.WEBEX_CC_REFRESH_TOKEN);

  return hasDirectToken || hasRefreshFlow;
}

async function determineStartTime(): Promise<Date> {
  // Prefer stored setting, fall back to latest synced interaction, then fallback window
  const settingValue = await getAppSettingValue(SETTING_KEY);
  if (settingValue) {
    const parsed = new Date(settingValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const latestSync = await getMostRecentInteractionSync();
  if (latestSync) {
    return latestSync;
  }

  const fallback = new Date(Date.now() - FALLBACK_MINUTES * 60 * 1000);
  return fallback;
}

async function runSync(): Promise<Response> {
  if (!isConfigured()) {
    return json(
      {
        status: "skipped",
        reason:
          "Webex Contact Center credentials are not configured. Set WEBEX_CC_ACCESS_TOKEN or refresh token credentials.",
      },
      503,
    );
  }

  try {
    const now = new Date();
    const startTime = await determineStartTime();
    const endTime = now;

    const { interactions, latestEndTime } = await fetchVoiceInteractions({
      startTime,
      endTime,
    });

    await upsertCallInteractions(interactions);

    if (latestEndTime) {
      await setAppSetting(SETTING_KEY, latestEndTime.toISOString());
    } else {
      await setAppSetting(SETTING_KEY, endTime.toISOString());
    }

    return json({
      status: "ok",
      processed: interactions.length,
      stored: interactions.length,
      latestEndTime: latestEndTime ? latestEndTime.toISOString() : null,
      startedAt: startTime.toISOString(),
      endedAt: endTime.toISOString(),
      message: interactions.length
        ? `Stored ${interactions.length} Webex voice interactions`
        : "No Webex voice interactions found for the window",
    });
  } catch (error) {
    console.error("[Cron] Webex voice sync failed:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error during Webex sync";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runSync();
}

export async function POST(): Promise<Response> {
  return runSync();
}
