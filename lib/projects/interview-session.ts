import type { GenericMessageEvent } from "../slack-event-types";
import { getSlackMessagingService, type SlackMessagingService } from "../services/slack-messaging";
import { getInteractiveStateManager } from "../services/interactive-state-manager";
import { getProjectById } from "./catalog";
import { scoreInterviewAgainstProject, type MatchScore, type EnhancedMatchScore } from "./matching-service";
import type {
  InterviewAnswer,
  InterviewQuestion,
  InterviewSessionState,
  ProjectDefinition,
  ProjectInterest,
} from "./types";
import { getDb } from "../db/client";
import { projectInterviews } from "../db/schema";
import { emitProjectInterviewCompleted } from "./interview-events";
import { generateInterviewQuestions } from "./question-generator";
import * as interestRepository from "../db/repositories/interest-repository";
import { checkCapacity } from "./capacity";
import * as waitlistService from "./waitlist-service";

interface StartInterviewOptions {
  project: ProjectDefinition;
  userId: string;
  userName?: string;
  initiatedBy: string;
  sourceMessageTs?: string;
  interestId?: string; // Link to project interest record
  interest?: ProjectInterest;
  skipPrechecks?: boolean;
}

interface LearnMoreOptions {
  project: ProjectDefinition;
  userId: string;
}

const DEFAULT_QUESTION_SET: InterviewQuestion[] = [
  {
    id: "experience_typescript",
    prompt: "Have you worked with TypeScript before? What projects or features did you build?",
  },
  {
    id: "async_patterns",
    prompt: "Share a time you had to debug or design async logic (promises, queues, background jobs).",
  },
  {
    id: "slack_api",
    prompt: "What exposure do you have to Slack apps or other messaging APIs?",
    helper: "Experience is not required—let me know if this would be new for you.",
  },
  {
    id: "learning_goals",
    prompt: "What do you hope to learn by joining this project?",
  },
  {
    id: "availability",
    prompt: "Roughly how many hours per week can you commit over the next month?",
  },
  {
    id: "mentorship",
    prompt: "What kind of mentorship or support helps you grow fastest?",
  },
];

const INTERVIEW_EXPIRY_HOURS = 12;

const slackMessaging = getSlackMessagingService();
const stateManager = getInteractiveStateManager();

function buildIntroMessage(project: ProjectDefinition, question: InterviewQuestion, index: number, total: number): string {
  const helperSuffix = question.helper ? `\n_${question.helper}_` : "";
  return [
    `Hey there! Thanks for your interest in *${project.name}*.`,
    "I'll ask a few quick questions so we can match you with the right mentor tasks.",
    "",
    `*Question ${index + 1} of ${total}:* ${question.prompt}${helperSuffix}`,
  ].join("\n");
}

function buildQuestionMessage(question: InterviewQuestion, index: number, total: number): string {
  const helperSuffix = question.helper ? `\n_${question.helper}_` : "";
  return `*Question ${index + 1} of ${total}:* ${question.prompt}${helperSuffix}`;
}

function buildCandidateSummaryMessage(matchSummary: MatchScore | EnhancedMatchScore): string {
  const lines = [
    "Thanks! That's all the questions I had.",
    `*Preliminary match score:* ${matchSummary.score}/100`,
    matchSummary.summary,
  ];

  if (matchSummary.recommendedTasks.length > 0) {
    lines.push(
      "",
      "*Suggested starting tasks:*",
      ...matchSummary.recommendedTasks.map((task) => `• ${task}`),
    );
  }

  if (matchSummary.concerns) {
    lines.push("", `*Notes:* ${matchSummary.concerns}`);
  }

  if ("skillGaps" in matchSummary && matchSummary.skillGaps.length > 0) {
    lines.push("", "*Skill gaps to focus on:*", ...matchSummary.skillGaps.map((gap) => `• ${gap}`));
  }

  lines.push("", "We'll sync with the mentor and get back to you shortly.");

  return lines.join("\n");
}

