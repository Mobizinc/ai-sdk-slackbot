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
import { workflowManager } from "../services/workflow-manager";
import { getSlackMessagingService } from "../services/slack-messaging";
import { getSPMRepository } from "../infrastructure/servicenow/repositories";
import { getGitHubClient } from "../integrations/github/client";
import {
  createActionsBlock,
  createContextBlock,
  createSectionBlock,
  createHeaderBlock,
  createDivider,
} from "../utils/message-styling";
import type { SlackMessagingService } from "../services/slack-messaging";
import {
  buildContextSummaryLine,
  buildStandupParticipantContexts,
  composeAdaptiveQuestions,
  type StandupParticipantContext,
} from "./standup-context";
import type { IssueReference } from "./standup-context";

const WORKFLOW_TYPE_PROJECT_STANDUP = "PROJECT_STANDUP_PROMPT";

function truncateText(value: string, maxLength = 140): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

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

const slackMessaging = getSlackMessagingService();

type StandupPromptReason = "initial" | "reminder";

interface StandupMetadata {
  participants?: string[];
  questions?: StandupQuestion[];
  schedule?: StandupConfig["schedule"];
  collectionWindowMinutes?: number;
  reminderCounts?: Record<string, number>;
  reminders?: Array<{ sentAt: string; participants: string[] }>;
  participantQuestions?: Record<string, StandupQuestion[]>;
  participantContexts?: Record<string, StandupParticipantContext>;
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

async function gatherExternalStandupContext(project: ProjectDefinition, config: StandupConfig): Promise<{
  extraDependencyNotes: string[];
  extraIssueRefs: IssueReference[];
}> {
  const notes: string[] = [];
  const issueRefs: IssueReference[] = [];

  // SPM tasks (stories/epics)
  const spmId = (project as any).spmSysId || (project as any).spm?.sysId;
  if (config.dataSources?.useSpmTasks && spmId) {
    try {
      const repo = getSPMRepository();
      const [stories, epics] = await Promise.all([
        repo.findRelatedStories(spmId).catch(() => []),
        repo.findRelatedEpics(spmId).catch(() => []),
      ]);

      const storySummaries = stories.slice(0, 5).map((s) => `${s.number}: ${s.shortDescription ?? ""}`.trim());
      const epicSummaries = epics.slice(0, 3).map((e) => `${e.number}: ${e.shortDescription ?? ""}`.trim());
      if (storySummaries.length > 0) {
        notes.push(`SPM stories: ${storySummaries.join("; ")}`);
      }
      if (epicSummaries.length > 0) {
        notes.push(`SPM epics: ${epicSummaries.join("; ")}`);
      }
      stories.slice(0, 5).forEach((s) => {
        issueRefs.push({
          raw: s.number ? `SPM-${s.number}` : s.sysId,
          source: "spm",
          normalizedId: s.number ?? s.sysId,
          status: s.state,
        });
      });
    } catch (error) {
      console.warn(`[Standup] Failed to fetch SPM context for project ${project.id}:`, error);
    }
  }

  // GitHub issues/PRs
  if (config.dataSources?.useGithubIssues && project.githubRepo) {
    const parts = project.githubRepo.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      try {
        const client = await getGitHubClient();
        const [issuesResp, prsResp] = await Promise.all([
          client.issues.listForRepo({ owner: parts[0], repo: parts[1], state: "open", per_page: 5, sort: "updated" }),
          client.pulls.list({ owner: parts[0], repo: parts[1], state: "open", per_page: 5, sort: "updated" }),
        ]);
        const issueSummaries = issuesResp.data.map((i: typeof issuesResp.data[number]) => `#${i.number}: ${i.title}`);
        const prSummaries = prsResp.data.map((p: typeof prsResp.data[number]) => `PR#${p.number}: ${p.title}`);
        if (issueSummaries.length) {
          notes.push(`GitHub issues: ${issueSummaries.join("; ")}`);
        }
        if (prSummaries.length) {
          notes.push(`GitHub PRs: ${prSummaries.join("; ")}`);
        }
        issuesResp.data.forEach((i: typeof issuesResp.data[number]) =>
          issueRefs.push({
            raw: `#${i.number}`,
            source: "github",
            normalizedId: String(i.number),
            status: i.state,
          }),
        );
        prsResp.data.forEach((p: typeof prsResp.data[number]) =>
          issueRefs.push({
            raw: `PR#${p.number}`,
            source: "github",
            normalizedId: String(p.number),
            status: p.state,
          }),
        );
      } catch (error) {
        console.warn(`[Standup] Failed to fetch GitHub context for project ${project.id}:`, error);
      }
    }
  }

  return { extraDependencyNotes: notes, extraIssueRefs: issueRefs };
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
    participantQuestions: raw?.participantQuestions ?? {},
    participantContexts: raw?.participantContexts ?? {},
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
  // Validate channel before creating standup
  const channelId = config.channelId ?? project.channelId;
  if (channelId) {
    try {
      const channelInfo = await slackMessaging.getConversationInfo(channelId);
      if (!channelInfo || !channelInfo.channel) {
        console.error(
          `[Standup] Channel ${channelId} not found or bot not in channel for project ${project.id}. Standup creation aborted.`,
        );
        return null;
      }
    } catch (error) {
      console.error(
        `[Standup] Failed to validate channel ${channelId} for project ${project.id}:`,
        error,
      );
      return null;
    }
  } else {
    console.warn(`[Standup] No channel configured for project ${project.id}; standup creation skipped`);
    return null;
  }

