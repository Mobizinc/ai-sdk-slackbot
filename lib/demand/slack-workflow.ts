import type { GenericMessageEvent } from "../slack-event-types";
import {
  fetchDemandSchema,
  analyzeDemandRequest,
  clarifyDemandRequest,
  finalizeDemandRequest,
  type DemandSchema,
  type DemandRequestPayload,
  type WorkflowApiResponse,
  type WorkflowQuestion,
  type WorkflowMetadata,
} from "../services/demand-workflow-service";
import { getSlackMessagingService } from "../services/slack-messaging";
import { workflowManager, Workflow } from "../services/workflow-manager";
import {
  sanitizeMrkdwn,
  sanitizePlainText,
  safeParseMetadata,
} from "../utils/message-styling";
import type { FinalSummary } from "../strategy/types";

const slackMessaging = getSlackMessagingService();

export const DemandCallbackIds = {
  MODAL: "demand_request_modal",
} as const;

const WORKFLOW_TYPE_DEMAND_REQUEST = "DEMAND_REQUEST";

// Define the payload structure for the demand request workflow
export interface DemandWorkflowStatePayload {
    sessionId: string;
    userId: string;
    projectName: string;
    demandRequest: DemandRequestPayload;
    pendingQuestions: WorkflowQuestion[];
    status: 'needs_clarification' | 'complete' | 'error';
    analysis?: WorkflowMetadata["analysis"];
    metadata?: WorkflowMetadata;
    summary?: FinalSummary;
    lastResponseAt?: string;
  }

const ROI_OPTIONS = [
  { label: "High (>=200%)", value: "high" },
  { label: "Medium (50-200%)", value: "medium" },
  { label: "Low (<50%)", value: "low" },
  { label: "Unknown / TBD", value: "unknown" },
];

const DEFAULT_TIMELINE_OPTIONS = [
  "Under 1 month",
  "1-3 months",
  "3-6 months",
  "6-12 months",
  "12+ months",
];

interface DemandModalMetadata {
  channelId: string;
  userId: string;
  userName?: string;
  commandText?: string;
}

const BLOCK_IDS = {
  projectName: { blockId: "demand_project_name", actionId: "value" },
  purpose: { blockId: "demand_purpose", actionId: "value" },
  businessValue: { blockId: "demand_business_value", actionId: "value" },
  expectedRoi: { blockId: "demand_expected_roi", actionId: "value" },
  roiDetails: { blockId: "demand_roi_details", actionId: "value" },
  timeline: { blockId: "demand_timeline", actionId: "value" },
  resourcesNeeded: { blockId: "demand_resources", actionId: "value" },
  teamSize: { blockId: "demand_team_size", actionId: "value" },
  strategicAlignment: { blockId: "demand_pillars", actionId: "value" },
  targetIndustry: { blockId: "demand_industry", actionId: "value" },
  partnerTech: { blockId: "demand_partners", actionId: "value" },
  deliveryOptimization: { blockId: "demand_delivery_opt", actionId: "value" },
} as const;

function buildTimelineOptions(schema: DemandSchema): string[] {
  const configured = schema.promptTemplates?.timelineOptions;
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: string) => item);
      }
    } catch {
      // ignore parse errors
    }
  }
  return DEFAULT_TIMELINE_OPTIONS;
}

