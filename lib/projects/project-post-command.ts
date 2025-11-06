import { getSlackMessagingService } from "../services/slack-messaging";
import { getProjectById, listActiveProjects } from "./catalog";
import { postProjectOpportunity } from "./posting";

interface SlashCommandPayload {
  text: string;
  userId: string;
  userName?: string;
  channelId: string;
  channelName?: string;
  responseUrl?: string;
}

interface CommandResult {
  status: number;
  body: Record<string, unknown>;
}

const slackMessaging = getSlackMessagingService();
const POST_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const recentPosts = new Map<string, number>();

function buildDedupeKey(projectId: string, channelId: string): string {
  return `${projectId}:${channelId}`;
}

function isDuplicatePost(key: string): boolean {
  const lastPost = recentPosts.get(key);
  if (!lastPost) {
    return false;
  }

  const elapsed = Date.now() - lastPost;
  if (elapsed < POST_DEDUPE_WINDOW_MS) {
    return true;
  }

  recentPosts.delete(key);
  return false;
}

function recordPost(key: string): void {
  recentPosts.set(key, Date.now());
}

function normalizeProjectId(raw: string): string {
  return raw.trim().toLowerCase();
}

async function formatProjectList(): Promise<string> {
  const activeProjects = await listActiveProjects();
  if (activeProjects.length === 0) {
    return "No active projects are currently configured.";
  }

  const formatted = activeProjects
    .map((project) => `• ${project.id} – ${project.name}`)
    .join("\n");

  return `Provide a project id. Active projects:\n${formatted}`;
}

export async function handleProjectPostCommand(payload: SlashCommandPayload): Promise<CommandResult> {
  const rawProjectId = payload.text ?? "";
  const normalizedProjectId = normalizeProjectId(rawProjectId);
  const activeProjects = await listActiveProjects();

  const pickDefaultProject =
    normalizedProjectId.length === 0 && activeProjects.length === 1;

  const targetProjectId = pickDefaultProject
    ? activeProjects[0]?.id
    : normalizedProjectId;

  if (!targetProjectId) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Please provide a project id. No default project is available.",
      },
    };
  }

  const project = await getProjectById(targetProjectId);
  if (!project || project.status !== "active") {
    const projectList = await formatProjectList();
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Project "${rawProjectId || targetProjectId}" is not active or could not be found.\n${projectList}`,
      },
    };
  }

  const postChannelId = project.channelId ?? payload.channelId;
  const dedupeKey = buildDedupeKey(project.id, postChannelId);

  if (isDuplicatePost(dedupeKey)) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `*${project.name}* was just posted to <#${postChannelId}>. Try again in a few minutes if you still need a fresh post.`,
      },
    };
  }

  await postProjectOpportunity({
    project,
    channelId: postChannelId,
    requestedBy: payload.userId,
    requestedByName: payload.userName,
    sourceChannelId: payload.channelId,
    slackMessaging,
  });
  recordPost(dedupeKey);
  console.info("[Project Post] Posted project", {
    projectId: project.id,
    postChannelId,
    requestedBy: payload.userId,
    sourceChannel: payload.channelId,
  });

  const channelDescriptor =
    postChannelId === payload.channelId
      ? "this channel"
      : `<#${postChannelId}>`;

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `Posted *${project.name}* to ${channelDescriptor}.`,
    },
  };
}

export function __resetProjectPostDedupeCache(): void {
  recentPosts.clear();
}