function buildMentorNotificationMessage(
  project: ProjectDefinition,
  candidateId: string,
  answers: InterviewAnswer[],
  matchSummary: MatchScore | EnhancedMatchScore,
): string {
  const answerLines = answers
    .map((answer, index) => `*Q${index + 1} (${answer.questionId}):* ${answer.response}`)
    .join("\n");

  const tasksSection =
    matchSummary.recommendedTasks.length > 0
      ? `*Recommended starting tasks:*\n${matchSummary.recommendedTasks.map((task) => `• ${task}`).join("\n")}\n`
      : "";

  const concernLine = matchSummary.concerns ? `*Potential risks:* ${matchSummary.concerns}\n` : "";

  const extraSections: string[] = [];
  if ("skillGaps" in matchSummary && matchSummary.skillGaps.length > 0) {
    extraSections.push(
      "*Skill gaps:*",
      matchSummary.skillGaps.map((gap) => `• ${gap}`).join("\n"),
    );
  }
  if ("strengths" in matchSummary && matchSummary.strengths.length > 0) {
    extraSections.push(
      "*Strengths:*",
      matchSummary.strengths.map((strength) => `• ${strength}`).join("\n"),
    );
  }
  if ("onboardingRecommendations" in matchSummary && matchSummary.onboardingRecommendations.length > 0) {
    extraSections.push(
      "*Onboarding recommendations:*",
      matchSummary.onboardingRecommendations.map((rec) => `• ${rec}`).join("\n"),
    );
  }
  if ("timeToProductivity" in matchSummary && matchSummary.timeToProductivity) {
    extraSections.push(`*Estimated time to productivity:* ${matchSummary.timeToProductivity}`);
  }

  return [
    `New candidate interested in *${project.name}*`,
    `• Candidate: <@${candidateId}>`,
    `• Match score: ${matchSummary.score}/100`,
    `• Summary: ${matchSummary.summary}`,
    "",
    tasksSection,
    concernLine,
    extraSections.length > 0 ? extraSections.join("\n") : "",
    "*Interview transcript:*",
    answerLines,
  ]
    .filter(Boolean)
    .join("\n");
}

async function ensureNoActiveInterview(channelId: string): Promise<boolean> {
  const existing = await stateManager.getStateByChannel(channelId, "project_interview");
  return existing === null;
}

export async function startInterviewSession(options: StartInterviewOptions): Promise<void> {
  const { project, userId, initiatedBy } = options;

  const bypassPrechecks = options.skipPrechecks ?? false;
  let interest: ProjectInterest | null = options.interest ?? null;

  if (bypassPrechecks) {
    if (!interest && options.interestId) {
      interest = await interestRepository.getInterestById(options.interestId);
    }
    if (!interest) {
      throw new Error("Interest record required when skipping prechecks");
    }
  } else {
    // Check for duplicate applications (allow retry only if previous was abandoned)
    const existingInterest = await interestRepository.findInterest(project.id, userId);
    if (existingInterest) {
      if (existingInterest.status !== "abandoned") {
        const dmConversation = await slackMessaging.openConversation(userId);
        if (dmConversation.channelId) {
          await slackMessaging.postMessage({
            channel: dmConversation.channelId,
            text: `You've already applied to *${project.name}*. We'll get back to you once the mentor reviews your application.`,
          });
        }
        return;
      }
      interest = existingInterest;
    }

    const hasCapacity = await checkCapacity(project);
    if (!hasCapacity) {
      if (!interest) {
        await interestRepository.createInterest(project.id, userId, "waitlist");
      } else {
        await interestRepository.updateInterestStatus(interest.id, "waitlist");
      }

      const dmConversation = await slackMessaging.openConversation(userId);
      if (dmConversation.channelId) {
        await slackMessaging.postMessage({
          channel: dmConversation.channelId,
          text: `*${project.name}* is currently at full capacity. You've been added to the waitlist. We'll notify you if a slot opens up!`,
        });
      }
      return;
    }

    if (!interest) {
      interest = await interestRepository.createInterest(project.id, userId, "pending");
    }

    if (!interest) {
      console.error("[Project Interview] Failed to create interest record", {
        projectId: project.id,
        userId,
      });
      throw new Error("Failed to register interest");
    }
  }

  let questionSource: InterviewSessionState["questionSource"] = "config";
  let generatorModel: string | undefined;

  let configuredQuestions: InterviewQuestion[] = project.interview?.questions?.length
    ? project.interview.questions
    : [];

  if (configuredQuestions.length === 0 && project.interview?.generator) {
    try {
      const generated = await generateInterviewQuestions({
        project,
        questionCount: project.interview.generator.questionCount ?? 6,
        model: project.interview.generator.model,
        styleGuidance: project.interview.generator.styleGuidance,
      });
      if (generated.length > 0) {
        configuredQuestions = generated;
        questionSource = "generator";
        generatorModel = project.interview.generator.model;
      }
    } catch (error) {
      console.error("[Project Interview] Failed to generate questions dynamically", error);
    }
  }

  if (configuredQuestions.length === 0) {
    configuredQuestions = DEFAULT_QUESTION_SET;
    questionSource = "default";
  }

  const activeInterest = interest!;

  if (activeInterest.status === "waitlist") {
    throw new Error("Cannot start interview while candidate is on the waitlist");
  }

  const questions = configuredQuestions.map((question) => ({ ...question }));

  const dmConversation = await slackMessaging.openConversation(userId);
  if (!dmConversation.channelId) {
    throw new Error(`Failed to open DM with ${userId}`);
  }

  const hasExisting = await ensureNoActiveInterview(dmConversation.channelId);
  if (!hasExisting) {
    await slackMessaging.postMessage({
      channel: dmConversation.channelId,
      text: "You already have an active interview session. Answer the pending questions or wait for it to complete.",
    });
    return;
  }

  // Update interest status to interviewing
  await interestRepository.updateInterestStatus(activeInterest.id, "interviewing");

  const firstQuestion = questions[0];
  const totalQuestions = questions.length;
  const messageText = buildIntroMessage(project, firstQuestion, 0, totalQuestions);

  const message = await slackMessaging.postMessage({
    channel: dmConversation.channelId,
    text: messageText,
  });

  if (!message.ts) {
    throw new Error("Failed to start interview session (missing message timestamp)");
  }

  const sessionState: any = {
    projectId: project.id,
    userId,
    userName: options.userName,
    mentorId: project.mentor?.slackUserId,
    currentStep: 0,
    answers: [],
    questions,
    scoringPrompt: project.interview?.scoringPrompt,
    questionSource,
    generatorModel,
    startedAt: new Date().toISOString(),
    interestId: activeInterest.id, // Link to interest record
  };

  await stateManager.saveState(
    "project_interview",
    dmConversation.channelId,
    message.ts,
    sessionState,
    {
      expiresInHours: INTERVIEW_EXPIRY_HOURS,
      metadata: {
        initiatedBy,
        projectId: project.id,
        sourceMessageTs: options.sourceMessageTs,
        interestId: activeInterest.id,
      },
    },
  );
}

