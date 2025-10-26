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

class AgentOrchestrator {
  async run(
    messages: ChatMessage[],
    updateStatus?: UpdateStatusFn,
    options?: GenerateResponseOptions,
    deps?: LegacyExecutorDeps,
  ): Promise<string> {
    try {
      const context = await loadContext({
        messages,
        channelId: options?.channelId,
        threadTs: options?.threadTs,
      });

      const prompt = await buildPrompt({
        context,
        requestTimestamp: new Date().toISOString(),
      });

      const agentMessages: ChatMessage[] = [
        { role: "system", content: prompt.systemPrompt },
        ...prompt.conversation,
      ];

      const responseText = await runAgent({
        messages: agentMessages,
        updateStatus,
        options,
        caseNumbers: Array.isArray(context.metadata.caseNumbers)
          ? (context.metadata.caseNumbers as string[])
          : [],
      });

      return formatMessage({
        text: responseText,
        updateStatus,
      });
    } catch (error) {
      console.error("[Agent] Refactored orchestrator failed:", error);

      if (deps?.legacyExecutor) {
        return deps.legacyExecutor(messages, updateStatus, options);
      }

      throw error;
    }
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
