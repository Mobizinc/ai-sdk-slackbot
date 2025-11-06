import { AnthropicChatService } from "../../services/anthropic-chat";
import { stripJsonFence } from "../../utils/json";
import {
  COMPANY_METRICS,
  SERVICE_PILLARS,
  TECHNOLOGY_PARTNERS,
  TARGET_MARKETS,
} from "../config/mobizinc-strategy";
import {
  HISTORICAL_PROJECTS,
  findSimilarProjects,
  getAverageTeamSize,
  getAverageTimeline,
} from "../config/historical-projects";
import { SCORING_CRITERIA } from "../config/scoring-rubric";
import type {
  ClarificationMessage,
  DemandRequest,
  FinalSummary,
} from "../types";

const DEFAULT_MODEL = "claude-sonnet-4.5";
const DEFAULT_MAX_TOKENS = 4000;

export interface FinalizeOptions {
  model?: string;
  maxTokens?: number;
}

export interface FinalizePayload {
  originalRequest: DemandRequest;
  conversationHistory: ClarificationMessage[];
}

export async function finalizeStrategicEvaluation(
  payload: FinalizePayload,
  options: FinalizeOptions = {},
): Promise<FinalSummary> {
  const chatService = AnthropicChatService.getInstance();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const prompt = buildFinalizePrompt(payload.originalRequest, payload.conversationHistory);

  const response = await chatService.send({
    model,
    maxTokens,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const cleaned = stripJsonFence(response.outputText ?? "");

  try {
    const parsed = JSON.parse(cleaned) as FinalSummary;
    return parsed;
  } catch (error) {
    console.error("[Strategic Evaluation] Failed to parse final summary response", error);
    throw new Error(`Failed to parse strategic evaluation response as JSON. Raw response: ${cleaned}`);
  }
}

function buildFinalizePrompt(
  request: DemandRequest,
  conversationHistory: ClarificationMessage[],
): string {
  const similarProjects = findSimilarProjects(
    request.strategicAlignment,
    request.targetIndustry ?? "Enterprise / Fortune 500",
    3,
  );

  const avgTeamSize = getAverageTeamSize(request.strategicAlignment[0] ?? "cloud-infrastructure");
  const avgTimeline = getAverageTimeline(request.strategicAlignment[0] ?? "cloud-infrastructure");

  const conversationText =
    conversationHistory.length > 0
      ? conversationHistory
          .map((msg) => `${msg.role === "assistant" ? "Advisor" : "Requester"}: ${msg.content}`)
          .join("\n\n")
      : "No additional clarifications were provided.";

  const historicalBlocks =
    similarProjects.length > 0
      ? similarProjects
          .map((proj, idx) => {
            const reused = proj.reusableAssets.join(", ") || "None listed";
            return [
              `${idx + 1}. **${proj.name}** (${proj.year})`,
              `   - Service Pillars: ${proj.servicePillar.join(", ")}`,
              `   - Industry: ${proj.industry}`,
              `   - Outcome: ${proj.outcome}`,
              `   - Team: ${proj.team.actual} people (${proj.team.composition.join(", ")})`,
              `   - Timeline: ${proj.timeline.actual} months (estimated ${proj.timeline.estimated})`,
              `   - ROI: ${proj.roi.actual}% (estimated ${proj.roi.estimated}%)`,
              `   - Budget Variance: ${proj.budgetVariance > 0 ? "+" : ""}${proj.budgetVariance}%`,
              `   - Key Lessons: ${proj.lessonsLearned.slice(0, 2).join("; ")}`,
              `   - Reusable Assets: ${reused}`,
            ].join("\n");
          })
          .join("\n\n")
      : "No closely matching projects found.";

  const scoringBlocks = SCORING_CRITERIA.map((criterion) => {
    const sub = criterion.subcriteria
      .map((item) => `- ${item.name} (max ${item.maxPoints} pts): ${item.guidelines[0]}`)
      .join("\n");
    return `**${criterion.name}** (Weight: ${criterion.weight}%)
${criterion.description}
${sub}`;
  }).join("\n\n");

  const mobizincContext = [
    "**Mobizinc Strategic Context:**",
    "Service Pillars:",
    SERVICE_PILLARS.map(
      (p) => `- ${p.id}: ${p.name} (${p.typicalMargin}% margin, ${p.demandLevel} demand)`,
    ).join("\n"),
    "",
    "Premier Partners:",
    TECHNOLOGY_PARTNERS.map(
      (partner) =>
        `- ${partner.name} (${partner.partnershipLevel} partner, ${partner.certificationCount ?? 0} certifications)`,
    ).join("\n"),
    "",
    "Target Markets:",
    TARGET_MARKETS.map(
      (market) =>
        `- ${market.industry} (priority ${market.priority}, growth ${market.growthPotential}%)`,
    ).join("\n"),
    "",
    `Strategic Priorities ${COMPANY_METRICS.currentYear}:`,
    COMPANY_METRICS.strategicPriorities.map((p) => `- ${p}`).join("\n"),
  ].join("\n");

  const requestSummary = [
    `Project Name: ${request.projectName}`,
    `Purpose: ${request.purpose}`,
    `Business Value: ${request.businessValue}`,
    `Expected ROI: ${request.expectedROI}`,
  ];
  if (request.roiDetails) {
    requestSummary.push(`ROI Details: ${request.roiDetails}`);
  }
  requestSummary.push(`Timeline: ${request.timeline}`);
  requestSummary.push(`Team Size: ${request.teamSize} people`);
  requestSummary.push(`Resources Needed: ${request.resourcesNeeded}`);
  requestSummary.push(`Strategic Alignment: ${request.strategicAlignment.join(", ")}`);
  if (request.targetIndustry) {
    requestSummary.push(`Target Industry: ${request.targetIndustry}`);
  }
  if (request.partnerTechnologies?.length) {
    requestSummary.push(
      `Partner Technologies: ${request.partnerTechnologies.join(", ")}`,
    );
  }

  const summarySkeleton = JSON.stringify(
    {
      executiveSummary: "",
      strategicScoring: {
        criteriaScores: [
          {
            criterionId: "strategic-fit",
            criterionName: "Strategic Fit",
            score: 0,
            weight: 25,
            weightedScore: 0,
            reasoning: "",
          },
        ],
        totalScore: 0,
        rating: "approved",
        recommendation: "proceed",
        confidence: "medium",
      },
      historicalComparisons: [],
      resourceRecommendation: {
        teamComposition: [],
        estimatedHours: 0,
        estimatedDuration: 0,
        recommendedDeliveryCenters: [],
        utilizationImpact: "neutral",
      },
      riskAssessment: {
        level: "medium",
        primaryRisks: [],
      },
      partnerAlignment: {
        alignedPartners: [],
        partnershipValue: "medium",
        certificationLeverage: [],
      },
      marketOpportunity: {
        industry: "",
        priority: "medium",
        growthPotential: 0,
        competitiveAdvantage: "",
      },
      reusableAssets: [],
      nextSteps: [],
      risksAndAssumptions: [],
      keyMetrics: [],
      completenessScore: 0,
    },
    null,
    2,
  );

  return [
    "You are the Chief Strategy Officer at Mobizinc. Produce a comprehensive strategic evaluation and executive recommendation for the following initiative.",
    "",
    mobizincContext,
    "",
    "**Similar Historical Projects:**",
    historicalBlocks,
    "",
    "**Benchmarks:**",
    `- Average team size: ${avgTeamSize} people`,
    `- Average timeline: ${avgTimeline} months`,
    "",
    "**Scoring Rubric:**",
    scoringBlocks,
    "",
    "**Project Request:**",
    requestSummary.join("\n"),
    "",
    "**Clarification Conversation:**",
    conversationText,
    "",
    "Return a JSON object with the following structure. Ensure valid JSON with double quotes and necessary arrays.",
    summarySkeleton,
  ].join("\n");
}
