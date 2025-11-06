import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { projectStandups, projectStandupResponses } from "../db/schema";
import type { ProjectDefinition, StandupQuestion } from "./types";

export interface IssueReference {
  raw: string;
  source: "github" | "spm" | "unknown";
  normalizedId: string;
  status?: string;
}

export interface StandupParticipantContext {
  participantId: string;
  lastStandupId?: string;
  lastSubmittedAt?: string;
  previousPlan?: string;
  previousBlockers?: string;
  issueReferences: IssueReference[];
  dependencyNotes: string[];
  contextSummary?: string;
}

interface RawResponse {
  standupId: string;
  submittedAt: Date | null;
  answers: Record<string, any>;
  scheduledFor: Date;
}

const ISSUE_REGEX = /(?:#|GH-|SPM-|JIRA-)([A-Za-z0-9_-]+)/g;

function extractIssueReferences(text?: string): IssueReference[] {
  if (!text) {
    return [];
  }

  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = ISSUE_REGEX.exec(text))) {
    matches.add(match[0]);
  }

  return Array.from(matches).map((raw) => {
    if (raw.startsWith("#")) {
      return {
        raw,
        source: "github" as const,
        normalizedId: raw.replace(/^#/, ""),
        status: "unknown",
      };
    }

    if (raw.startsWith("SPM-")) {
      return {
        raw,
        source: "spm" as const,
        normalizedId: raw.substring(4),
        status: "unknown",
      };
    }

    return {
      raw,
      source: "unknown" as const,
      normalizedId: raw,
      status: "unknown",
    };
  });
}

function buildDependencyNotes(issueRefs: IssueReference[]): string[] {
  if (issueRefs.length === 0) {
    return [];
  }

  const githubRefs = issueRefs.filter((ref) => ref.source === "github");
  const spmRefs = issueRefs.filter((ref) => ref.source === "spm");
  const notes: string[] = [];

  if (githubRefs.length > 0) {
    notes.push(`Tracked GitHub items: ${githubRefs.map((ref) => ref.raw).join(", ")}`);
  }
  if (spmRefs.length > 0) {
    notes.push(`Tracked SPM items: ${spmRefs.map((ref) => ref.raw).join(", ")}`);
  }
  return notes;
}

function buildContextSummary(context: StandupParticipantContext): string | undefined {
  const pieces: string[] = [];

  if (context.previousPlan) {
    pieces.push(`Last plan: ${context.previousPlan}`);
  }

  if (context.previousBlockers) {
    pieces.push(`Last blockers: ${context.previousBlockers}`);
  }

  const dependencySummary = context.dependencyNotes.join(" • ");
  if (dependencySummary) {
    pieces.push(dependencySummary);
  }

  if (pieces.length === 0) {
    return undefined;
  }

  return pieces.join(" | ");
}

async function fetchLastResponse(
  projectId: string,
  participantId: string,
): Promise<RawResponse | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  const rows = await db
    .select({
      standupId: projectStandupResponses.standupId,
      submittedAt: projectStandupResponses.submittedAt,
      answers: projectStandupResponses.answers,
      scheduledFor: projectStandups.scheduledFor,
    })
    .from(projectStandupResponses)
    .innerJoin(projectStandups, eq(projectStandups.id, projectStandupResponses.standupId))
    .where(
      and(
        eq(projectStandups.projectId, projectId),
        eq(projectStandupResponses.participantSlackId, participantId),
      ),
    )
    .orderBy(desc(projectStandups.scheduledFor))
    .limit(1);

  const record = rows[0];
  if (!record) {
    return null;
  }

  return {
    standupId: record.standupId,
    submittedAt: record.submittedAt,
    answers: (record.answers ?? {}) as Record<string, any>,
    scheduledFor: record.scheduledFor,
  };
}

export async function buildStandupParticipantContexts(
  project: ProjectDefinition,
  participantIds: string[],
): Promise<Map<string, StandupParticipantContext>> {
  const contexts = new Map<string, StandupParticipantContext>();

  for (const participantId of participantIds) {
    const raw = await fetchLastResponse(project.id, participantId);
    if (!raw) {
      contexts.set(participantId, {
        participantId,
        issueReferences: [],
        dependencyNotes: [],
      });
      continue;
    }

    const previousPlan =
      (raw.answers?.today as string | undefined)?.trim() ||
      (raw.answers?.plan_followup as string | undefined)?.trim();
    const previousBlockers = (raw.answers?.blockers as string | undefined)?.trim();
    const issueReferences = extractIssueReferences(previousPlan);
    const dependencyNotes = buildDependencyNotes(issueReferences);

    const context: StandupParticipantContext = {
      participantId,
      lastStandupId: raw.standupId,
      lastSubmittedAt: raw.submittedAt?.toISOString(),
      previousPlan,
      previousBlockers,
      issueReferences,
      dependencyNotes,
    };

    context.contextSummary = buildContextSummary(context);
    contexts.set(participantId, context);
  }

  return contexts;
}

export function composeAdaptiveQuestions(
  baseQuestions: StandupQuestion[],
  context?: StandupParticipantContext,
): StandupQuestion[] {
  if (!context) {
    return baseQuestions.map((question) => ({ ...question }));
  }

  const questions = baseQuestions.map((question) => ({ ...question }));

  for (const question of questions) {
    if (question.id === "yesterday" && context.previousPlan) {
      question.prompt = `Last update you planned to focus on: ${context.previousPlan}. What progress did you make since then?`;
    }

    if (question.id === "today") {
      const dependencyHint = context.dependencyNotes.join("; ");
      if (dependencyHint) {
        question.helper = question.helper
          ? `${question.helper} • ${dependencyHint}`
          : `Keep in mind: ${dependencyHint}`;
      }
    }

    if (question.id === "blockers" && context.previousBlockers) {
      question.helper = question.helper
        ? `${question.helper} • (Last blockers: ${context.previousBlockers})`
        : `Last blockers: ${context.previousBlockers}. Share updates or new blockers.`;
    }
  }

  if (context.issueReferences.length > 0 && !questions.some((q) => q.id === "plan_followup")) {
    questions.unshift({
      id: "plan_followup",
      prompt: `Quick check: How are the tracked items progressing? (${context.issueReferences
        .map((ref) => ref.raw)
        .join(", ")})`,
      helper: "Share what moved, what is waiting, and if you need support.",
    });
  }

  return questions;
}

export function buildContextSummaryLine(context?: StandupParticipantContext): string | undefined {
  return context?.contextSummary;
}
