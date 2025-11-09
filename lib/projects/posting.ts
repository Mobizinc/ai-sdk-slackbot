import type { MessageResult, SlackMessagingService } from "../services/slack-messaging";
import {
  createActionsBlock,
  createContextBlock,
  createDivider,
  createFieldsBlock,
  createHeaderBlock,
  createSectionBlock,
} from "../utils/message-styling";
import type { ProjectDefinition } from "./types";
import { getProjectCapacityStatus, formatCapacityMessage } from "./capacity";

export interface PostProjectOpportunityOptions {
  project: ProjectDefinition;
  channelId: string;
  requestedBy: string;
  requestedByName?: string;
  sourceChannelId?: string;
  slackMessaging: SlackMessagingService;
}

const INTEREST_ACTION_ID = "project_button_interest";
const LEARN_MORE_ACTION_ID = "project_button_learn_more";
const WAITLIST_ACTION_ID = "project_button_waitlist";

function formatList(items: string[]): string {
  return items.map((item) => `• ${item}`).join("\n");
}

function buildLearningOpportunities(project: ProjectDefinition): string | null {
  if (!project.learningOpportunities?.length) {
    return null;
  }
  return `*What you'll learn*\n${formatList(project.learningOpportunities)}`;
}

function buildOpenTasks(project: ProjectDefinition): string | null {
  if (!project.openTasks?.length) {
    return null;
  }
  return `*Open tasks*\n${formatList(project.openTasks)}`;
}

export async function buildProjectBlocks(project: ProjectDefinition) {
  const fields = [];

  if (project.techStack?.length) {
    fields.push({
      label: "Tech Stack",
      value: project.techStack.join(" • "),
    });
  }

  if (project.difficultyLevel) {
    fields.push({
      label: "Level",
      value: project.difficultyLevel,
    });
  }

  if (project.estimatedHours) {
    fields.push({
      label: "Commitment",
      value: project.estimatedHours,
    });
  }

  const learningBlock = buildLearningOpportunities(project);
  const openTasksBlock = buildOpenTasks(project);

  const blocks = [
    createHeaderBlock("🚀 New Project Opportunity"),
    createSectionBlock(`*${project.name}*\n${project.summary}`),
  ];

  if (fields.length > 0) {
    blocks.push(createFieldsBlock(fields));
  }

  if (project.skillsRequired?.length) {
    blocks.push(
      createSectionBlock(
        `*Required skills*\n${formatList(project.skillsRequired)}`,
      ),
    );
  }

  if (project.skillsNiceToHave?.length) {
    blocks.push(
      createSectionBlock(
        `*Nice to have*\n${formatList(project.skillsNiceToHave)}`,
      ),
    );
  }

  if (learningBlock) {
    blocks.push(createSectionBlock(learningBlock));
  }

  if (openTasksBlock) {
    blocks.push(createSectionBlock(openTasksBlock));
  }

  blocks.push(createDivider());

  // Check capacity status for button state
  const capacityStatus = await getProjectCapacityStatus(project);

  const actionValue = JSON.stringify({
    projectId: project.id,
  });

  // Build action buttons based on capacity
  const actionButtons: any[] = [];

  if (capacityStatus.isFull) {
    // Project is full - show waitlist button
    actionButtons.push({
      text: `⏳ Join Waitlist (${capacityStatus.waitlistSize} waiting)`,
      actionId: WAITLIST_ACTION_ID,
      value: actionValue,
    });
  } else {
    // Project has capacity - show interest button
    actionButtons.push({
      text: "🚀 I'm Interested",
      actionId: INTEREST_ACTION_ID,
      value: actionValue,
      style: "primary",
    });
  }

  // Always include learn more button
  actionButtons.push({
    text: "📚 Learn More",
    actionId: LEARN_MORE_ACTION_ID,
    value: actionValue,
  });

  blocks.push(createActionsBlock(actionButtons));

  // Build context with capacity information
  const contextParts: string[] = [];
  if (project.mentor?.name) {
    contextParts.push(`Mentor: ${project.mentor.name}`);
  }

  // Add capacity status
  const capacityMessage = formatCapacityMessage(capacityStatus);
  contextParts.push(capacityMessage);

  if (project.githubUrl) {
    contextParts.push(`<${project.githubUrl}|GitHub Repo>`);
  }
  if (project.postedDate) {
    contextParts.push(`Posted: ${new Date(project.postedDate).toLocaleDateString()}`);
  }
  if (project.expiresDate) {
    contextParts.push(`Closes: ${new Date(project.expiresDate).toLocaleDateString()}`);
  }

  if (contextParts.length > 0) {
    blocks.push(createContextBlock(contextParts.join(" • ")));
  }

  return blocks;
}

export async function postProjectOpportunity(options: PostProjectOpportunityOptions): Promise<MessageResult> {
  const { project, channelId, slackMessaging } = options;

  const blocks = await buildProjectBlocks(project);
  const textFallback = `${project.name} project opportunity`;

  const result = await slackMessaging.postMessage({
    channel: channelId,
    text: textFallback,
    blocks,
  });

  if (!result.ok) {
    throw new Error(`Failed to post project ${project.id} to channel ${channelId}`);
  }

  if (options.requestedBy) {
    const requestedByText = `Requested by <@${options.requestedBy}>${
      options.requestedByName ? ` (${options.requestedByName})` : ""
    }`;
    const ackBlocks = createContextBlock(requestedByText);
    // Append ack context as threaded message instead of editing original
    if (result.ts) {
      await slackMessaging.postToThread({
        channel: channelId,
        threadTs: result.ts,
        text: "Project posted",
        blocks: [ackBlocks],
      });
    }
  }

  return result;
}

export const ProjectActions = {
  INTEREST: INTEREST_ACTION_ID,
  LEARN_MORE: LEARN_MORE_ACTION_ID,
  WAITLIST: WAITLIST_ACTION_ID,
} as const;
