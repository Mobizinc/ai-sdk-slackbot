import { z } from "zod";
import {
  DEFAULT_STANDUP_COLLECTION_MINUTES,
  DEFAULT_STANDUP_MAX_REMINDERS,
  DEFAULT_STANDUP_REMINDER_MINUTES,
} from "./standup-constants";

export const interviewQuestionSchema = z.object({
  id: z.string().min(1, "Interview question id is required"),
  prompt: z.string().min(1, "Interview question prompt is required"),
  helper: z.string().optional(),
});

export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const interviewGeneratorSchema = z.object({
  model: z.string().default("claude-3-haiku-20240307"),
  questionCount: z.number().int().min(3).max(12).default(6),
  styleGuidance: z.string().optional(),
});

export const interviewConfigSchema = z.object({
  questions: z.array(interviewQuestionSchema).default([]),
  generator: interviewGeneratorSchema.optional(),
  scoringPrompt: z.string().optional(),
});

export const standupQuestionSchema = z.object({
  id: z.string().min(1, "Stand-up question id is required"),
  prompt: z.string().min(1, "Stand-up question prompt is required"),
  helper: z.string().optional(),
});

export type StandupQuestion = z.infer<typeof standupQuestionSchema>;

export const standupScheduleSchema = z.object({
  frequency: z.enum(["daily", "weekdays", "weekly"]),
  timeUtc: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM in UTC"),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // for weekly cadence (0=Sunday)
});

export const standupConfigSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: z.string().optional(),
  schedule: standupScheduleSchema,
  participants: z.array(z.string()).default([]),
  includeMentor: z.boolean().default(true),
  includeAcceptedCandidates: z.boolean().default(true),
  questions: z.array(standupQuestionSchema).default([]),
  collectionWindowMinutes: z
    .number()
    .int()
    .min(15)
    .max(720)
    .default(DEFAULT_STANDUP_COLLECTION_MINUTES),
  reminderMinutesBeforeDue: z
    .number()
    .int()
    .min(5)
    .max(720)
    .default(DEFAULT_STANDUP_REMINDER_MINUTES),
  maxReminders: z.number().int().min(0).max(5).default(DEFAULT_STANDUP_MAX_REMINDERS),
});

export type StandupConfig = z.infer<typeof standupConfigSchema>;

export interface StandupSessionState {
  standupId: string;
  projectId: string;
  participantId: string;
  questions: StandupQuestion[];
  startedAt: string;
  source?: "initial" | "reminder";
  reminderCount?: number;
}

const githubRepoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const projectInitiationOutputSchema = z.object({
  shortPitch: z.string().min(1),
  elevatorPitch: z.string().min(1),
  problemStatement: z.string().min(1),
  solutionOverview: z.string().min(1),
  keyValueProps: z.array(z.string()).default([]),
  learningHighlights: z.array(z.string()).default([]),
  kickoffChecklist: z.array(z.string()).default([]),
  standupGuidance: z.array(z.string()).default([]),
  interviewThemes: z.array(z.string()).default([]),
  recommendedMetrics: z.array(z.string()).default([]),
  blockKit: z
    .object({
      blocks: z.array(z.any()).default([]),
      fallbackText: z.string().optional(),
    })
    .optional(),
  notes: z.array(z.string()).default([]),
});

export type ProjectInitiationOutput = z.infer<typeof projectInitiationOutputSchema>;

export interface ProjectInitiationSource {
  label: string;
  excerpt: string;
  path?: string;
}

export interface ProjectInitiationDraft {
  requestId?: string;
  projectId: string;
  requestedBy: string;
  requestedByName?: string;
  ideaSummary?: string;
  output: ProjectInitiationOutput;
  sources: ProjectInitiationSource[];
  llmModel: string;
  rawResponse?: string;
  createdAt: string;
}

export const projectSchema = z.object({
  id: z.string().min(1, "Project id is required"),
  name: z.string().min(1, "Project name is required"),
  status: z.enum(["active", "inactive", "draft", "archived"]).default("draft"),
  githubUrl: z.string().url().optional(),
  githubRepo: z
    .string()
    .regex(githubRepoPattern, "GitHub repo must be in the form owner/repo")
    .optional(),
  githubDefaultBranch: z.string().min(1).optional(),
  summary: z.string().min(1, "Project summary is required"),
  background: z.string().optional(),
  techStack: z.array(z.string()).default([]),
  skillsRequired: z.array(z.string()).default([]),
  skillsNiceToHave: z.array(z.string()).default([]),
  difficultyLevel: z.string().optional(),
  estimatedHours: z.string().optional(),
  learningOpportunities: z.array(z.string()).default([]),
  openTasks: z.array(z.string()).default([]),
  mentor: z
    .object({
      slackUserId: z.string().min(1, "Mentor Slack user id is required"),
      name: z.string().min(1, "Mentor name is required"),
    })
    .optional(),
  interview: interviewConfigSchema.optional(),
  standup: standupConfigSchema.optional(),
  maxCandidates: z.number().int().positive().optional(),
  postedDate: z.string().optional(),
  expiresDate: z.string().optional(),
  channelId: z.string().optional(),
});

export type ProjectDefinition = z.infer<typeof projectSchema>;

export const projectCatalogSchema = z.object({
  projects: z.array(projectSchema),
});

export type ProjectCatalog = z.infer<typeof projectCatalogSchema>;

export interface ProjectPostRequest {
  projectId: string;
  requestedBy: string;
  channelId: string;
  notifyChannelId?: string;
}

export interface ProjectInterestContext {
  projectId: string;
  interestedUserId: string;
  requestedBy: string;
  channelId: string;
}

export type InterviewAnswer = {
  questionId: string;
  prompt: string;
  response: string;
};

export interface InterviewSessionState {
  projectId: string;
  userId: string;
  userName?: string;
  mentorId?: string;
  currentStep: number;
  answers: InterviewAnswer[];
  questions: InterviewQuestion[];
  scoringPrompt?: string;
  questionSource: "config" | "generator" | "default";
  generatorModel?: string;
  startedAt: string;
}

/**
 * Enhanced Match Score with detailed candidate evaluation
 * Includes skill gaps, onboarding recommendations, strengths, and time-to-productivity
 */
export interface EnhancedMatchScore {
  score: number; // 0-100
  summary: string; // 2-3 sentence assessment
  recommendedTasks: string[]; // specific tasks candidate can start with
  concerns?: string; // optional concerns or risks
  skillGaps: string[]; // required/nice-to-have skills they're missing or weak in
  onboardingRecommendations: string[]; // resources, tutorials, training recommendations
  strengths: string[]; // specific skills/experiences that match project needs
  timeToProductivity: string; // immediate, 1-2 weeks, 3-4 weeks, 1-2 months, etc.
}

/**
 * Project Interest Status enum
 * Tracks candidate progress through application/interview workflow
 */
export enum ProjectInterestStatus {
  PENDING = "pending", // user clicked interested, hasn't started interview
  INTERVIEWING = "interviewing", // interview in progress
  ACCEPTED = "accepted", // interview completed with good score
  REJECTED = "rejected", // interview completed but not a good fit
  ABANDONED = "abandoned", // user started but didn't complete interview
  WAITLIST = "waitlist", // project full, candidate added to waitlist
}

/**
 * Project Interest with status tracking
 * Used for duplicate prevention and capacity management
 */
export interface ProjectInterest {
  id: string;
  projectId: string;
  candidateSlackId: string;
  status: ProjectInterestStatus | string;
  interviewId: string | null; // FK to projectInterviews
  createdAt: Date;
  updatedAt: Date;
  abandonedAt: Date | null; // when interview was abandoned
}
