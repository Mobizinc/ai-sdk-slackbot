import { serviceNowClient } from "../../lib/tools/servicenow";
import { parseVoiceWorkNote } from "../../lib/utils/voice-worknote-parser";
import {
  upsertCallInteractions,
  getMostRecentInteractionSync,
  updateCallInteractionServiceNowIds,
  getCallInteractionsNeedingServiceNowSync,
} from "../../lib/db/repositories/call-interaction-repository";
import {
  getAppSettingValue,
  setAppSetting,
} from "../../lib/db/repositories/app-settings-repository";
import { createSystemContext } from "../../lib/infrastructure/servicenow-context";

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
      interactionsCreated: number;
      interactionsFailed: number;
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

    // Create ServiceNow context for cron job (deterministic routing)
    const snContext = createSystemContext('cron-sync-voice-worknotes');

    const notes = await serviceNowClient.getVoiceWorkNotesSince({ since: startTime });

    if (!notes.length) {
      await setAppSetting(SETTING_KEY, now.toISOString());
      return json({
        status: "ok",
        processed: 0,
        stored: 0,
        interactionsCreated: 0,
        interactionsFailed: 0,
        startedAt: startTime.toISOString(),
        endedAt: now.toISOString(),
        latestWorkNoteAt: null,
      });
    }

    const interactions = [];
    const interactionMetadata: Array<{
      sessionId: string;
      caseSysId: string;
      caseNumber: string;
      direction?: string;
      phoneNumber?: string;
      startTime: Date;
      endTime: Date;
    }> = [];
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

      const caseRecord = await serviceNowClient.getCaseBySysId(note.element_id, snContext);
      if (!caseRecord) {
        continue;
      }

      const startTime = parsed.endTime ?? workNoteTime;
      const endTime = parsed.endTime ?? workNoteTime;

      interactions.push({
        sessionId: parsed.sessionId,
        caseNumber: caseRecord.number,
        direction: parsed.direction,
        ani: parsed.phoneNumber,
        startTime,
        endTime,
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

      // Store metadata needed for ServiceNow interaction creation
      interactionMetadata.push({
        sessionId: parsed.sessionId,
        caseSysId: note.element_id,
        caseNumber: caseRecord.number,
        direction: parsed.direction,
        phoneNumber: parsed.phoneNumber,
        startTime,
        endTime,
      });
    }

    await upsertCallInteractions(interactions);

    // Create ServiceNow interaction records for newly stored interactions
    let interactionsCreated = 0;
    let interactionsFailed = 0;

    // Get all interactions that need ServiceNow sync (don't have interaction_sys_id yet)
    const needsSync = await getCallInteractionsNeedingServiceNowSync(interactionMetadata.length);
    const sessionIdsNeedingSync = new Set(needsSync.map(i => i.sessionId));

    for (const metadata of interactionMetadata) {
      try {
        // Check if this interaction already has a ServiceNow interaction record
        if (!sessionIdsNeedingSync.has(metadata.sessionId)) {
          // Already has ServiceNow interaction ID, skip
          continue;
        }

        // Create interaction record in ServiceNow
        const result = await serviceNowClient.createPhoneInteraction(
          {
            caseSysId: metadata.caseSysId,
            caseNumber: metadata.caseNumber,
            channel: 'phone',
            direction: metadata.direction,
            phoneNumber: metadata.phoneNumber,
            sessionId: metadata.sessionId,
            startTime: metadata.startTime,
            endTime: metadata.endTime,
          },
        );

        // Update local record with ServiceNow IDs
        await updateCallInteractionServiceNowIds(
          metadata.sessionId,
          result.interaction_sys_id,
          result.interaction_number
        );

        interactionsCreated++;
        console.log(`[Sync] Created ServiceNow interaction ${result.interaction_number} for session ${metadata.sessionId}`);
      } catch (error) {
        interactionsFailed++;
        console.error(`[Sync] Failed to create ServiceNow interaction for session ${metadata.sessionId}:`, error);
        // Continue processing other interactions even if one fails
      }
    }

    if (maxTimestamp) {
      await setAppSetting(SETTING_KEY, maxTimestamp.toISOString());
    } else {
      await setAppSetting(SETTING_KEY, now.toISOString());
    }

    return json({
      status: "ok",
      processed: notes.length,
      stored: interactions.length,
      interactionsCreated,
      interactionsFailed,
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
