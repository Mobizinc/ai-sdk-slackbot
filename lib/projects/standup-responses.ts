import { eq } from "drizzle-orm";
import { getInteractiveStateManager } from "../services/interactive-state-manager";
import { getSlackMessagingService } from "../services/slack-messaging";
import type { StandupQuestion, StandupSessionState } from "./types";
import { StandupCallbackIds } from "./standup-constants";
import { getDb } from "../db/client";
import { projectStandupResponses, projectStandups } from "../db/schema";
import { createPlainTextInput, createInputBlock, createModalView } from "../utils/message-styling";

const stateManager = getInteractiveStateManager();
const slackMessaging = getSlackMessagingService();

interface StandupModalMetadata {
  channelId: string;
  messageTs: string;
  standupId: string;
  projectId: string;
  participantId: string;
}

export async function openStandupModal(options: {
  triggerId: string;
  channelId: string;
  messageTs: string;
}): Promise<void> {
  const state = await stateManager.getState<"project_standup">(options.channelId, options.messageTs, "project_standup");
  if (!state) {
    console.warn("[Standup] No stand-up state found for modal open", options);
    return;
  }

  const payload = state.payload as StandupSessionState;
  const metadata: StandupModalMetadata = {
    channelId: options.channelId,
    messageTs: options.messageTs,
    standupId: payload.standupId,
    projectId: payload.projectId,
    participantId: payload.participantId,
  };

  const view = buildStandupModal(payload.questions, metadata);
  await slackMessaging.openView({
    triggerId: options.triggerId,
    view,
  });
}

function buildStandupModal(questions: StandupQuestion[], metadata: StandupModalMetadata) {
  const blocks = questions.map((question) =>
    createInputBlock({
      blockId: `standup_question_${question.id}`,
      label: question.prompt,
      element: createPlainTextInput({
        actionId: `standup_question_${question.id}_value`,
        placeholder: question.helper,
        multiline: true,
      }),
      optional: false,
    }),
  );

  return createModalView({
    title: "Project Stand-up",
    submit: "Submit",
    close: "Cancel",
    callbackId: StandupCallbackIds.MODAL,
    privateMetadata: JSON.stringify(metadata),
    blocks,
  });
}

export async function handleStandupModalSubmission(payload: any): Promise<void> {
  const metadata = parseMetadata(payload.view?.private_metadata);
  if (!metadata) {
    console.warn("[Standup] Invalid stand-up modal metadata");
    return;
  }

  const state = await stateManager.getState<"project_standup">(metadata.channelId, metadata.messageTs, "project_standup");
  if (!state) {
    console.warn("[Standup] Stand-up state expired for", metadata);
    return;
  }

  const payloadState = state.payload as StandupSessionState;
  const answers = extractAnswers(payload.view?.state?.values ?? {}, payloadState.questions);

  await upsertStandupResponse(metadata.standupId, metadata.participantId, answers);

  await stateManager.markProcessed(metadata.channelId, metadata.messageTs, metadata.participantId, "completed");

  await slackMessaging.postMessage({
    channel: metadata.channelId,
    text: "Thanks for your stand-up update!",
  });
}

function parseMetadata(raw: string | undefined): StandupModalMetadata | null {
  if (!raw) {
    return null;
  }

  try {
    const metadata = JSON.parse(raw);
    if (
      typeof metadata.channelId === "string" &&
      typeof metadata.messageTs === "string" &&
      typeof metadata.standupId === "string" &&
      typeof metadata.projectId === "string" &&
      typeof metadata.participantId === "string"
    ) {
      return metadata;
    }
  } catch (error) {
    console.error("[Standup] Failed to parse modal metadata", error);
  }

  return null;
}

function extractAnswers(values: Record<string, any>, questions: StandupQuestion[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const question of questions) {
    const blockId = `standup_question_${question.id}`;
    const actionId = `standup_question_${question.id}_value`;
    const block = values[blockId];
    const value = block?.[actionId]?.value ?? "";
    result[question.id] = value.trim();
  }

  return result;
}

async function upsertStandupResponse(
  standupId: string,
  participantId: string,
  answers: Record<string, string>,
): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[Standup] Database unavailable; cannot persist stand-up response");
    return;
  }

  const blockerResponse = answers.blockers || "";
  const blockerFlag = blockerResponse.trim().length > 0 && blockerResponse.trim().toLowerCase() !== "none";

  let contextSnapshot: Record<string, any> = {};
  let insights: Record<string, any> = {};

  try {
    const [record] = await db
      .select({ metadata: projectStandups.metadata })
      .from(projectStandups)
      .where(eq(projectStandups.id, standupId))
      .limit(1);

    const metadata = (record?.metadata ?? {}) as Record<string, any>;
    const participantContexts = (metadata.participantContexts ?? {}) as Record<string, any>;
    contextSnapshot = participantContexts[participantId] ?? {};

    const issueReferences = Array.isArray(contextSnapshot.issueReferences)
      ? contextSnapshot.issueReferences
          .map((ref: any) => (typeof ref === "string" ? ref : ref?.raw))
          .filter(Boolean)
      : [];

    insights = {
      previousPlan: contextSnapshot.previousPlan ?? null,
      dependencyNotes: contextSnapshot.dependencyNotes ?? [],
      issueReferences,
    };
  } catch (error) {
    console.error("[Standup] Failed to load stand-up metadata for response insights", error);
  }

  await db
    .insert(projectStandupResponses)
    .values({
      standupId,
      participantSlackId: participantId,
      answers,
      blockerFlag,
      contextSnapshot,
      insights,
    })
    .onConflictDoUpdate({
      target: [projectStandupResponses.standupId, projectStandupResponses.participantSlackId],
      set: {
        answers,
        blockerFlag,
        submittedAt: new Date(),
        contextSnapshot,
        insights,
      },
    });
}

export async function clearStandupState(channelId: string, messageTs: string, participantId: string): Promise<void> {
  await stateManager.markProcessed(channelId, messageTs, participantId, "completed");
}
