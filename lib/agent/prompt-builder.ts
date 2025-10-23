/**
 * Prompt Builder (Phase 3C Complete)
 *
 * Assembles system prompts and conversation context for the agent by loading
 * base prompts, enriching with business context, and preparing message history.
 */

import type { CoreMessage } from "./types";
import type { ContextLoaderResult } from "./context-loader";
import { getSystemPrompt } from "../system-prompt";
import { getBusinessContextService } from "../services/business-context-service";

export interface PromptBuilderInput {
  context: ContextLoaderResult;
  requestTimestamp?: string;
}

export interface PromptBuilderResult {
  systemPrompt: string;
  conversation: CoreMessage[];
}

export async function buildPrompt(input: PromptBuilderInput): Promise<PromptBuilderResult> {
  const context = input.context;
  const requestDate = input.requestTimestamp ?? new Date().toISOString().split("T")[0];

  const basePrompt = await getSystemPrompt(requestDate);
  const businessContextService = getBusinessContextService();

  const companyName = (context.metadata.businessContext as { entityName?: string } | undefined)
    ?.entityName ?? context.metadata.companyName;

  const enhancedPrompt = await businessContextService.enhancePromptWithContext(
    basePrompt,
    companyName,
    (context.metadata.caseContext as any)?.channelTopic,
    (context.metadata.caseContext as any)?.channelPurpose,
  );

  return {
    systemPrompt: enhancedPrompt,
    conversation: context.messages,
  };
}