function assertQuestion(questions: InterviewQuestion[], step: number): InterviewQuestion | null {
  return questions[step] ?? null;
}

async function sendNextQuestion(
  slackService: SlackMessagingService,
  channelId: string,
  nextQuestion: InterviewQuestion,
  index: number,
  totalQuestions: number,
): Promise<void> {
  const questionText = buildQuestionMessage(nextQuestion, index, totalQuestions);
  await slackService.postMessage({
    channel: channelId,
    text: questionText,
  });
}

export async function handleInterviewResponse(
  event: GenericMessageEvent,
): Promise<boolean> {
  if (!event.channel || !event.user || !event.text) {
    return false;
  }

  const session = await stateManager.getStateByChannel(event.channel, "project_interview");
  if (!session) {
    return false;
  }

  const { payload, messageTs } = session;
  if (payload.userId !== event.user) {
    // Ignore messages from others in same channel
    return false;
  }

  const currentQuestion = assertQuestion(payload.questions, payload.currentStep);

  if (!currentQuestion) {
    return false;
  }

  const trimmedResponse = event.text.trim();
  if (trimmedResponse.length === 0) {
    await slackMessaging.postMessage({
      channel: event.channel,
      text: "Could you share a quick answer so we can keep the interview moving?",
    });
    return true;
  }

  const updatedAnswers: InterviewAnswer[] = [
    ...payload.answers,
    {
      questionId: currentQuestion.id,
      prompt: currentQuestion.prompt,
      response: trimmedResponse,
    },
  ];

  const nextStep = payload.currentStep + 1;

  await stateManager.updatePayload(session.channelId, session.messageTs, {
    answers: updatedAnswers,
    currentStep: nextStep,
  } as Partial<InterviewSessionState>);

  if (nextStep < payload.questions.length) {
    const nextQuestion = assertQuestion(payload.questions, nextStep);
    if (nextQuestion) {
      await sendNextQuestion(slackMessaging, event.channel, nextQuestion, nextStep, payload.questions.length);
    }
    return true;
  }

  const project = await getProjectById(payload.projectId);
  if (!project) {
    await slackMessaging.postMessage({
      channel: event.channel,
      text: "I lost the project context while saving your interview. Please let the platform team know.",
    });
    await stateManager.markProcessed(session.channelId, session.messageTs, event.user, "completed", "project not found");
    return true;
  }

  let matchSummary: MatchScore | EnhancedMatchScore | null = null;
  try {
    matchSummary = await scoreInterviewEnhanced(project, updatedAnswers, payload.scoringPrompt);
  } catch (error) {
    console.warn("[Project Interview] Enhanced scoring failed, falling back", error);
  }

  if (!matchSummary) {
    try {
      matchSummary = await scoreInterviewAgainstProject(project, updatedAnswers, payload.scoringPrompt);
    } catch (legacyError) {
      console.error("[Project Interview] Failed to score interview", legacyError);
      matchSummary = {
        score: 50,
        summary: "Automatic scoring was unavailable. Mentor review is required.",
        recommendedTasks: [],
      };
    }
  }

  const completedAt = new Date().toISOString();

  await Promise.allSettled([
    slackMessaging.postMessage({
      channel: event.channel,
      text: buildCandidateSummaryMessage(matchSummary),
    }),
    persistInterviewResult({
      projectId: payload.projectId,
      candidateId: payload.userId,
      mentorId: payload.mentorId,
      answers: updatedAnswers,
      matchSummary,
      startedAt: payload.startedAt,
      completedAt,
      questions: payload.questions,
      scoringPrompt: payload.scoringPrompt,
      questionSource: payload.questionSource ?? "default",
      generatorModel: payload.generatorModel,
      interestId: (payload as any).interestId, // From sessionState
    }),
  ]);

  if (payload.mentorId) {
    try {
      const mentorDm = await slackMessaging.openConversation(payload.mentorId);
      if (mentorDm.channelId) {
        await slackMessaging.postMessage({
          channel: mentorDm.channelId,
          text: buildMentorNotificationMessage(project, payload.userId, updatedAnswers, matchSummary),
        });
      }
    } catch (error) {
      console.error("[Project Interview] Failed to notify mentor", error);
    }
  }

  await stateManager.markProcessed(session.channelId, session.messageTs, event.user, "completed");
  emitProjectInterviewCompleted({
    project,
    candidateId: payload.userId,
    mentorId: payload.mentorId,
    answers: updatedAnswers,
    matchSummary,
    startedAt: payload.startedAt,
    completedAt,
    questions: payload.questions,
    scoringPrompt: payload.scoringPrompt,
    questionSource: payload.questionSource ?? "default",
    generatorModel: payload.generatorModel,
  });

  return true;
}

