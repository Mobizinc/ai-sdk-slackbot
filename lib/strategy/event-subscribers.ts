import { onStrategicEvaluationCompleted, type StrategicEvaluationCompletedEvent } from "./events";
import { enqueueBackgroundTask } from "../background-tasks";
import { getSlackMessagingService } from "../services/slack-messaging";
import {
  createContextBlock,
  createDivider,
  createSectionBlock,
} from "../utils/message-styling";
import { getProjectCatalog } from "../projects/catalog";
import type { ProjectDefinition } from "../projects/types";
import { getStandupConfig, triggerStandupManually } from "../projects/standup-service";
import { getDb } from "../db/client";
import { projectStandups } from "../db/schema";
import { and, eq, gte } from "drizzle-orm";

const slackMessaging = getSlackMessagingService();

onStrategicEvaluationCompleted((event) => {
  enqueueBackgroundTask(handleStrategicEvaluationCompleted(event));
});

async function handleStrategicEvaluationCompleted(
  event: StrategicEvaluationCompletedEvent,
) {
  try {
    const project = await findProjectByName(event.projectName);
    const standupPrep = await ensureStandupKickoff(project);
    const standupNote = await buildStandupNote(project, standupPrep);
    const kickoffSteps = Array.isArray(event.summary.nextSteps) ? event.summary.nextSteps.slice(0, 5) : [];
    const clarificationPrompts =
      event.analysis.needsClarification && Array.isArray(event.analysis.questions)
        ? event.analysis.questions.slice(0, 3)
        : [];

    const contextBits: string[] = [];
    if (typeof event.analysis.score === "number") {
      contextBits.push(`Completeness ${event.analysis.score}/100`);
    }
    if (event.summary.strategicScoring?.recommendation) {
      contextBits.push(`Recommendation: ${event.summary.strategicScoring.recommendation}`);
    } else if (event.recommendation) {
      contextBits.push(`Recommendation: ${event.recommendation}`);
    }
    if (event.summary.strategicScoring?.confidence) {
      contextBits.push(`Confidence: ${event.summary.strategicScoring.confidence}`);
    } else if (event.confidence) {
      contextBits.push(`Confidence: ${event.confidence}`);
    }

    const blocks: any[] = [
      createSectionBlock(`*Follow-up package ready — ${event.projectName}*`),
      createContextBlock(contextBits.join(" • ") || "Strategic evaluation completed."),
      createDivider(),
    ];

    if (kickoffSteps.length > 0) {
      blocks.push(
        createSectionBlock(`*Kickoff Tasks*\n${kickoffSteps.map((step) => `• ${step}`).join("\n")}`),
      );
      blocks.push(createDivider());
    }

    if (clarificationPrompts.length > 0) {
      blocks.push(
        createSectionBlock(
          `*Clarifications Needed*\n${clarificationPrompts.map((item) => `• ${item}`).join("\n")}`,
        ),
      );
      blocks.push(createDivider());
    }

    blocks.push(createSectionBlock(`*Stand-up Plan*\n${standupNote.message}`));

    blocks.push(
      createContextBlock(
        `Evaluation recorded at ${event.createdAt}. Use /project-standup run${
          standupNote.projectId ? ` ${standupNote.projectId}` : ""
        } for an ad-hoc check-in or /project-initiate draft to refresh the launch brief.`,
      ),
    );

    const fallbackText = [
      `Strategic evaluation complete for ${event.projectName}.`,
      contextBits.join(" • "),
      kickoffSteps.length ? `Kickoff tasks: ${kickoffSteps.join("; ")}` : "",
      clarificationPrompts.length ? `Clarifications: ${clarificationPrompts.join("; ")}` : "",
      `Stand-up plan: ${standupNote.message}`,
    ]
      .filter(Boolean)
      .join(" ");

    if (!event.requestedBy) {
      console.warn("[Strategic Evaluation] Missing requester; skipping follow-up DM.");
    } else {
      const conversation = await slackMessaging.openConversation(event.requestedBy);
      if (!conversation.channelId) {
        console.warn(
          "[Strategic Evaluation] Unable to open DM channel for requester",
          event.requestedBy,
        );
      } else {
        await slackMessaging.postMessage({
          channel: conversation.channelId,
          text: fallbackText,
          blocks,
        });
      }
    }

    await postProjectChannelSummary({
      event,
      project,
      contextBits,
      kickoffSteps,
      clarificationPrompts,
      standupNote,
      standupPrep,
    });
  } catch (error) {
    console.error("[Strategic Evaluation] Follow-up handler failed", error);
  }
}

