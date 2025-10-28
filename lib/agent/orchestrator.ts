/**
 * Agent Orchestrator (Phase 3 Complete)
 *
 * Coordinates the refactored agent pipeline: context loading, prompt building,
 * agent execution, and message formatting. Provides graceful fallback to the
 * legacy executor if any step fails.
 */

import type { ChatMessage } from "../services/anthropic-chat";
import type {
  GenerateResponseOptions,
  UpdateStatusFn,
  LegacyExecutorDeps,
} from "./types";
import { loadContext } from "./context-loader";
import { buildPrompt } from "./prompt-builder";
import { runAgent } from "./runner";
import { formatMessage } from "./message-formatter";
import { withLangSmithTrace, createChildSpan } from "../observability";

class AgentOrchestrator {
  async run(
    messages: ChatMessage[],
    updateStatus?: UpdateStatusFn,
    options?: GenerateResponseOptions,
    deps?: LegacyExecutorDeps,
  ): Promise<string> {
    // Wrap the entire orchestration in a trace
    return withLangSmithTrace(
      async () => {
        try {
          // Create child span for context loading
          const contextSpan = await createChildSpan({
            name: "load_context",
            runType: "chain",
            metadata: {
              channelId: options?.channelId,
              threadTs: options?.threadTs,
            },
            tags: {
              component: "orchestrator",
              operation: "context_loading",
            },
          });

          const context = await loadContext({
            messages,
            channelId: options?.channelId,
            threadTs: options?.threadTs,
          });

          await contextSpan?.end({ contextLoaded: true });

          // Create child span for prompt building
          const promptSpan = await createChildSpan({
            name: "build_prompt",
            runType: "chain",
            metadata: {
              caseNumbers: Array.isArray(context.metadata.caseNumbers)
                ? context.metadata.caseNumbers
                : undefined,
            },
            tags: {
              component: "orchestrator",
              operation: "prompt_building",
            },
          });

          const prompt = await buildPrompt({
            context,
            requestTimestamp: new Date().toISOString(),
          });

          await promptSpan?.end({
            systemPromptLength: prompt.systemPrompt.length,
            conversationLength: prompt.conversation.length,
          });

          const agentMessages: ChatMessage[] = [
            { role: "system", content: prompt.systemPrompt },
            ...prompt.conversation,
          ];

          // Extract case numbers safely
          let caseNumbers: string[] = [];
          if (Array.isArray(context.metadata.caseNumbers)) {
            caseNumbers = context.metadata.caseNumbers.filter(
              (cn): cn is string => typeof cn === 'string'
            );
          }

          // runAgent creates its own child spans internally
          const responseText = await runAgent({
            messages: agentMessages,
            updateStatus,
            options,
            caseNumbers,
          });

          // Create child span for message formatting
          const formatSpan = await createChildSpan({
            name: "format_message",
            runType: "chain",
            tags: {
              component: "orchestrator",
              operation: "message_formatting",
            },
          });

          const formattedMessage = await formatMessage({
            text: responseText,
            updateStatus,
          });

          await formatSpan?.end({ messageLength: formattedMessage.length });

          // Check if Block Kit data should be attached (stored in options by runner)
          const blockKitData = (options as any)?._blockKitData;
          if (blockKitData) {
            // Return extended response with Block Kit data
            // Handler will detect this and use Block Kit formatting
            return JSON.stringify({
              text: formattedMessage,
              _blockKitData: blockKitData,
            });
          }

          return formattedMessage;
        } catch (error) {
          console.error("[Agent] Refactored orchestrator failed:", error);

          if (deps?.legacyExecutor) {
            return deps.legacyExecutor(messages, updateStatus, options);
          }

          throw error;
        }
      },
      {
        name: "agent_orchestrator",
        runType: "chain",
        metadata: {
          channelId: options?.channelId,
          threadTs: options?.threadTs,
          messageCount: messages.length,
        },
        tags: {
          component: "orchestrator",
          operation: "run",
        },
      }
    )();
  }
}

let orchestrator: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
  if (!orchestrator) {
    orchestrator = new AgentOrchestrator();
  }
  return orchestrator;
}

// Test helpers
export function __setOrchestrator(instance: AgentOrchestrator | null): void {
  orchestrator = instance;
}
