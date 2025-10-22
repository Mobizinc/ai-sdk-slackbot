import { serviceNowClient } from "../../lib/tools/servicenow";
import { parseVoiceWorkNote } from "../../lib/utils/voice-worknote-parser";
import {
  upsertCallInteractions,
  getMostRecentInteractionSync,
} from "../../lib/db/repositories/call-interaction-repository";
import {
  getAppSettingValue,
  setAppSetting,
} from "../../lib/db/repositories/app-settings-repository";

const SETTING_KEY = "sn:last_voice_worknote_sync_at";
const DEFAULT_LOOKBACK_MINUTES = parseInt(
  process.env.WORKNOTE_LOOKBACK_MINUTES || "60",
  10,
);

type JsonResponse =
  | {
      status: "ok";
      processed: number;
      stored: number;
      startedAt: string;
      endedAt: string;
      latestWorkNoteAt: string | null;
    }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string };

function json(body: JsonResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function determineFallbackStart(): Date {
  return new Date(Date.now() - DEFAULT_LOOKBACK_MINUTES * 60 * 1000);
}

async function determineStartTime(): Promise<Date> {
  const configured = await getAppSettingValue(SETTING_KEY);
  if (configured) {
    const parsed = new Date(configured);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const latestInteraction = await getMostRecentInteractionSync();
  if (latestInteraction) {
    return latestInteraction;
  }

  return determineFallbackStart();
}

function parseServiceNowDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.replace(" ", "T") + "Z";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function runSync(): Promise<Response> {
  if (!serviceNowClient.isConfigured()) {
    return json(
      {
        status: "skipped",
        reason: "ServiceNow credentials are not configured.",
      },
      503,
    );
  }

  try {
    const now = new Date();
    const startTime = await determineStartTime();

    const notes = await serviceNowClient.getVoiceWorkNotesSince({ since: startTime });

    if (!notes.length) {
      await setAppSetting(SETTING_KEY, now.toISOString());
      return json({
        status: "ok",
        processed: 0,
        stored: 0,
        startedAt: startTime.toISOString(),
        endedAt: now.toISOString(),
        latestWorkNoteAt: null,
      });
    }

    const interactions = [];
    let maxTimestamp: Date | undefined;

    for (const note of notes) {
      const parsed = parseVoiceWorkNote(note.value || "");
      if (!parsed) {
        continue;
      }

      const workNoteTime = parseServiceNowDate(note.sys_created_on) ?? now;
      if (!maxTimestamp || workNoteTime > maxTimestamp) {
        maxTimestamp = workNoteTime;
      }

      const caseRecord = await serviceNowClient.getCaseBySysId(note.element_id);
      if (!caseRecord) {
        continue;
      }

      interactions.push({
        sessionId: parsed.sessionId,
        caseNumber: caseRecord.number,
        direction: parsed.direction,
        ani: parsed.phoneNumber,
        startTime: parsed.endTime ?? workNoteTime,
        endTime: parsed.endTime ?? workNoteTime,
        rawPayload: {
          source: "servicenow_worknote",
          workNoteSysId: note.sys_id,
          message: note.value,
          createdBy: note.sys_created_by,
          createdAt: note.sys_created_on,
        },
        transcriptStatus: "pending",
        syncedAt: now,
      });
    }

    await upsertCallInteractions(interactions);

    if (maxTimestamp) {
      await setAppSetting(SETTING_KEY, maxTimestamp.toISOString());
    } else {
      await setAppSetting(SETTING_KEY, now.toISOString());
    }

    return json({
      status: "ok",
      processed: notes.length,
      stored: interactions.length,
      startedAt: startTime.toISOString(),
      endedAt: now.toISOString(),
      latestWorkNoteAt: maxTimestamp ? maxTimestamp.toISOString() : null,
    });
  } catch (error) {
    console.error("[Cron] Voice worknote sync failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runSync();
}

export async function POST(): Promise<Response> {
  return runSync();
}