async function findProjectByName(projectName: string): Promise<ProjectDefinition | undefined> {
  try {
    const catalog = await getProjectCatalog();
    const normalised = normalise(projectName);

    const byName = catalog.find((project) => normalise(project.name) === normalised);
    if (byName) {
      return byName;
    }

    const byId = catalog.find((project) => normalise(project.id) === normalised);
    if (byId) {
      return byId;
    }

    const fuzzy = catalog.find(
      (project) =>
        normalise(project.name).includes(normalised) || normalised.includes(normalise(project.name)),
    );
    return fuzzy;
  } catch (error) {
    console.error("[Strategic Evaluation] Failed to load project catalog", error);
    return undefined;
  }
}

type StandupKickoffResult =
  | { status: "not_configured" }
  | { status: "scheduled"; standupId: string; participantCount: number }
  | { status: "skipped"; reason: "existing_recent" | "no_participants" | "db_unavailable" };

async function ensureStandupKickoff(project?: ProjectDefinition): Promise<StandupKickoffResult> {
  if (!project) {
    return { status: "not_configured" };
  }

  const config = getStandupConfig(project);
  if (!config) {
    return { status: "not_configured" };
  }

  const db = getDb();
  if (!db) {
    console.warn("[Strategic Evaluation] Database unavailable; cannot auto-schedule stand-up.");
    return { status: "skipped", reason: "db_unavailable" };
  }

  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentStandup = await db
    .select({ id: projectStandups.id })
    .from(projectStandups)
    .where(
      and(
        eq(projectStandups.projectId, project.id),
        gte(projectStandups.createdAt, windowStart),
      ),
    )
    .limit(1);

  if (recentStandup.length > 0) {
    return { status: "skipped", reason: "existing_recent" };
  }

  const result = await triggerStandupManually(project, config, new Date());
  if (result) {
    return {
      status: "scheduled",
      standupId: result.standup.id,
      participantCount: result.participants.length,
    };
  }

  return { status: "skipped", reason: "no_participants" };
}

