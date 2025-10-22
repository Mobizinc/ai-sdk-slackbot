import { desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  callInteractions,
  callTranscripts,
  type CallInteraction,
  type CallTranscript,
  type NewCallInteraction,
  type NewCallTranscript,
} from "../schema";

export async function upsertCallInteractions(
  interactions: NewCallInteraction[],
): Promise<void> {
  if (!interactions.length) {
    return;
  }

  const db = getDb();
  if (!db) {
    return;
  }

  await db
    .insert(callInteractions)
    .values(
      interactions.map((interaction) => ({
        ...interaction,
        updatedAt: interaction.updatedAt ?? new Date(),
        syncedAt: interaction.syncedAt ?? new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: callInteractions.sessionId,
      set: {
        contactId: sql`excluded.contact_id`,
        caseNumber: sql`excluded.case_number`,
        direction: sql`excluded.direction`,
        ani: sql`excluded.ani`,
        dnis: sql`excluded.dnis`,
        agentId: sql`excluded.agent_id`,
        agentName: sql`excluded.agent_name`,
        queueName: sql`excluded.queue_name`,
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        durationSeconds: sql`excluded.duration_seconds`,
        wrapUpCode: sql`excluded.wrap_up_code`,
        recordingId: sql`excluded.recording_id`,
        transcriptStatus: sql`excluded.transcript_status`,
        rawPayload: sql`excluded.raw_payload`,
        updatedAt: sql`NOW()`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

export async function getCallInteractionsForCase(
  caseNumber: string,
): Promise<CallInteraction[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return db
    .select()
    .from(callInteractions)
    .where(eq(callInteractions.caseNumber, caseNumber))
    .orderBy(desc(callInteractions.startTime));
}

export async function getMostRecentInteractionSync(): Promise<Date | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [row] = await db
      .select({
        syncedAt: callInteractions.syncedAt,
      })
      .from(callInteractions)
      .orderBy(desc(callInteractions.syncedAt))
      .limit(1);

    return row?.syncedAt ?? null;
  } catch (error) {
    console.warn("[DB] call_interactions not available yet, skipping latest sync lookup");
    return null;
  }
}

export async function getSessionsNeedingTranscripts(limit = 20): Promise<CallInteraction[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(callInteractions)
      .where(eq(callInteractions.transcriptStatus, "pending"))
      .orderBy(desc(callInteractions.startTime))
      .limit(limit);
  } catch (error) {
    console.warn("[DB] call_interactions not available yet, skipping transcript lookup");
    return [];
  }
}

export async function updateTranscriptStatusForSessions(
  sessionIds: string[],
  status: string,
): Promise<void> {
  if (!sessionIds.length) {
    return;
  }

  const db = getDb();
  if (!db) {
    return;
  }

  await db
    .update(callInteractions)
    .set({
      transcriptStatus: status,
      updatedAt: new Date(),
    })
    .where(inArray(callInteractions.sessionId, sessionIds));
}

export async function upsertTranscript(
  transcript: NewCallTranscript,
): Promise<CallTranscript> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not configured");
  }

  const [row] = await db
    .insert(callTranscripts)
    .values({
      ...transcript,
      updatedAt: transcript.updatedAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: callTranscripts.sessionId,
      set: {
        provider: sql`excluded.provider`,
        status: sql`excluded.status`,
        language: sql`excluded.language`,
        transcriptText: sql`excluded.transcript_text`,
        transcriptJson: sql`excluded.transcript_json`,
        audioUrl: sql`excluded.audio_url`,
        errorMessage: sql`excluded.error_message`,
        updatedAt: sql`NOW()`,
      },
    })
    .returning();

  return row;
}

export async function getTranscriptsNewerThan(
  since: Date,
): Promise<CallTranscript[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return db
    .select()
    .from(callTranscripts)
    .where(gt(callTranscripts.updatedAt, since))
    .orderBy(desc(callTranscripts.updatedAt));
}

/**
 * Get call interactions that need to be synced to ServiceNow
 * Returns interactions where servicenow_interaction_sys_id is NULL
 */
export async function getCallInteractionsNeedingServiceNowSync(
  limit = 100,
): Promise<CallInteraction[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(callInteractions)
      .where(sql`${callInteractions.servicenowInteractionSysId} IS NULL`)
      .orderBy(desc(callInteractions.startTime))
      .limit(limit);
  } catch (error) {
    console.warn("[DB] Error fetching interactions needing ServiceNow sync:", error);
    return [];
  }
}

/**
 * Update call interaction with ServiceNow interaction IDs after creation
 */
export async function updateCallInteractionServiceNowIds(
  sessionId: string,
  servicenowInteractionSysId: string,
  servicenowInteractionNumber: string,
): Promise<void> {
  const db = getDb();
  if (!db) {
    return;
  }

  await db
    .update(callInteractions)
    .set({
      servicenowInteractionSysId,
      servicenowInteractionNumber,
      servicenowSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(callInteractions.sessionId, sessionId));
}
