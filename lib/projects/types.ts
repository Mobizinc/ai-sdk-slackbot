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

export const projectSchema = z.object({
  id: z.string().min(1, "Project id is required"),
  name: z.string().min(1, "Project name is required"),
  status: z.enum(["active", "inactive", "draft", "archived"]).default("draft"),
  githubUrl: z.string().url().optional(),
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
