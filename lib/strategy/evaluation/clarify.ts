import { AnthropicChatService } from "../../services/anthropic-chat";
import {
  SERVICE_PILLARS,
  TECHNOLOGY_PARTNERS,
} from "../config/mobizinc-strategy";
import type { ClarificationMessage, DemandRequest } from "../types";

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MAX_TOKENS = 500;

export interface ClarifyOptions {
  model?: string;
  maxTokens?: number;
}

export async function generateClarificationQuestion(
  conversationHistory: ClarificationMessage[],
  originalRequest: DemandRequest,
  options: ClarifyOptions = {},
): Promise<string> {
  const chatService = AnthropicChatService.getInstance();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const systemPrompt = buildClarificationSystemPrompt(originalRequest);
  const messages = buildConversation(conversationHistory);

  const response = await chatService.send({
    model,
    maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  return response.outputText?.trim() ?? "";
}

function buildClarificationSystemPrompt(request: DemandRequest): string {
  const context = [
    "You are a senior strategy advisor at Mobizinc conducting a clarification interview for an internal project demand request.",
    "",
    "**Mobizinc Context:**",
    `We specialise in: ${SERVICE_PILLARS.map((p) => p.name).join(", ")}`,
    `Premier partners: ${TECHNOLOGY_PARTNERS.map((p) => p.name).join(", ")}`,
    "Target markets: Healthcare, Pharmaceuticals, Enterprise/Fortune 500, Financial Services, Technology, Manufacturing.",
    "",
    "**Original Request:**",
    `- Project: ${request.projectName}`,
    `- Purpose: ${request.purpose}`,
    `- Value: ${request.businessValue}`,
    `- Strategic Alignment: ${request.strategicAlignment.join(", ")}`,
    "",
    "**Guidelines:**",
    "1. Ask one strategic question at a time, referencing Mobizinc priorities and partner leverage.",
    "2. Challenge vague ROI/value statements and request quantifiable detail.",
    "3. Probe on delivery model, reusable IP, and market differentiation.",
    "4. Keep tone professional and focused on strategic clarity.",
  ];

  return context.join("\n");
}

function buildConversation(history: ClarificationMessage[]) {
  if (history.length === 0) {
    return [
      {
        role: "user" as const,
        content: "Please provide the first strategic clarification question.",
      },
    ];
  }

  return history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}
