import { AnthropicChatService } from "../../services/anthropic-chat";
import { stripJsonFence } from "../../utils/json";
import { config } from "../../config";
import {
  SERVICE_PILLARS,
  TECHNOLOGY_PARTNERS,
  COMPANY_METRICS,
} from "../config/mobizinc-strategy";
import type { AnalysisResult, DemandRequest } from "../types";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 1500;

export interface AnalyzeOptions {
  model?: string;
  maxTokens?: number;
}

export async function analyzeDemandRequest(
  request: DemandRequest,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const chatService = AnthropicChatService.getInstance();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const prompt = buildAnalysisPrompt(request);

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

  const rawText = response.outputText ?? "";
  const cleaned = stripJsonFence(rawText);

  try {
    const parsed = JSON.parse(cleaned) as AnalysisResult;
    return parsed;
  } catch (error) {
    console.error("[Strategic Evaluation] Failed to parse analysis response", error);
    throw new Error(`Failed to parse analysis response as JSON. Raw response: ${cleaned}`);
  }
}

export function buildAnalysisPrompt(request: DemandRequest): string {
  const mobizincContext = [
    "**About Mobizinc:**",
    "Mobizinc is a leading IT solutions consultancy with 100+ technologists specialising in digital transformation.",
    "We operate global delivery centres across 13 locations (Houston HQ, US offices, Canada, Pakistan, India, Ukraine, Brazil, Singapore, Bahrain).",
    "",
    "**Strategic Service Pillars:**",
    SERVICE_PILLARS.map(
      (pillar) => `- ${pillar.name}: ${pillar.description}`,
    ).join("\n"),
    "",
    "**Premier Technology Partners:**",
    TECHNOLOGY_PARTNERS.map((partner) => partner.name).join(", "),
    "",
    `**Strategic Priorities (${COMPANY_METRICS.currentYear}):**`,
    COMPANY_METRICS.strategicPriorities.map((p) => `- ${p}`).join("\n"),
    "",
    "**Target Industries:** Healthcare, Pharmaceuticals, Enterprise/Fortune 500, Financial Services, Technology/Startups, Manufacturing",
  ];

  const extraContext = (config.strategyAdditionalContext as string) ?? "";
  const focusRegions = (config.strategyFocusRegions as string[]) ?? [];
  const keyInitiatives = (config.strategyKeyInitiatives as string[]) ?? [];

  if (extraContext.trim().length > 0) {
    mobizincContext.push("", "**Additional Strategic Context:**", extraContext.trim());
  }
  if (focusRegions.length > 0) {
    mobizincContext.push("", `**Focus Regions:** ${focusRegions.join(", ")}`);
  }
  if (keyInitiatives.length > 0) {
    mobizincContext.push("", `**Key Initiatives:** ${keyInitiatives.join(", ")}`);
  }

  const header = [
    "You are a senior strategy advisor at Mobizinc. Evaluate the internal project request below against Mobizinc's strategic priorities, service capabilities, and business objectives.",
    "",
    mobizincContext.join("\n"),
    "",
    "**PROJECT REQUEST:**",
  ].join("\n");

  const details = [
    `Project Name: ${request.projectName}`,
    `Purpose: ${request.purpose}`,
    `Business Value: ${request.businessValue}`,
    `Expected ROI: ${request.expectedROI}`,
  ];
  if (request.roiDetails) {
    details.push(`ROI Details: ${request.roiDetails}`);
  }
  details.push(`Timeline: ${request.timeline}`);
  details.push(`Team Size: ${request.teamSize}`);
  details.push(`Resources Needed: ${request.resourcesNeeded}`);
  details.push(`Strategic Alignment: ${request.strategicAlignment.join(", ")}`);
  if (request.targetIndustry) {
    details.push(`Target Industry: ${request.targetIndustry}`);
  }
  if (request.partnerTechnologies?.length) {
    details.push(
      `Partner Technologies: ${request.partnerTechnologies.join(", ")}`,
    );
  }

  return [
    header,
    details.join("\n"),
    "",
    "**YOUR TASK:**",
    "1. Strategic Fit Analysis:",
    "   - Identify which service pillars are relevant.",
    "   - Determine leverage of premier partners (Azure, ServiceNow, Palo Alto, HashiCorp, Citrix).",
    "   - Check alignment with current strategic priorities and target industries.",
    "2. Quality Assessment:",
    "   - Highlight gaps, vague statements, or missing metrics.",
    "   - Evaluate ROI justification and success metrics.",
    "   - Assess scope definition and risk clarity.",
    "3. Clarification Questions:",
    "   - Generate 3-5 strategic questions that directly improve the proposal.",
    "   - Focus on Mobizinc-specific considerations (partner leverage, delivery model, reusability, market impact).",
    "4. Scoring:",
    "   - Provide a completeness score 0-100.",
    "   - Indicate if clarification is required before approval.",
    "",
    "**RESPOND IN VALID JSON:**",
    JSON.stringify(
      {
        issues: ["string"],
        questions: ["string"],
        score: 0,
        needsClarification: true,
        servicePillars: ["pillar-id"],
      },
      null,
      2,
    ),
  ].join("\n");
}