interface PersistInterviewResultOptions {
  projectId: string;
  candidateId: string;
  mentorId?: string;
  answers: InterviewAnswer[];
  questions: InterviewQuestion[];
  matchSummary: MatchScore | EnhancedMatchScore;
  startedAt: string;
  completedAt: string;
  scoringPrompt?: string;
  questionSource: InterviewSessionState["questionSource"];
  generatorModel?: string;
  interestId?: string; // Link to interest record
}

async function persistInterviewResult(options: PersistInterviewResultOptions): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[Project Interview] Database unavailable; skipping interview persistence");
    return;
  }

  try {
    // Extract enhanced fields if they exist
    const isEnhanced = "skillGaps" in options.matchSummary;
    const matchSummary = options.matchSummary as any;

    const result = await db.insert(projectInterviews).values({
      projectId: options.projectId,
      candidateSlackId: options.candidateId,
      mentorSlackId: options.mentorId ?? null,
      answers: options.answers,
      questions: options.questions,
      scoringPrompt: options.scoringPrompt ?? null,
      matchScore: options.matchSummary.score,
      matchSummary: options.matchSummary.summary,
      recommendedTasks: options.matchSummary.recommendedTasks,
      concerns: options.matchSummary.concerns ?? null,
      skillGaps: isEnhanced ? matchSummary.skillGaps ?? [] : [],
      onboardingRecommendations: isEnhanced ? matchSummary.onboardingRecommendations ?? [] : [],
      strengths: isEnhanced ? matchSummary.strengths ?? [] : [],
      timeToProductivity: isEnhanced ? matchSummary.timeToProductivity ?? null : null,
      interestId: options.interestId ?? undefined,
      startedAt: new Date(options.startedAt),
      completedAt: new Date(options.completedAt),
      questionSource: options.questionSource,
      generatorModel: options.generatorModel ?? null,
    }).returning();

    // Update interest status based on match score
    if (options.interestId) {
      const interviewId = result[0]?.id;
      const status = options.matchSummary.score >= 70 ? "accepted" : "rejected";
      await interestRepository.updateInterestStatus(options.interestId, status, interviewId);
      if (status === "accepted") {
        await waitlistService.onInterviewAccepted(options.projectId, options.candidateId);
      } else {
        await waitlistService.onInterviewRejected(options.projectId, options.candidateId);
      }
    }
  } catch (error) {
    console.error("[Project Interview] Failed to persist interview result", error);
  }
}

export async function sendProjectLearnMore(options: LearnMoreOptions): Promise<void> {
  const dmConversation = await slackMessaging.openConversation(options.userId);
  if (!dmConversation.channelId) {
    throw new Error(`Failed to open DM for learn-more request (${options.userId})`);
  }

  const contentLines = [
    `Here's the background on *${options.project.name}*:`,
    options.project.background || "No background details available yet.",
  ];

  if (options.project.githubUrl) {
    contentLines.push("", `Repo: ${options.project.githubUrl}`);
  }

  if (options.project.openTasks?.length) {
    contentLines.push("", "*Highlighted tasks:*", ...options.project.openTasks.map((task) => `• ${task}`));
  }

  await slackMessaging.postMessage({
    channel: dmConversation.channelId,
    text: contentLines.join("\n"),
  });
}