export async function openDemandRequestModal(
  triggerId: string,
  schema: DemandSchema,
  metadata: DemandModalMetadata,
): Promise<void> {
  const timelineOptions = buildTimelineOptions(schema);
  const view = {
    type: "modal",
    callback_id: DemandCallbackIds.MODAL,
    private_metadata: JSON.stringify(metadata),
    title: {
      type: "plain_text",
      text: "Demand Request",
    },
    submit: {
      type: "plain_text",
      text: "Analyze",
    },
    close: {
      type: "plain_text",
      text: "Cancel",
    },
    blocks: [
      {
        type: "input",
        block_id: BLOCK_IDS.projectName.blockId,
        label: {
          type: "plain_text",
          text: "Project name",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.projectName.actionId,
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.purpose.blockId,
        label: {
          type: "plain_text",
          text: "Purpose",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.purpose.actionId,
          multiline: true,
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.businessValue.blockId,
        label: {
          type: "plain_text",
          text: "Business value / impact",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.businessValue.actionId,
          multiline: true,
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.expectedRoi.blockId,
        label: {
          type: "plain_text",
          text: "Expected ROI",
        },
        element: {
          type: "static_select",
          action_id: BLOCK_IDS.expectedRoi.actionId,
          options: ROI_OPTIONS.map((option) => ({
            text: {
              type: "plain_text",
              text: option.label,
            },
            value: option.value,
          })),
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.roiDetails.blockId,
        optional: true,
        label: {
          type: "plain_text",
          text: "ROI details (optional)",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.roiDetails.actionId,
          multiline: true,
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.timeline.blockId,
        label: {
          type: "plain_text",
          text: "Target timeline",
        },
        element: {
          type: "static_select",
          action_id: BLOCK_IDS.timeline.actionId,
          options: timelineOptions.map((option) => ({
            text: {
              type: "plain_text",
              text: option,
            },
            value: option,
          })),
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.resourcesNeeded.blockId,
        label: {
          type: "plain_text",
          text: "Resources needed",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.resourcesNeeded.actionId,
          multiline: true,
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.teamSize.blockId,
        label: {
          type: "plain_text",
          text: "Team size",
        },
        element: {
          type: "plain_text_input",
          action_id: BLOCK_IDS.teamSize.actionId,
          initial_value: "5",
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.strategicAlignment.blockId,
        label: {
          type: "plain_text",
          text: "Strategic alignment",
        },
        element: {
          type: "multi_static_select",
          action_id: BLOCK_IDS.strategicAlignment.actionId,
          options: schema.servicePillars.map((pillar) => ({
            text: {
              type: "plain_text",
              text: pillar.name,
            },
            value: pillar.id,
          })),
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.targetIndustry.blockId,
        optional: true,
        label: {
          type: "plain_text",
          text: "Target industry",
        },
        element: {
          type: "static_select",
          action_id: BLOCK_IDS.targetIndustry.actionId,
          options: schema.targetMarkets.map((market) => ({
            text: {
              type: "plain_text",
              text: market.industry,
            },
            value: market.industry,
          })),
        },
      },
      {
        type: "input",
        block_id: BLOCK_IDS.partnerTech.blockId,
        optional: true,
        label: {
          type: "plain_text",
          text: "Partner technologies",
        },
        element: {
          type: "multi_static_select",
          action_id: BLOCK_IDS.partnerTech.actionId,
          options: schema.technologyPartners.map((partner) => ({
            text: {
              type: "plain_text",
              text: partner,
            },
            value: partner,
          })),
        },
      },
      {
        type: "section",
        block_id: BLOCK_IDS.deliveryOptimization.blockId,
        text: {
          type: "mrkdwn",
          text: "Use delivery center optimization?",
        },
        accessory: {
          type: "checkboxes",
          action_id: BLOCK_IDS.deliveryOptimization.actionId,
          options: [
            {
              text: {
                type: "plain_text",
                text: "Yes, optimize for delivery centers",
              },
              value: "true",
            },
          ],
        },
      },
    ],
  };

  await slackMessaging.openView({
    triggerId,
    view,
  });
}

function getInputValue(values: any, blockInfo: { blockId: string; actionId: string }): string | undefined {
  return values?.[blockInfo.blockId]?.[blockInfo.actionId]?.value;
}

function getSelectedOptionValue(
  values: any,
  blockInfo: { blockId: string; actionId: string },
): string | undefined {
  const selected = values?.[blockInfo.blockId]?.[blockInfo.actionId]?.selected_option;
  if (selected) {
    return selected.value;
  }
  return undefined;
}

function getMultiSelectValues(
  values: any,
  blockInfo: { blockId: string; actionId: string },
): string[] {
  const selected = values?.[blockInfo.blockId]?.[blockInfo.actionId]?.selected_options;
  if (Array.isArray(selected)) {
    return selected.map((option) => option.value);
  }
  return [];
}

function getCheckboxValue(values: any, blockInfo: { blockId: string; actionId: string }): boolean {
  const selected = values?.[blockInfo.blockId]?.[blockInfo.actionId]?.selected_options;
  return Array.isArray(selected) && selected.some((option) => option.value === "true");
}

function buildDemandRequestFromView(values: any): DemandRequestPayload {
  const projectName = sanitizePlainText(getInputValue(values, BLOCK_IDS.projectName) ?? "", 200);
  const purpose = sanitizeMrkdwn(getInputValue(values, BLOCK_IDS.purpose) ?? "");
  const businessValue = sanitizeMrkdwn(getInputValue(values, BLOCK_IDS.businessValue) ?? "");
  const expectedROI = getSelectedOptionValue(values, BLOCK_IDS.expectedRoi) ?? "unknown";
  const roiDetailsRaw = getInputValue(values, BLOCK_IDS.roiDetails);
  const roiDetails = roiDetailsRaw ? sanitizeMrkdwn(roiDetailsRaw) : undefined;
  const timeline = getSelectedOptionValue(values, BLOCK_IDS.timeline) ?? "Unknown";
  const resourcesNeeded = sanitizeMrkdwn(getInputValue(values, BLOCK_IDS.resourcesNeeded) ?? "");
  const teamSizeRaw = getInputValue(values, BLOCK_IDS.teamSize);
  const teamSize = Number.parseInt(teamSizeRaw ?? "5", 10);
  const strategicAlignment = getMultiSelectValues(values, BLOCK_IDS.strategicAlignment);
  const targetIndustry = getSelectedOptionValue(values, BLOCK_IDS.targetIndustry);
  const partnerTechnologies = getMultiSelectValues(values, BLOCK_IDS.partnerTech);
  const deliveryOptimization = getCheckboxValue(values, BLOCK_IDS.deliveryOptimization);

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  if (!purpose) {
    throw new Error("Purpose is required.");
  }

  if (strategicAlignment.length === 0) {
    throw new Error("Select at least one service pillar for strategic alignment.");
  }

  return {
    projectName,
    purpose,
    businessValue,
    expectedROI,
    roiDetails,
    timeline,
    resourcesNeeded,
    teamSize: Number.isFinite(teamSize) && teamSize > 0 ? teamSize : 5,
    strategicAlignment,
    targetIndustry,
    partnerTechnologies,
    deliveryOptimization,
  };
}

function formatAnalysisBullets(analysis?: WorkflowMetadata["analysis"]): string {
  if (!analysis) {
    return "_No analysis details available._";
  }

  const parts: string[] = [];
  if (analysis.score !== undefined) {
    parts.push(`• *Score:* ${analysis.score}/100`);
  }
  if (analysis.issues?.length) {
    parts.push(
      `• *Issues:* ${analysis.issues
        .map((issue: string) => sanitizeMrkdwn(issue))
        .join("; ")}`,
    );
  }
  if (analysis.highlights?.length) {
    parts.push(
      `• *Highlights:* ${analysis.highlights
        .map((item: string) => sanitizeMrkdwn(item))
        .join("; ")}`,
    );
  }
  if (parts.length === 0) {
    return "_No analysis findings._";
  }
  return parts.join("\n");
}

async function postInitialAnalysisMessage(
  channelId: string,
  userId: string,
  request: DemandRequestPayload,
  analysis: WorkflowMetadata["analysis"],
  status: WorkflowApiResponse["status"],
): Promise<string> {
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Mobiz Demand Request — ${sanitizePlainText(request.projectName, 250)}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Started by <@${userId}> • *Status:* ${status === "needs_clarification" ? "Needs clarification" : status === "complete" ? "Complete" : "Error"}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatAnalysisBullets(analysis),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Strategic alignment: ${request.strategicAlignment.join(", ")}`,
        },
      ],
    },
  ];

  const result = await slackMessaging.postMessage({
    channel: channelId,
    text: `Demand request started by ${userId}`,
    blocks,
  });

  if (!result.ts) {
    throw new Error("Unable to determine Slack message timestamp for demand request.");
  }

  return result.ts;
}

async function postClarificationQuestion(
  channelId: string,
  threadTs: string,
  question: WorkflowQuestion,
  remaining: number,
): Promise<void> {
  const textLines = [
    `*Question:* ${sanitizeMrkdwn(question.text)}`,
    remaining > 0 ? `_${remaining} additional follow-up${remaining > 1 ? "s" : ""} remain after this._` : "",
    "\nReply in this thread with your answer.",
  ].filter(Boolean);

  await slackMessaging.postMessage({
    channel: channelId,
    threadTs,
    text: textLines.join("\n"),
  });
}

function buildSummaryBlocks(summary: FinalSummary): any[] {
  const blocks: any[] = [];

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "Strategic Evaluation Summary",
    },
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: sanitizeMrkdwn(summary.executiveSummary),
    },
  });

  if (summary.keyMetrics?.length) {
    const bulletText = summary.keyMetrics
      .map((metric: string) => `• ${sanitizeMrkdwn(metric)}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Key Metrics*\n${bulletText}`,
      },
    });
  }

  if (summary.risksAndAssumptions?.length) {
    const riskText = summary.risksAndAssumptions
      .map((risk: string) => `• ${sanitizeMrkdwn(risk)}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Risks & Assumptions*\n${riskText}`,
      },
    });
  }

  if (summary.nextSteps?.length) {
    const steps = summary.nextSteps
      .map((step: string) => `• ${sanitizeMrkdwn(step)}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Next Steps*\n${steps}`,
      },
    });
  }

  if (summary.strategicScoring) {
    const totalScore = summary.strategicScoring.totalScore;
    const rating = summary.strategicScoring.rating;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Strategic Score:* ${totalScore}/100 (${rating})`,
      },
    });
  }

  if (summary.resourceRecommendation?.teamComposition?.length) {
    const composition = summary.resourceRecommendation.teamComposition
      .map(
        (role) =>
          `• ${role.role} (${role.count} ${role.skillLevel})`,
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recommended Team*\n${composition}`,
      },
    });
  }

  return blocks;
}

async function finalizeDemandSession(
  channelId: string,
  threadTs: string,
  workflow: Workflow,
): Promise<void> {
  if (!workflowManager) {
    throw new Error("WorkflowManager not available.");
  }
  const statePayload = workflow.payload as DemandWorkflowStatePayload;
  try {
    const finalizeResponse = await finalizeDemandRequest(statePayload.sessionId);
    const summary = finalizeResponse.summary;

    if (!summary) {
      await slackMessaging.postMessage({
        channel: channelId,
        threadTs,
        text: "⚠️ Finalize request did not return a summary. Please try again or contact the platform team.",
      });
      return;
    }

    const summaryBlocks = buildSummaryBlocks(summary);

    await slackMessaging.postMessage({
      channel: channelId,
      threadTs,
      text: "Demand request completed.",
      blocks: summaryBlocks,
    });

    await workflowManager.transition(workflow.id, workflow.version, {
        toState: 'COMPLETED',
        updatePayload: { summary, status: "complete" },
        lastModifiedBy: 'system',
        reason: 'Finalized after clarification'
    });
  } catch (error) {
    console.error("[Demand] Failed to finalize session:", error);
    await slackMessaging.postMessage({
      channel: channelId,
      threadTs,
      text: "⚠️ Failed to finalize demand request. Please try again later.",
    });
    await workflowManager.transition(workflow.id, workflow.version, { toState: 'FAILED', reason: 'Finalization API error' });
  }
}

export async function handleDemandModalSubmission(payload: any): Promise<void> {
  const metadata = safeParseMetadata<DemandModalMetadata>(
    payload.view.private_metadata,
    ["channelId", "userId"],
  );

  if (!metadata) {
    console.error("[Demand] Missing metadata on demand modal submission");
    return;
  }
  if (!workflowManager) {
    console.error("[Demand] WorkflowManager not available.");
    return;
  }

  try {
    const request = buildDemandRequestFromView(payload.view.state.values);
    const analysisResponse = await analyzeDemandRequest(request);
    
    const threadTs = await postInitialAnalysisMessage(
      metadata.channelId,
      metadata.userId,
      request,
      analysisResponse.metadata?.analysis,
      analysisResponse.status,
    );

    const statePayload: DemandWorkflowStatePayload = {
      sessionId: analysisResponse.sessionId,
      userId: metadata.userId,
      projectName: request.projectName,
      demandRequest: request,
      pendingQuestions: analysisResponse.questions ?? [],
      status: analysisResponse.status,
      analysis: analysisResponse.metadata?.analysis,
      metadata: analysisResponse.metadata,
    };

    const initialState = analysisResponse.status === 'needs_clarification' ? 'AWAITING_CLARIFICATION' : 'COMPLETED';

    const workflow = await workflowManager.start({
      workflowType: WORKFLOW_TYPE_DEMAND_REQUEST,
      workflowReferenceId: threadTs,
      initialState,
      payload: statePayload,
      expiresInSeconds: 72 * 3600,
      contextKey: `slack:${metadata.channelId}:${threadTs}`,
      correlationId: analysisResponse.sessionId,
    });

    if (analysisResponse.status === "needs_clarification" && analysisResponse.questions?.length) {
      await postClarificationQuestion(
        metadata.channelId,
        threadTs,
        analysisResponse.questions[0],
        Math.max(analysisResponse.questions.length - 1, 0),
      );
    } else if (analysisResponse.status === "complete") {
      await finalizeDemandSession(metadata.channelId, threadTs, workflow);
    } else if (analysisResponse.status === "error") {
      await slackMessaging.postMessage({
        channel: metadata.channelId,
        threadTs,
        text: `⚠️ Demand request failed: ${ 
          analysisResponse.error?.message ?? "Unknown error" 
        }`,
      });
      await workflowManager.transition(workflow.id, workflow.version, { toState: 'FAILED', reason: 'Analysis API error' });
    }
  } catch (error) {
    console.error("[Demand] Error handling modal submission:", error);
    await slackMessaging.postMessage({
      channel: metadata.channelId,
      text: `⚠️ Failed to analyze demand request: ${ 
        error instanceof Error ? error.message : "Unknown error" 
      }`,
    });
  }
}

export async function handleDemandThreadReply(
  event: GenericMessageEvent,
): Promise<boolean> {
  if (!event.thread_ts || !event.text || !event.channel) {
    return false;
  }

  if (!workflowManager) {
      console.warn("[Demand] WorkflowManager not available. Cannot handle thread reply.");
      return false;
  }

  const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_DEMAND_REQUEST, event.thread_ts);

  if (!workflow || workflow.currentState !== 'AWAITING_CLARIFICATION') {
    return false;
  }

  const payload = workflow.payload as DemandWorkflowStatePayload;
  if (event.user !== payload.userId) {
    await slackMessaging.postMessage({
      channel: event.channel,
      threadTs: event.thread_ts,
      text: `Only <@${payload.userId}> can answer the follow-up questions for this demand request.`,
    });
    return true;
  }

  const pending = payload.pendingQuestions;
  if (!pending || pending.length === 0) {
    // This case should ideally not happen if state is correct, but we handle it.
    return true;
  }

  const answer = event.text.trim();
  if (!answer) {
    await slackMessaging.postMessage({
      channel: event.channel,
      threadTs: event.thread_ts,
      text: "Please provide a response to the question.",
    });
    return true;
  }

  const activeQuestion = pending[0];

  try {
    const clarifyResponse = await clarifyDemandRequest({
      sessionId: payload.sessionId,
      questionId: activeQuestion?.id,
      answer,
    });

    const nextState = clarifyResponse.status === 'needs_clarification' ? 'AWAITING_CLARIFICATION' : 'COMPLETING';
    
    const updatedWorkflow = await workflowManager.transition(workflow.id, workflow.version, {
        toState: nextState,
        updatePayload: { 
            pendingQuestions: clarifyResponse.questions ?? [],
            metadata: clarifyResponse.metadata,
            status: clarifyResponse.status,
            lastResponseAt: new Date().toISOString()
        },
        lastModifiedBy: event.user,
        reason: `User provided clarification.`
    });

    if (clarifyResponse.response) {
      await slackMessaging.postMessage({
        channel: event.channel,
        threadTs: event.thread_ts,
        text: sanitizeMrkdwn(clarifyResponse.response),
      });
    }

    if (clarifyResponse.status === "needs_clarification" && clarifyResponse.questions?.length) {
      await postClarificationQuestion(
        event.channel,
        event.thread_ts,
        clarifyResponse.questions[0],
        Math.max(clarifyResponse.questions.length - 1, 0),
      );
    } else if (clarifyResponse.status === "complete") {
      // Pass the most up-to-date workflow object to finalize
      await finalizeDemandSession(event.channel, event.thread_ts, updatedWorkflow);
    }
  } catch (error) {
    console.error("[Demand] Failed to process clarification:", error);
    await slackMessaging.postMessage({
      channel: event.channel,
      threadTs: event.thread_ts,
      text: `⚠️ Failed to process clarification: ${ 
        error instanceof Error ? error.message : "Unknown error" 
      }`,
    });
  }

  return true;
}