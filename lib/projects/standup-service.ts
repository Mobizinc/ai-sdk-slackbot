import { and, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "../db/client";
import { projectInterviews, projectStandups, projectStandupResponses, type ProjectStandup } from "../db/schema";
import {
  DEFAULT_STANDUP_COLLECTION_MINUTES,
  StandupActions,
  StandupCallbackIds,
  STANDUP_TRIGGER_WINDOW_MINUTES,
} from "./standup-constants";
import type { ProjectDefinition, StandupConfig, StandupQuestion, StandupSessionState } from "./types";
import { getInteractiveStateManager } from "../services/interactive-state-manager";
import { getSlackMessagingService } from "../services/slack-messaging";
import {
  createActionsBlock,
  createContextBlock,
  createSectionBlock,
  createHeaderBlock,
  createDivider,
} from "../utils/message-styling";
import type { SlackMessagingService } from "../services/slack-messaging";

const DEFAULT_STANDUP_QUESTIONS: StandupQuestion[] = [
  {
    id: "yesterday",
    prompt: "What did you work on since the last check-in?",
  },
  {
    id: "today",
    prompt: "What do you plan to accomplish before the next check-in?",
  },
  {
    id: "blockers",
    prompt: "Do you have any blockers or need support?",
    helper: "If none, reply with 'none'.",
  },
];

interface StandupTriggerContext {
  project: ProjectDefinition;
  config: StandupConfig;
  now: Date;
}

interface StandupCreateResult {
  standup: ProjectStandup;
  participants: string[];
}

const stateManager = getInteractiveStateManager();
const slackMessaging = getSlackMessagingService();

function normalizeStandupConfig(config?: StandupConfig): StandupConfig | null {
  if (!config || !config.enabled) {
    return null;
  }

  const questions = config.questions.length > 0 ? config.questions : DEFAULT_STANDUP_QUESTIONS;

  return {
    ...config,
    questions,
    collectionWindowMinutes: config.collectionWindowMinutes ?? DEFAULT_STANDUP_COLLECTION_MINUTES,
  };
}

export function getStandupConfig(project: ProjectDefinition): StandupConfig | null {
  return normalizeStandupConfig(project.standup);
}

export function computeScheduledTime(config: StandupConfig, now: Date): Date {
  const [hours, minutes] = config.schedule.timeUtc.split(":").map(Number);
  const scheduled = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0, 0));
  return scheduled;
}

export function isStandupDue(config: StandupConfig, now: Date): boolean {
  const scheduled = computeScheduledTime(config, now);

  const frequency = config.schedule.frequency;
  const day = scheduled.getUTCDay();

  if (frequency === "weekdays" && (day === 0 || day === 6)) {
    return false;
  }

  if (frequency === "weekly") {
    const targetDay = config.schedule.dayOfWeek ?? 1; // default Monday
    if (day !== targetDay) {
      return false;
    }
  }

  const diffMinutes = (now.getTime() - scheduled.getTime()) / (60 * 1000);
  return diffMinutes >= 0 && diffMinutes <= STANDUP_TRIGGER_WINDOW_MINUTES;
}

