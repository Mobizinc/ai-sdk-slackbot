import { verifyRequest } from "../../lib/slack-utils";
import { getProjectById, listActiveProjects } from "../../lib/projects/catalog";
import { getStandupConfig, triggerStandupManually } from "../../lib/projects/standup-service";

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

  const commandPayload = {
    text: params.get("text") ?? "",
    userId: params.get("user_id") ?? "",
    userName: params.get("user_name") ?? "",
  };

  const response = await handleStandupCommand(commandPayload);
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

async function handleStandupCommand(payload: CommandPayload): Promise<CommandResponse> {
  const args = payload.text.trim().split(/\s+/).filter(Boolean);

  if (args.length === 0) {
    return helpResponse("Please specify a subcommand. Usage: `/project-standup run <project-id>`");
  }

  const [subcommand, projectId] = args;

  if (subcommand !== "run") {
    return helpResponse(`Unknown subcommand \\"${subcommand}\\". Supported: run`);
  }

  if (!projectId) {
    return helpResponse("Please provide a project id. Usage: `/project-standup run <project-id>`");
  }

  const project = getProjectById(projectId);
  if (!project) {
    const activeProjects = listActiveProjects()
      .map((p) => `• ${p.id} (${p.name})`)
      .join("\n");
    return helpResponse(`Project \\"${projectId}\\" not found. Active projects:\n${activeProjects}`);
  }

  const config = getStandupConfig(project);
  if (!config) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Stand-ups are not enabled for *${project.name}*. Update the project configuration to enable them.`,
      },
    };
  }

  const result = await triggerStandupManually(project, config);
  if (!result) {
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: `Could not start stand-up for *${project.name}*. Check logs for details.`,
      },
    };
  }

  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `Started stand-up for *${project.name}* with ${result.participants.length} participant(s).`,
    },
  };
}

function helpResponse(message: string): CommandResponse {
  return {
    status: 200,
    body: {
      response_type: "ephemeral",
      text: `${message}`,
    },
  };
}
