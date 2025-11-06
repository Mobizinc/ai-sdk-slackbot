import { verifyRequest } from "../../lib/slack-utils";
import { getProjectById, listActiveProjects } from "../../lib/projects/catalog";
import { generateProjectInitiationDraft } from "../../lib/projects/initiation-service";
import { createSectionBlock, createDivider, createContextBlock } from "../../lib/utils/message-styling";
import type { ProjectInitiationOutput } from "../../lib/projects/types";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyRequest({
    requestType: "command",
    request,
    rawBody,
  });

  if (verification instanceof Response) {
    return verification;
  }

  const params = new URLSearchParams(rawBody);
  const text = params.get("text") ?? "";
  const userId = params.get("user_id") ?? "";
  const userName = params.get("user_name") ?? "";

  const response = await handleCommand({ text, userId, userName });
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

interface CommandPayload {
  text: string;
  userId: string;
  userName?: string;
}

interface CommandResponse {
  status: number;
  body: Record<string, unknown>;
}

async function handleCommand(payload: CommandPayload): Promise<CommandResponse> {
  const args = payload.text.trim().split(/\s+/).filter(Boolean);

  if (args.length === 0) {
    return helpResponse("Usage: `/project-initiate draft <project-id> [seed idea]`");
  }

  const subcommand = args.shift()?.toLowerCase();
  if (subcommand !== "draft") {
    return helpResponse(`Unknown subcommand \"${subcommand}\". Supported: draft`);
  }

  const projectId = args.shift();
  if (!projectId) {
    return helpResponse("Please provide a project id. Usage: `/project-initiate draft <project-id> [seed idea]`");
  }

  const project = await getProjectById(projectId);
  if (!project) {
    const activeProjects = (await listActiveProjects())
      .map((p) => `• ${p.id} (${p.name})`)
      .join("\n");
    return helpResponse(`Project \"${projectId}\" not found. Active projects:\n${activeProjects}`);
  }

  const ideaSummary = args.join(" ") || undefined;

  try {
    const draft = await generateProjectInitiationDraft({
      project,
      requestedBy: payload.userId,
      requestedByName: payload.userName,
      ideaSummary,
    });

    const blocks = buildResponseBlocks(project.name, draft.requestId, draft.output, ideaSummary);

    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        blocks,
      },
    };
  } catch (error) {
    console.error("[Project Initiation] Command failed", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Failed to generate project initiation draft. Please try again or reach the platform team.",
      },
    };
  }
}

function buildResponseBlocks(
  projectName: string,
  requestId: string | undefined,
  output: ProjectInitiationOutput,
  ideaSummary?: string,
) {
  const blocks: any[] = [];

  blocks.push(createSectionBlock(`*Project Initiation Draft — ${projectName}*`));
  blocks.push(createDivider());
  blocks.push(createSectionBlock(`_${output.shortPitch}_`));
  blocks.push(createSectionBlock(output.elevatorPitch));

  if (output.keyValueProps.length) {
    const bullets = output.keyValueProps.map((item) => `• ${item}`).join("\n");
    blocks.push(createSectionBlock(`*Value Props*\n${bullets}`));
  }

  if (output.kickoffChecklist.length) {
    const checklist = output.kickoffChecklist.map((item) => `• ${item}`).join("\n");
    blocks.push(createSectionBlock(`*Kickoff Checklist*\n${checklist}`));
  }

  if (output.standupGuidance.length) {
    const guidance = output.standupGuidance.map((item) => `• ${item}`).join("\n");
    blocks.push(createSectionBlock(`*Stand-up Guidance*\n${guidance}`));
  }

  if (ideaSummary) {
    blocks.push(createDivider());
    blocks.push(createSectionBlock(`_Seed idea:_ ${ideaSummary}`));
  }

  const footerParts: string[] = [];
  if (requestId) {
    footerParts.push(`Draft saved as \`${requestId}\``);
  }
  footerParts.push("Review the generated Block Kit before posting to #innovationcoe-v2.");

  blocks.push(createContextBlock(footerParts.join(" • ")));

  return blocks;
}

function helpResponse(message: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: message,
    },
  };
}