async function hasStandupAlreadyScheduled(projectId: string, scheduledFor: Date): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return false;
  }

  const windowStart = new Date(scheduledFor.getTime() - 10 * 60 * 1000);
  const windowEnd = new Date(scheduledFor.getTime() + 10 * 60 * 1000);

  const existing = await db
    .select({ id: projectStandups.id })
    .from(projectStandups)
    .where(
      and(
        eq(projectStandups.projectId, projectId),
        gte(projectStandups.scheduledFor, windowStart),
        lt(projectStandups.scheduledFor, windowEnd),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

async function resolveStandupParticipants(project: ProjectDefinition, config: StandupConfig): Promise<string[]> {
  const participantSet = new Set<string>();

  for (const id of config.participants) {
    participantSet.add(id);
  }

  if (config.includeMentor && project.mentor?.slackUserId) {
    participantSet.add(project.mentor.slackUserId);
  }

  if (config.includeAcceptedCandidates) {
    const db = getDb();
    if (db) {
      const candidates = await db
        .select({ candidate: projectInterviews.candidateSlackId })
        .from(projectInterviews)
        .where(
          and(
            eq(projectInterviews.projectId, project.id),
            inArray(projectInterviews.status, ["accepted", "in_progress"]),
          ),
        );

      for (const row of candidates) {
        participantSet.add(row.candidate);
      }
    }
  }

  return Array.from(participantSet);
}

async function insertStandupRecord(project: ProjectDefinition, config: StandupConfig, scheduledFor: Date, participants: string[]): Promise<ProjectStandup | null> {
  const db = getDb();
  if (!db) {
    console.warn("[Standup] Database unavailable; skipping stand-up record creation");
    return null;
  }

  const collectUntil = new Date(scheduledFor.getTime() + config.collectionWindowMinutes * 60 * 1000);

  const [inserted] = await db
    .insert(projectStandups)
    .values({
      projectId: project.id,
      scheduledFor,
      collectUntil,
      channelId: config.channelId ?? project.channelId ?? null,
      metadata: {
        participants,
        questions: config.questions,
        schedule: config.schedule,
        collectionWindowMinutes: config.collectionWindowMinutes,
      },
    })
    .returning();

  return inserted ?? null;
}

export async function triggerStandupIfDue({ project, config, now }: StandupTriggerContext): Promise<StandupCreateResult | null> {
  if (!isStandupDue(config, now)) {
    return null;
  }

  const scheduledFor = computeScheduledTime(config, now);

  if (await hasStandupAlreadyScheduled(project.id, scheduledFor)) {
    return null;
  }
  return createStandupRun(project, config, scheduledFor);
}

export async function triggerStandupManually(project: ProjectDefinition, config: StandupConfig, now = new Date()): Promise<StandupCreateResult | null> {
  return createStandupRun(project, config, now);
}

async function createStandupRun(project: ProjectDefinition, config: StandupConfig, scheduledFor: Date): Promise<StandupCreateResult | null> {
  const participants = await resolveStandupParticipants(project, config);
  if (participants.length === 0) {
    console.warn(`[Standup] No participants configured for project ${project.id}`);
    return null;
  }

  const standupRecord = await insertStandupRecord(project, config, scheduledFor, participants);
  if (!standupRecord) {
    return null;
  }

  await sendStandupPrompts(project, config, standupRecord, participants);

  return {
    standup: standupRecord,
    participants,
  };
}

async function sendStandupPrompts(
  project: ProjectDefinition,
  config: StandupConfig,
  standup: ProjectStandup,
  participants: string[],
): Promise<void> {
  for (const participantId of participants) {
    try {
      const conversation = await slackMessaging.openConversation(participantId);
      if (!conversation.channelId) {
        console.warn(`[Standup] Could not open DM with ${participantId}`);
        continue;
      }

      const blocks = [
        createSectionBlock(`Hey <@${participantId}>! It's time for the *${project.name}* stand-up.`),
        createContextBlock("Click the button below to share your update."),
        createActionsBlock([
          {
            text: "Submit stand-up",
            actionId: StandupActions.OPEN_MODAL,
            style: "primary",
            value: JSON.stringify({
              standupId: standup.id,
              projectId: project.id,
              participantId,
            }),
          },
        ]),
      ];

      const message = await slackMessaging.postMessage({
        channel: conversation.channelId,
        text: `Stand-up check-in for ${project.name}`,
        blocks,
      });

      if (!message.ts) {
        continue;
      }

      const payload: StandupSessionState = {
        standupId: standup.id,
        projectId: project.id,
        participantId,
        questions: config.questions,
        startedAt: new Date().toISOString(),
      };

      const expiresInHours = Math.ceil((config.collectionWindowMinutes ?? DEFAULT_STANDUP_COLLECTION_MINUTES) / 60) + 1;

      await stateManager.saveState(
        "project_standup",
        conversation.channelId,
        message.ts,
        payload,
        {
          expiresInHours,
          metadata: {
            standupId: standup.id,
            projectId: project.id,
          },
        },
      );
    } catch (error) {
      console.error(`[Standup] Failed to send prompt to ${participantId}`, error);
    }
  }
}

export async function finalizeDueStandups(now: Date): Promise<number> {
  const db = getDb();
  if (!db) {
    console.warn("[Standup] Database unavailable; cannot close stand-ups");
    return 0;
  }

  const dueStandups = await db
    .select()
    .from(projectStandups)
    .where(
      and(
        eq(projectStandups.status, "collecting"),
        lte(projectStandups.collectUntil, now),
      ),
    );

  let completed = 0;

  for (const standup of dueStandups) {
    try {
      const project = await fetchProject(standup.projectId);
      if (!project) {
        console.warn(`[Standup] Project ${standup.projectId} no longer exists`);
        continue;
      }

      const config = getStandupConfig(project);
      if (!config) {
        console.warn(`[Standup] Stand-up config missing for project ${project.id}`);
        continue;
      }

      await postStandupSummary(standup, project, config);
      completed += 1;
    } catch (error) {
      console.error(`[Standup] Failed to finalize stand-up ${standup.id}`, error);
    }
  }

  return completed;
}

async function fetchProject(projectId: string): Promise<ProjectDefinition | undefined> {
  const projects = await import("./catalog");
  const catalog = projects.getProjectCatalog();
  return catalog.find((proj) => proj.id === projectId);
}

async function postStandupSummary(
  standup: ProjectStandup,
  project: ProjectDefinition,
  config: StandupConfig,
): Promise<void> {
  const db = getDb();
  if (!db) {
    return;
  }

  const rows = await db
    .select({
      participant: projectStandupResponses.participantSlackId,
      answers: projectStandupResponses.answers,
      blockerFlag: projectStandupResponses.blockerFlag,
      submittedAt: projectStandupResponses.submittedAt,
    })
    .from(projectStandupResponses)
    .where(eq(projectStandupResponses.standupId, standup.id));

  const metadata = (standup.metadata ?? {}) as {
    participants?: string[];
    questions?: StandupQuestion[];
  };

  const participants = metadata.participants ?? [];
  const questions = metadata.questions ?? config.questions;

  const respondedSet = new Set(rows.map((row) => row.participant));
  const responders = participants.filter((id) => respondedSet.has(id));
  const missing = participants.filter((id) => !respondedSet.has(id));

  const blocks = [
    createHeaderBlock(`📋 Stand-up summary — ${project.name}`),
    createContextBlock(
      `Scheduled for ${standup.scheduledFor.toISOString()} (UTC). ${responders.length}/${participants.length} responded.`,
    ),
    createDivider(),
  ];

  if (responders.length > 0) {
    blocks.push(createSectionBlock(`✅ Responses: ${responders.map((id) => `<@${id}>`).join(", ")}`));
  }

  if (missing.length > 0) {
    blocks.push(createSectionBlock(`⏳ Awaiting: ${missing.map((id) => `<@${id}>`).join(", ")}`));
  }

  blocks.push(createDivider());

  for (const question of questions) {
    const responses = rows
      .filter((row) => typeof row.answers === "object" && question.id in row.answers)
      .map((row) => ({ participant: row.participant, answer: (row.answers as Record<string, string>)[question.id] ?? "" }));

    if (responses.length === 0) {
      continue;
    }

    const responseText = responses
      .map(({ participant, answer }) => `• <@${participant}> — ${answer || "(no response)"}`)
      .join("\n");

    blocks.push(createSectionBlock(`*${question.prompt}*\n${responseText}`));
  }

  const blockers = rows.filter((row) => row.blockerFlag);
  if (blockers.length > 0) {
    const blockerText = blockers
      .map(({ participant, answers }) => `• <@${participant}> — ${(answers as Record<string, string>).blockers}`)
      .join("\n");
    blocks.push(createSectionBlock(`⚠️ *Blockers*\n${blockerText}`));
  }

  const channelId = config.channelId ?? project.channelId;
  if (channelId) {
    await slackMessaging.postMessage({
      channel: channelId,
      text: `Stand-up summary for ${project.name}`,
      blocks,
    });
  } else {
    console.warn(`[Standup] No channel configured for project ${project.id}; summary skipped`);
  }

  await db
    .update(projectStandups)
    .set({
      status: "completed",
      completedAt: new Date(),
      summary: {
        responders,
        missing,
        responses: rows,
      },
    })
    .where(eq(projectStandups.id, standup.id));
}

export function getStandupQuestions(config: StandupConfig): StandupQuestion[] {
  return config.questions.length > 0 ? config.questions : DEFAULT_STANDUP_QUESTIONS;
}

export function getStandupActionIds() {
  return StandupActions;
}

export function getStandupCallbackIds() {
  return StandupCallbackIds;
}