  const participants = await resolveStandupParticipants(project, config);
  if (participants.length === 0) {
    console.warn(`[Standup] No participants configured for project ${project.id}`);
    return null;
  }

  const standupRecord = await insertStandupRecord(project, config, scheduledFor, participants);
  if (!standupRecord) {
    return null;
  }

  const external = await gatherExternalStandupContext(project, config);
  const contexts = await buildStandupParticipantContexts(project, participants, {
    extraDependencyNotes: external.extraDependencyNotes,
    extraIssueRefs: external.extraIssueRefs,
  });
  await sendStandupPrompts(project, config, standupRecord, participants, contexts);

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
  contextSummary?: string,
) {
  const intro =
    reason === "reminder"
      ? `⏰ Reminder: Stand-up for *${project.name}* is still waiting on your update, <@${participantId}>.`
      : `Hey <@${participantId}>! It's time for the *${project.name}* stand-up.`;
  const context =
    reason === "reminder"
      ? "Please share your update before the collection window closes."
      : "Click the button below to share your update.";

  const blocks = [createSectionBlock(intro), createContextBlock(context)];

  if (contextSummary) {
    blocks.push(createContextBlock(contextSummary));
  }

  blocks.push(
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
  );

  return blocks;
}

async function sendStandupPromptMessage(params: {
  project: ProjectDefinition;
  config: StandupConfig;
  standup: ProjectStandup;
  participantId: string;
  questions: StandupQuestion[];
  reason: StandupPromptReason;
  context?: StandupParticipantContext;
  reminderCount?: number;
}): Promise<boolean> {
  const { project, config, standup, participantId, questions, reason, context, reminderCount } = params;

  if (!workflowManager) {
    console.warn("[Standup] WorkflowManager not available, cannot send prompt.");
    return false;
  }

  try {
    const conversation = await slackMessaging.openConversation(participantId);
    if (!conversation.channelId) {
      console.warn(`[Standup] Could not open DM with ${participantId}`);
      return false;
    }

    const summaryLine = buildContextSummaryLine(context);
    const blocks = buildStandupPromptBlocks(project, standup, participantId, reason, summaryLine);

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
      questions,
      startedAt: new Date().toISOString(),
      source: reason,
      reminderCount,
    };

    const expiresInHours =
      Math.ceil((config.collectionWindowMinutes ?? DEFAULT_STANDUP_COLLECTION_MINUTES) / 60) + 1;

    await workflowManager.start({
        workflowType: WORKFLOW_TYPE_PROJECT_STANDUP,
        workflowReferenceId: `${conversation.channelId}:${message.ts}`,
        initialState: 'AWAITING_RESPONSE',
        payload,
        expiresInSeconds: expiresInHours * 3600,
        contextKey: `standup:${standup.id}`,
        correlationId: participantId,
    });

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
  contexts: Map<string, StandupParticipantContext>,
): Promise<void> {
  const metadata = parseStandupMetadata(standup);
  const participantQuestions: Record<string, StandupQuestion[]> = {
    ...(metadata.participantQuestions ?? {}),
  };
  const participantContexts: Record<string, StandupParticipantContext> = {
    ...(metadata.participantContexts ?? {}),
  };

  for (const participantId of participants) {
    const context = contexts.get(participantId);
    const adaptiveQuestions = composeAdaptiveQuestions(config.questions, context);
    participantQuestions[participantId] = adaptiveQuestions;
    if (context) {
      participantContexts[participantId] = context;
    }

    await sendStandupPromptMessage({
      project,
      config,
      standup,
      participantId,
      questions: adaptiveQuestions,
      reason: "initial",
      context,
    });
  }

  const mergedMetadata: StandupMetadata = {
    ...metadata,
    participantQuestions,
    participantContexts,
  };

  await persistStandupMetadata(standup.id, mergedMetadata);
  standup.metadata = mergedMetadata as unknown as Record<string, any>;
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
      const participantQuestions: Record<string, StandupQuestion[]> = {
        ...(metadata.participantQuestions ?? {}),
      };
      const storedContexts = metadata.participantContexts ?? {};
      const contextMap = new Map<string, StandupParticipantContext>(
        Object.entries(storedContexts).map(([key, value]) => [key, value]),
      );

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
      const missingContexts = recipients.filter((participantId) => !contextMap.has(participantId));
      if (missingContexts.length > 0) {
        const fetched = await buildStandupParticipantContexts(project, missingContexts);
        fetched.forEach((context, key) => contextMap.set(key, context));
      }

      for (const participantId of recipients) {
        const nextCount = (reminderCounts[participantId] ?? 0) + 1;
        const context = contextMap.get(participantId);
        const adaptiveQuestions =
          participantQuestions[participantId] ??
          composeAdaptiveQuestions(config.questions, context);
        participantQuestions[participantId] = adaptiveQuestions;

        const success = await sendStandupPromptMessage({
          project,
          config,
          standup,
          participantId,
          questions: adaptiveQuestions,
          reason: "reminder",
          reminderCount: nextCount,
          context,
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
      metadata.participantContexts = {
        ...Object.fromEntries(contextMap),
      };
      metadata.participantQuestions = participantQuestions;

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
      contextSnapshot: projectStandupResponses.contextSnapshot,
      insights: projectStandupResponses.insights,
    })
    .from(projectStandupResponses)
    .where(eq(projectStandupResponses.standupId, standup.id));

  const metadata = (standup.metadata ?? {}) as {
    participants?: string[];
    questions?: StandupQuestion[];
    participantQuestions?: Record<string, StandupQuestion[]>;
    participantContexts?: Record<string, StandupParticipantContext>;
  };

  const participants = metadata.participants ?? [];
  const baseQuestions = metadata.questions ?? config.questions;
  const participantQuestions = metadata.participantQuestions ?? {};
  const participantContexts = metadata.participantContexts ?? {};

  const aggregatedQuestions = new Map<string, string>();
  for (const question of baseQuestions) {
    aggregatedQuestions.set(question.id, question.prompt);
  }
  for (const questionList of Object.values(participantQuestions)) {
    for (const question of questionList) {
      if (!aggregatedQuestions.has(question.id)) {
        aggregatedQuestions.set(question.id, question.prompt);
      }
    }
  }

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

  for (const [questionId, prompt] of aggregatedQuestions) {
    const responses = rows
      .filter((row) => typeof row.answers === "object" && questionId in row.answers)
      .map((row) => ({
        participant: row.participant,
        answer: (row.answers as Record<string, string>)[questionId] ?? "",
      }));

    if (responses.length === 0) {
      continue;
    }

    const responseText = responses
      .map(({ participant, answer }) => `• <@${participant}> — ${answer || "(no response)"}`)
      .join("\n");

    blocks.push(createSectionBlock(`*${prompt}*\n${responseText}`));
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

  const followUpLines = rows
    .map((row) => {
      const context =
        participantContexts[row.participant] ??
        ((row.contextSnapshot ?? {}) as Record<string, any>);
      const previousPlan = (context?.previousPlan as string | undefined)?.trim();
      if (!previousPlan) {
        return null;
      }

      const answers = row.answers as Record<string, string>;
      const progressAnswer =
        answers.plan_followup ??
        answers.yesterday ??
        answers["yesterday"] ??
        answers.today ??
        "";
      const normalizedProgress = progressAnswer.trim();
      const statusLower = normalizedProgress.toLowerCase();

      let statusEmoji = "⏳";
      if (!normalizedProgress) {
        statusEmoji = "⏳";
      } else if (/(done|completed|finished|merged|shipped|resolved)/i.test(statusLower)) {
        statusEmoji = "✅";
      } else if (/(blocked|waiting|stuck|pending|hold|issue)/i.test(statusLower)) {
        statusEmoji = "⚠️";
      }

      const issueReferences = Array.isArray(context?.issueReferences)
        ? (context.issueReferences as Array<{ raw?: string }>)
            .map((ref) => (typeof ref === "string" ? ref : ref?.raw))
            .filter(Boolean)
        : [];
      const issueSummary = issueReferences.length > 0 ? ` (${issueReferences.join(", ")})` : "";

      const progressSummary = normalizedProgress || "no update yet";

      return `${statusEmoji} <@${row.participant}> planned "${truncateText(
        previousPlan,
      )}" → ${truncateText(progressSummary)}${issueSummary}`;
    })
    .filter((line): line is string => Boolean(line));

  if (followUpLines.length > 0) {
    blocks.push(createDivider());
    blocks.push(createSectionBlock(`🔁 *Plan follow-ups*\n${followUpLines.join("\n")} `));
  }

  const channelId = config.channelId ?? project.channelId;
  if (channelId) {
    // Validate channel exists before posting
    try {
      const channelInfo = await slackMessaging.getConversationInfo(channelId);
      if (!channelInfo || !channelInfo.channel) {
        console.error(
          `[Standup] Channel ${channelId} not found or bot not in channel for project ${project.id}`,
        );
        throw new Error(
          `Channel ${channelId} not found. Please verify the channel ID and ensure the bot is a member of the channel.`,
        );
      }

      await slackMessaging.postMessage({
        channel: channelId,
        text: `Stand-up summary for ${project.name}`,
        blocks,
      });
    } catch (error) {
      console.error(`[Standup] Failed to post summary to channel ${channelId}:`, error);
      // Update standup status to failed instead of completed
      await db
        .update(projectStandups)
        .set({
          status: "failed",
          metadata: {
            ...standup.metadata,
            error: error instanceof Error ? error.message : "Failed to post summary to channel",
            channelId,
          } as Record<string, unknown>,
        })
        .where(eq(projectStandups.id, standup.id));
      throw error; // Re-throw to prevent marking as completed below
    }
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