async function buildStandupNote(
  project: ProjectDefinition | undefined,
  standup: StandupKickoffResult,
): Promise<{ message: string; projectId?: string }> {
  if (!project) {
    return {
      message: "No matching project found in the catalog yet. Update `data/projects.json` or create a project record so stand-ups can be automated.",
    };
  }

  const config = getStandupConfig(project);
  if (!config) {
    return {
      message: `Stand-ups are not configured for *${project.name}*. Update the project definition to add cadence, participants, and channel before launch.`,
      projectId: project.id,
    };
  }

  const participantHints: string[] = [];
  if (config.participants.length > 0) {
    participantHints.push(`${config.participants.length} manual participant${config.participants.length === 1 ? "" : "s"}`);
  }
  if (config.includeMentor && project.mentor?.slackUserId) {
    participantHints.push("mentor auto-included");
  }
  if (config.includeAcceptedCandidates) {
    participantHints.push("accepted interview candidates");
  }

  const participantSummary =
    participantHints.length > 0 ? participantHints.join(", ") : "configure participants to start collecting updates";
  const friendlyFrequency = (() => {
    switch (config.schedule.frequency) {
      case "daily":
        return "daily";
      case "weekdays":
        return "every weekday";
      case "weekly": {
        const dow = config.schedule.dayOfWeek ?? 1;
        return `weekly on ${weekdayName(dow)}`;
      }
      default:
        return config.schedule.frequency;
    }
  })();

  let actionLine: string;
  if (standup.status === "scheduled") {
    actionLine = `✅ Kick-off stand-up scheduled now for ${standup.participantCount} participant${standup.participantCount === 1 ? "" : "s"}. Summaries will post to the configured project channel automatically.`;
  } else if (standup.status === "skipped") {
    if (standup.reason === "existing_recent") {
      actionLine =
        "ℹ️ A recent stand-up is already in flight. Use `/project-standup run` if you need another check-in before the next cadence.";
    } else if (standup.reason === "no_participants") {
      actionLine =
        "⚠️ Stand-up prompts were skipped because no participants could be resolved. Update the participants list or accept interview candidates.";
    } else {
      actionLine = "⚠️ Unable to schedule stand-up automatically; check logs or run `/project-standup run` manually.";
    }
  } else {
    actionLine = `Cron will schedule automatically; trigger an immediate check-in any time with \`/project-standup run ${project.id}\`.`;
  }

  const message = [
    `Stand-ups run ${friendlyFrequency} at ${config.schedule.timeUtc} UTC (collection window ${config.collectionWindowMinutes} mins).`,
    `Participants: ${participantSummary}.`,
    actionLine,
  ].join(" ");

  return {
    message,
    projectId: project.id,
  };
}

async function postProjectChannelSummary(params: {
  event: StrategicEvaluationCompletedEvent;
  project?: ProjectDefinition;
  contextBits: string[];
  kickoffSteps: string[];
  clarificationPrompts: string[];
  standupNote: { message: string; projectId?: string };
  standupPrep: StandupKickoffResult;
}): Promise<void> {
  const { event, project, contextBits, kickoffSteps, clarificationPrompts, standupNote, standupPrep } = params;
  const channelId = project?.channelId ?? event.channelId;
  if (!channelId) {
    return;
  }

  const headingName = project?.name ?? event.projectName;
  const blocks: any[] = [
    createSectionBlock(`*Strategic evaluation ready — ${headingName}*`),
    createContextBlock(
      [
        contextBits.join(" • ") || "Evaluation completed.",
        event.requestedBy ? `Requested by <@${event.requestedBy}>` : undefined,
        standupPrep.status === "scheduled"
          ? "Kick-off stand-up scheduled automatically."
          : standupPrep.status === "skipped" && standupPrep.reason === "no_participants"
            ? "Stand-up scheduling skipped (missing participants)."
            : undefined,
      ]
        .filter(Boolean)
        .join(" • "),
    ),
    createDivider(),
  ];

  if (kickoffSteps.length > 0) {
    blocks.push(
      createSectionBlock(`*Kickoff Tasks*\n${kickoffSteps.map((step) => `• ${step}`).join("\n")}`),
    );
  }

  if (clarificationPrompts.length > 0) {
    blocks.push(createDivider());
    blocks.push(
      createSectionBlock(
        `*Clarifications Needed*\n${clarificationPrompts.map((item) => `• ${item}`).join("\n")}`,
      ),
    );
  }

  blocks.push(createDivider());
  blocks.push(createSectionBlock(`*Stand-up Plan*\n${standupNote.message}`));

  const fallback = [
    `Strategic evaluation complete for ${headingName}.`,
    contextBits.join(" • "),
    kickoffSteps.length ? `Kickoff tasks: ${kickoffSteps.join("; ")}` : "",
    clarificationPrompts.length ? `Clarifications: ${clarificationPrompts.join("; ")}` : "",
    `Stand-up plan: ${standupNote.message}`,
  ]
    .filter(Boolean)
    .join(" ");

  await slackMessaging.postMessage({
    channel: channelId,
    text: fallback,
    blocks,
  });
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function weekdayName(dayIndex: number): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[dayIndex] ?? `day ${dayIndex}`;
}
