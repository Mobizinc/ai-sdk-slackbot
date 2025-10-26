/**
 * Legacy Generate Response Implementation
 *
 * This is the original monolithic implementation being phased out in favor
 * of the modular agent architecture. Kept for backward compatibility and
 * as a fallback during the refactor transition.
 *
 * @deprecated Use the refactored agent modules in lib/agent/ instead
 */

import { generateText, type CoreMessage } from "./instrumented-ai";
import { getContextManager } from "./context-manager";
import { sanitizeModelConfig } from "./model-capabilities";
import { getBusinessContextService } from "./services/business-context-service";
import { modelProvider, getActiveModelId } from "./model-provider";
import { getSystemPrompt } from "./system-prompt";
import { createLegacyAgentTools } from "./agent/tools/factory";

type UpdateStatusFn = (status: string) => void;
type GenerateResponseOptions = {
  channelId?: string;
  channelName?: string;
  threadTs?: string;
};

let generateTextImpl = generateText;

export const __setGenerateTextImpl = (
  impl: typeof generateText,
) => {
  generateTextImpl = impl;
};

export const __resetGenerateTextImpl = () => {
  generateTextImpl = generateText;
};

export const generateResponseLegacy = async (
  messages: CoreMessage[],
  updateStatus?: UpdateStatusFn,
  options?: GenerateResponseOptions,
) => {
  // Safe updateStatus wrapper that catches errors
  const safeUpdateStatus = (status: string) => {
    try {
      updateStatus?.(status);
    } catch (error) {
      console.warn(`[Status Update] Error updating status to "${status}":`, error);
    }
  };

  safeUpdateStatus("thinking");

  const activeModelId = getActiveModelId();

  let lastConfigBuilder: ((model: unknown) => Record<string, unknown>) | undefined;

  const runModel = async () => {
    // Extract case numbers and context for business context enrichment
    const contextManager = getContextManager();
    const businessContextService = getBusinessContextService();

    let companyName: string | undefined;
    let channelTopic: string | undefined;
    let channelPurpose: string | undefined;

    // Try to extract company from conversation context
    const messageText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const caseNumbers = contextManager.extractCaseNumbers(messageText);

    if (caseNumbers.length > 0) {
      // Get context for the first case number mentioned
      const contexts = contextManager.getContextsForCase(caseNumbers[0]);
      if (contexts.length > 0) {
        const context = contexts[0];
        companyName = context.channelName; // Use channel name as company hint
        channelTopic = (context as any).channelTopic;
        channelPurpose = (context as any).channelPurpose;
      }
    }

    // If no company found from case context, try to extract from message text
    // by searching for known company names/aliases in business context
    if (!companyName) {
      // Get all business contexts to check against message text
      const businessContextRepository = await import("./db/repositories/business-context-repository");
      const repo = businessContextRepository.getBusinessContextRepository();

      try {
        // Search for company mentions in message text
        const allContexts = await repo.getAllActive();
        for (const ctx of allContexts) {
          const namesToCheck = [ctx.entityName, ...(ctx.aliases || [])];
          for (const name of namesToCheck) {
            if (messageText.toLowerCase().includes(name.toLowerCase())) {
              companyName = ctx.entityName;
              console.log(`📋 [Business Context] Detected company "${ctx.entityName}" from message text (matched: "${name}")`);
              break;
            }
          }
          if (companyName) break;
        }
      } catch (error) {
        console.warn("[Business Context] Failed to search message text for company names:", error);
      }
    }

    // Build base system prompt from config file
    const baseSystemPrompt = await getSystemPrompt(new Date().toISOString().split("T")[0]);

    // Enhance system prompt with business context
    const enhancedSystemPrompt = await businessContextService.enhancePromptWithContext(
      baseSystemPrompt,
      companyName,
      channelTopic,
      channelPurpose
    );

    const createTools = () =>
      createLegacyAgentTools({
        messages,
        caseNumbers,
        updateStatus,
        options,
      });

    const createConfig = (model: unknown) => ({
      model,
      system: enhancedSystemPrompt,
      messages,
      stopWhen: (response: any) => response.stepCount >= 10,
      tools: createTools(),
    });

    lastConfigBuilder = createConfig;

    const baseModel = modelProvider.languageModel("chat-model");
    const baseConfig = createConfig(baseModel);
    const sanitizedConfig = sanitizeModelConfig(
      activeModelId,
      baseConfig as any,
    ) as any;
    return generateTextImpl(sanitizedConfig);

  };

  console.log(`[Model Router] Using ${activeModelId}`);

  let text: string;
  let result: any;

  // Helper function to run model with detailed logging
  const runModelWithLogging = async (modelId: string, isRetry = false) => {
    const retryLabel = isRetry ? " (RETRY)" : "";
    console.log(`[Model Request${retryLabel}] Model: ${modelId}`);
    console.log(`[Model Request${retryLabel}] Messages count: ${messages.length}`);
    console.log(`[Model Request${retryLabel}] Last message:`, messages[messages.length - 1]);

    const modelResult = await runModel();

    console.log(`[Model Response${retryLabel}] Full result:`, JSON.stringify(modelResult, null, 2).substring(0, 2000));
    console.log(`[Model Response${retryLabel}] Response keys:`, Object.keys(modelResult));
    console.log(`[Model Response${retryLabel}] Text length: ${modelResult.text?.length || 0}`);
    console.log(`[Model Response${retryLabel}] Raw text:`, modelResult.text);
    console.log(`[Model Response${retryLabel}] Finish reason:`, modelResult.finishReason);
    console.log(`[Model Response${retryLabel}] Usage:`, modelResult.usage);
    const responseMetadata = modelResult.response
      ? {
        modelId: modelResult.response.modelId,
        headers: modelResult.response.headers,
        messageCount: modelResult.response.messages?.length,
      }
      : undefined;
    console.log(`[Model Response${retryLabel}] Response metadata:`, JSON.stringify({
      finishReason: modelResult.finishReason,
      usage: modelResult.usage,
      warnings: modelResult.warnings,
      response: responseMetadata,
    }, null, 2));

    return modelResult;
  };

  try {
    result = await runModelWithLogging(activeModelId);
    text = result.text;

    // Check for tool calls or steps that might explain empty text
    if (result.steps) {
      console.log(`[Model Response] Steps taken: ${result.steps.length}`);
      result.steps.forEach((step: any, i: number) => {
        console.log(`[Model Response] Step ${i}:`, {
          stepType: step.stepType,
          text: step.text?.substring(0, 100),
          toolCalls: step.toolCalls?.length,
          toolResults: step.toolResults?.length,
          finishReason: step.finishReason,
        });

        // Log tool calls in detail
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((call: any, j: number) => {
            console.log(`  [Tool Call ${j}]:`, {
              toolName: call.toolName,
              args: call.args,
            });
          });
        }

        // Log tool results in detail
        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((result: any, j: number) => {
            const resultStr = typeof result.result === 'string'
              ? result.result.substring(0, 200)
              : result.result
                ? JSON.stringify(result.result).substring(0, 200)
                : 'undefined';
            console.log(`  [Tool Result ${j}]:`, {
              toolName: result.toolName,
              result: resultStr,
            });
          });
        }
      });
    }
  } catch (error) {
    console.error(`Model ${activeModelId} failed:`, error);
    console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack');
    throw error; // Don't fallback, just fail
  }

  // Handle empty response from GLM-4.6 with OpenAI fallback
  let finalText = text?.trim();

  if (!finalText) {
    console.warn(`[Empty Response] ${activeModelId} returned empty text`);
    console.warn(`[Empty Response] Finish reason: ${result.finishReason}`);
    console.warn(`[Empty Response] Usage:`, result.usage);
    console.warn(`[Empty Response] Steps:`, result.steps?.length || 0);

    // Check if this is GLM-4.6 and we can fallback to OpenAI
    const isGatewayModel = activeModelId.includes("glm");
    const openAiFallback = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-5-mini";

    if (isGatewayModel) {
      console.warn(`[Fallback] Retrying with ${openAiFallback} due to empty GLM response`);

      try {
        // Import openai provider for fallback
        const { openai } = await import("@ai-sdk/openai");

        const fallbackModel = openai(openAiFallback);
        if (!lastConfigBuilder) {
          throw new Error("Fallback configuration not available");
        }
        const fallbackConfig = lastConfigBuilder(fallbackModel);
        const sanitizedFallbackConfig = sanitizeModelConfig(
          openAiFallback,
          fallbackConfig as any,
        ) as any;
        const fallbackResult = await generateTextImpl(sanitizedFallbackConfig);

        console.log(`[Fallback] ${openAiFallback} response:`, fallbackResult.text?.substring(0, 200));
        console.log(`[Fallback] Finish reason:`, fallbackResult.finishReason);
        console.log(`[Fallback] Usage:`, fallbackResult.usage);

        finalText = fallbackResult.text?.trim();

        if (finalText) {
          console.log(`[Fallback] Successfully recovered using ${openAiFallback}`);
        }
      } catch (fallbackError) {
        console.error(`[Fallback] ${openAiFallback} also failed:`, fallbackError);
      }
    }

    // If still empty after fallback, provide helpful message
    if (!finalText) {
      // Check if user's message is empty or just a mention
      const userMessage = messages[messages.length - 1];
      const userText = userMessage?.content?.toString().trim();

      if (!userText || userText.length < 10) {
        finalText = "Hi! I'm your Mobiz Service Desk Assistant. How can I help you today?";
        console.log(`[Empty Response] Returning friendly greeting for empty/short mention`);
      } else {
        // Provide a general fallback message for other empty response cases
        finalText = "I apologize, but I'm having trouble generating a response right now. Please try rephrasing your question or contact support if the issue persists.";
        console.log(`[Empty Response] Returning fallback message for empty LLM response`);
      }
    }
  }

  // Convert markdown to Slack mrkdwn format
  safeUpdateStatus("formatting");

  const formatted = finalText
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*") // Convert markdown headers to bold
    .replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>") // Convert markdown links to Slack links
    .replace(/\*\*/g, "*"); // Convert markdown bold to Slack bold

  safeUpdateStatus("sent");
  return formatted;
};
