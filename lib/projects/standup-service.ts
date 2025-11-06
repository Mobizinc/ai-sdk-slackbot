import { and, eq, gte, gt, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "../db/client";
import { projectInterviews, projectStandups, projectStandupResponses, type ProjectStandup } from "../db/schema";
import {
  DEFAULT_STANDUP_COLLECTION_MINUTES,
  DEFAULT_STANDUP_MAX_REMINDERS,
  DEFAULT_STANDUP_REMINDER_MINUTES,
  StandupActions,
  StandupCallbackIds,
  STANDUP_TRIGGER_WINDOW_MINUTES,
  STANDUP_REMINDER_BUFFER_MINUTES,
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

type StandupPromptReason = "initial" | "reminder";

interface StandupMetadata {
  participants?: string[];
  questions?: StandupQuestion[];
  schedule?: StandupConfig["schedule"];
  collectionWindowMinutes?: number;
  reminderCounts?: Record<string, number>;
  reminders?: Array<{ sentAt: string; participants: string[] }>;
}

function normalizeStandupConfig(config?: StandupConfig): StandupConfig | null {
  if (!config || !config.enabled) {
    return null;
  }

  const questions = config.questions.length > 0 ? config.questions : DEFAULT_STANDUP_QUESTIONS;

  return {
    ...config,
    questions,
    collectionWindowMinutes: config.collectionWindowMinutes ?? DEFAULT_STANDUP_COLLECTION_MINUTES,
    reminderMinutesBeforeDue: config.reminderMinutesBeforeDue ?? DEFAULT_STANDUP_REMINDER_MINUTES,
    maxReminders: config.maxReminders ?? DEFAULT_STANDUP_MAX_REMINDERS,
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

function parseStandupMetadata(standup: ProjectStandup): StandupMetadata {
  const raw = (standup.metadata ?? {}) as StandupMetadata | null;
  const metadata: StandupMetadata = {
    participants: raw?.participants ?? [],
    questions: raw?.questions ?? [],
    schedule: raw?.schedule,
    collectionWindowMinutes: raw?.collectionWindowMinutes,
    reminderCounts: raw?.reminderCounts ?? {},
    reminders: raw?.reminders ?? [],
  };
  return metadata;
}

export function computeReminderRecipients(input: {
  participants: string[];
  responded: string[];
  metadata: StandupMetadata;
  config: StandupConfig;
  scheduledFor: Date;
  collectUntil: Date;
  now: Date;
}): string[] {
  const { participants, responded, metadata, config, scheduledFor, collectUntil, now } = input;

  if (config.maxReminders <= 0) {
    return [];
  }

  const remainingMs = collectUntil.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return [];
  }

  const minutesRemaining = remainingMs / (60 * 1000);
  if (minutesRemaining > (config.reminderMinutesBeforeDue ?? DEFAULT_STANDUP_REMINDER_MINUTES)) {
    return [];
  }

  const minutesSinceScheduled = (now.getTime() - scheduledFor.getTime()) / (60 * 1000);
  if (minutesSinceScheduled < STANDUP_REMINDER_BUFFER_MINUTES) {
    return [];
  }

  const reminders = metadata.reminders ?? [];
  if (reminders.length > 0) {
    const lastReminder = reminders[reminders.length - 1];
    const minutesSinceLastReminder =
      (now.getTime() - new Date(lastReminder.sentAt).getTime()) / (60 * 1000);
    if (minutesSinceLastReminder < STANDUP_REMINDER_BUFFER_MINUTES) {
      return [];
    }
  }

  const respondedSet = new Set(responded);
  const reminderCounts = metadata.reminderCounts ?? {};

  return participants.filter((participantId) => {
    if (respondedSet.has(participantId)) {
      return false;
    }
    const count = reminderCounts[participantId] ?? 0;
    return count < (config.maxReminders ?? DEFAULT_STANDUP_MAX_REMINDERS);
  });
}

async function persistStandupMetadata(standupId: string, metadata: StandupMetadata): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[Standup] Database unavailable; metadata update skipped");
    return;
  }

  await db
    .update(projectStandups)
    .set({
      metadata,
    })
    .where(eq(projectStandups.id, standupId));
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
        reminderCounts: {},
        reminders: [],
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

function buildStandupPromptBlocks(
  project: ProjectDefinition,
  standup: ProjectStandup,
  participantId: string,
  reason: StandupPromptReason,
) {
  const intro =
    reason === "reminder"
      ? `⏰ Reminder: Stand-up for *${project.name}* is still waiting on your update, <@${participantId}>.`
      : `Hey <@${participantId}>! It's time for the *${project.name}* stand-up.`;
  const context =
    reason === "reminder"
      ? "Please share your update before the collection window closes."
      : "Click the button below to share your update.";

  return [
    createSectionBlock(intro),
    createContextBlock(context),
    createActionsBlock([
      {
        text: reason === "reminder" ? "Add update" : "Submit stand-up",
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
}

async function sendStandupPromptMessage(params: {
  project: ProjectDefinition;
  config: StandupConfig;
  standup: ProjectStandup;
  participantId: string;
  reason: StandupPromptReason;
  reminderCount?: number;
}): Promise<boolean> {
  const { project, config, standup, participantId, reason, reminderCount } = params;

  try {
    const conversation = await slackMessaging.openConversation(participantId);
    if (!conversation.channelId) {
      console.warn(`[Standup] Could not open DM with ${participantId}`);
      return false;
    }

    const blocks = buildStandupPromptBlocks(project, standup, participantId, reason);

    const message = await slackMessaging.postMessage({
      channel: conversation.channelId,
      text:
        reason === "reminder"
          ? `Reminder: stand-up update needed for ${project.name}`
          : `Stand-up check-in for ${project.name}`,
      blocks,
    });

    if (!message.ts) {
      console.warn(`[Standup] Prompt message missing timestamp for ${participantId}`);
      return false;
    }

    const payload: StandupSessionState = {
      standupId: standup.id,
      projectId: project.id,
      participantId,
      questions: config.questions,
      startedAt: new Date().toISOString(),
      source: reason,
      reminderCount,
    };

    const expiresInHours =
      Math.ceil((config.collectionWindowMinutes ?? DEFAULT_STANDUP_COLLECTION_MINUTES) / 60) + 1;

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

    return true;
  } catch (error) {
    console.error(`[Standup] Failed to send ${reason} prompt to ${participantId}`, error);
    return false;
  }
}

async function sendStandupPrompts(
  project: ProjectDefinition,
  config: StandupConfig,
  standup: ProjectStandup,
  participants: string[],
): Promise<void> {
  for (const participantId of participants) {
    await sendStandupPromptMessage({
      project,
      config,
      standup,
      participantId,
      reason: "initial",
    });
  }
}

export async function sendStandupReminders(now: Date): Promise<
  Array<{ standupId: string; projectId: string; notified: string[] }>
> {
  const db = getDb();
  if (!db) {
    console.warn("[Standup] Database unavailable; cannot evaluate reminders");
    return [];
  }

  const openStandups = await db
    .select()
    .from(projectStandups)
    .where(
      and(
        eq(projectStandups.status, "collecting"),
        lt(projectStandups.scheduledFor, now),
        gt(projectStandups.collectUntil, now),
      ),
    );

  const results: Array<{ standupId: string; projectId: string; notified: string[] }> = [];

  for (const standup of openStandups) {
    try {
      const project = await fetchProject(standup.projectId);
      if (!project) {
        console.warn(`[Standup] Project ${standup.projectId} not found while processing reminders`);
        continue;
      }

      const config = getStandupConfig(project);
      if (!config) {
        continue;
      }

      const metadata = parseStandupMetadata(standup);
      const participants =
        metadata.participants && metadata.participants.length > 0
          ? metadata.participants
          : await resolveStandupParticipants(project, config);

      if (participants.length === 0) {
        continue;
      }

      metadata.participants = participants;

      const responses = await db
        .select({ participant: projectStandupResponses.participantSlackId })
        .from(projectStandupResponses)
        .where(eq(projectStandupResponses.standupId, standup.id));

      const responded = responses.map((row) => row.participant);

      const recipients = computeReminderRecipients({
        participants,
        responded,
        metadata,
        config,
        scheduledFor: standup.scheduledFor,
        collectUntil: standup.collectUntil,
        now,
      });

      if (recipients.length === 0) {
        continue;
      }

      const reminderCounts = { ...(metadata.reminderCounts ?? {}) };
      const notified: string[] = [];

      for (const participantId of recipients) {
        const nextCount = (reminderCounts[participantId] ?? 0) + 1;
        const success = await sendStandupPromptMessage({
          project,
          config,
          standup,
          participantId,
          reason: "reminder",
          reminderCount: nextCount,
        });

        if (success) {
          reminderCounts[participantId] = nextCount;
          notified.push(participantId);
        }
      }

      if (notified.length === 0) {
        continue;
      }

      metadata.reminderCounts = reminderCounts;
      const previousReminders = metadata.reminders ?? [];
      metadata.reminders = [
        ...previousReminders,
        { sentAt: now.toISOString(), participants: notified },
      ];

      await persistStandupMetadata(standup.id, metadata);
      standup.metadata = metadata as unknown as Record<string, any>;

      results.push({
        standupId: standup.id,
        projectId: project.id,
        notified,
      });
    } catch (error) {
      console.error(`[Standup] Failed to send reminders for stand-up ${standup.id}`, error);
    }
  }

  return results;
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
  const catalog = await projects.getProjectCatalog();
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

    if (project.mentor?.slackUserId) {
      try {
        const conversation = await slackMessaging.openConversation(project.mentor.slackUserId);
        if (conversation.channelId) {
          await slackMessaging.postMessage({
            channel: conversation.channelId,
            text: `Blockers reported in ${project.name} stand-up`,
            blocks: [
              createSectionBlock(
                `⚠️ *${project.name}* stand-up blockers:\n${blockerText}\n\nPlease follow up with the contributor(s).`,
              ),
            ],
          });
        } else {
          console.warn(
            `[Standup] Could not DM mentor ${project.mentor.slackUserId} about blockers for project ${project.id}`,
          );
        }
      } catch (error) {
        console.error(
          `[Standup] Failed to notify mentor ${project.mentor?.slackUserId} about blockers for stand-up ${standup.id}`,
          error,
        );
      }
    }
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
