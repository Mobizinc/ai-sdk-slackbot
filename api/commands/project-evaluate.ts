import { verifyRequest } from "../../lib/slack-utils";
import "../../lib/strategy/event-subscribers";
import {
  analyzeDemandRequest,
  finalizeStrategicEvaluation,
  saveStrategicEvaluation,
} from "../../lib/strategy/evaluation";
import {
  createSectionBlock,
  createDivider,
  createContextBlock,
} from "../../lib/utils/message-styling";
import type { DemandRequest } from "../../lib/strategy/types";
import { emitStrategicEvaluationCompleted } from "../../lib/strategy/events";

interface CommandPayload {
  text: string;
  userId: string;
  userName?: string;
  channelId?: string;
}

interface CommandResponse {
  status: number;
  body: Record<string, unknown>;
}

const HELP_TEXT = `Usage: \`/project-evaluate Project Name | Purpose | Business Value | Expected ROI | Timeline | Resources Needed | Team Size | Pillar IDs (comma) | [Industry] | [Partners]\`

Example:
\`/project-evaluate AI Incident Assistant | Automate high-priority ticket triage | Reduce MTTR by 30% | 150% | 3 months | 2 ServiceNow engineers, 1 PM | 4 | servicenow, data-ai | Healthcare | ServiceNow, Azure\``;

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
  const payload: CommandPayload = {
    text: params.get("text") ?? "",
    userId: params.get("user_id") ?? "",
    userName: params.get("user_name") ?? undefined,
    channelId: params.get("channel_id") ?? undefined,
  };

  const response = await handleProjectEvaluateCommand(payload);

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

async function handleProjectEvaluateCommand(payload: CommandPayload): Promise<CommandResponse> {
  if (!payload.text.trim()) {
    return helpResponse("Please provide project details.\n\n" + HELP_TEXT);
  }

  const parseResult = parseDemandRequest(payload.text);
  if (!parseResult.success) {
    return helpResponse(`${parseResult.error}\n\n${HELP_TEXT}`);
  }

  const demandRequest = parseResult.request;

  try {
    const analysis = await analyzeDemandRequest(demandRequest);
    const summary = await finalizeStrategicEvaluation({
      originalRequest: demandRequest,
      conversationHistory: [],
    });
    const persisted = await saveStrategicEvaluation({
      projectName: demandRequest.projectName,
      commandText: payload.text,
      requestedBy: payload.userId,
      requestedByName: payload.userName,
      channelId: payload.channelId,
      analysis,
      summary,
      demandRequest,
    });

    if (persisted) {
      emitStrategicEvaluationCompleted({
        evaluationId: persisted.id,
        projectName: persisted.projectName,
        requestedBy: persisted.requestedBy,
        requestedByName: persisted.requestedByName ?? undefined,
        channelId: persisted.channelId ?? undefined,
        score: persisted.totalScore ?? undefined,
        recommendation: persisted.recommendation ?? undefined,
        confidence: persisted.confidence ?? undefined,
        needsClarification: persisted.needsClarification,
        createdAt:
          persisted.createdAt instanceof Date
            ? persisted.createdAt.toISOString()
            : new Date().toISOString(),
        demandRequest: (persisted.demandRequest ?? demandRequest) as DemandRequest,
        analysis,
        summary,
      });
    }

    const blocks = buildResponseBlocks(demandRequest.projectName, analysis, summary);

    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        blocks,
      },
    };
  } catch (error) {
    console.error("[Project Evaluate] Command failed", error);
    return {
      status: 200,
      body: {
        response_type: "ephemeral",
        text: "Failed to evaluate the project. Please try again or contact the platform team.",
      },
    };
  }
}

export function parseDemandRequest(text: string):
  | { success: true; request: DemandRequest }
  | { success: false; error: string } {
  const parts = text
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length < 8) {
    return { success: false, error: "Unable to parse project details (expected at least 8 fields separated by `|`)." };
  }

  const [
    projectName,
    purpose,
    businessValue,
    expectedROI,
    timeline,
    resourcesNeeded,
    teamSizeRaw,
    alignmentRaw,
    industry,
    partnersRaw,
  ] = parts;

  const teamSize = Number(teamSizeRaw);
  if (!Number.isFinite(teamSize) || teamSize <= 0) {
    return { success: false, error: "Team Size must be a positive number." };
  }

  const alignmentList = alignmentRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (alignmentList.length === 0) {
    return { success: false, error: "At least one strategic alignment pillar is required." };
  }

  const partnerList = partnersRaw
    ? partnersRaw.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  const request: DemandRequest = {
    projectName,
    purpose,
    businessValue,
    expectedROI,
    timeline,
    resourcesNeeded,
    teamSize,
    strategicAlignment: alignmentList,
    targetIndustry: industry,
    partnerTechnologies: partnerList,
  };

  return { success: true, request };
}

function buildResponseBlocks(
  projectName: string,
  analysis: Awaited<ReturnType<typeof analyzeDemandRequest>>,
  summary: Awaited<ReturnType<typeof finalizeStrategicEvaluation>>,
) {
  const blocks: any[] = [];

  blocks.push(createSectionBlock(`*Strategic Evaluation — ${projectName}*`));
  blocks.push(
    createContextBlock(
      [
        `Completeness Score: ${analysis.score}/100`,
        `Recommendation: ${summary.strategicScoring?.recommendation ?? "n/a"}`,
        `Confidence: ${summary.strategicScoring?.confidence ?? "n/a"}`,
      ].join(" • "),
    ),
  );

  if (analysis.needsClarification) {
    blocks.push(
      createSectionBlock(
        `:warning: *Clarification Recommended*\n${(analysis.questions || [])
          .slice(0, 3)
          .map((q) => `• ${q}`)
          .join("\n")}`,
      ),
    );
  }

  if (analysis.issues?.length) {
    blocks.push(createDivider());
    blocks.push(
      createSectionBlock(
        `*Key Issues*\n${analysis.issues.slice(0, 5).map((issue) => `• ${issue}`).join("\n")}`,
      ),
    );
  }

  if (summary.executiveSummary) {
    blocks.push(createDivider());
    blocks.push(
      createSectionBlock(
        `*Executive Summary*\n${truncate(summary.executiveSummary, 800)}`,
      ),
    );
  }

  if (summary.nextSteps?.length) {
    blocks.push(createDivider());
    blocks.push(
      createSectionBlock(
        `*Recommended Next Steps*\n${summary.nextSteps.map((step) => `• ${step}`).join("\n")}`,
      ),
    );
  }

  if (summary.keyMetrics?.length) {
    blocks.push(
      createSectionBlock(
        `*Key Metrics*\n${summary.keyMetrics.map((metric) => `• ${metric}`).join("\n")}`,
      ),
    );
  }

  blocks.push(createDivider());
  blocks.push(
    createContextBlock(
      "Interpretation generated by Strategic Evaluation Agent. Use `/project-initiate` to refine the narrative or `/project-standup` to schedule the first check-in.",
    ),
  );

  return blocks;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
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
