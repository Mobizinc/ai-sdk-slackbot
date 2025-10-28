import type { CoreMessage, UpdateStatusFn, GenerateResponseOptions } from "./types";
import type { ChatMessage, ToolDefinition, ExecuteToolResult } from "../services/anthropic-chat";
import { AnthropicChatService } from "../services/anthropic-chat";
import { getToolRegistry } from "./tool-registry";
import { config } from "../config";
import { withLangSmithTrace, createChildSpan, traceLLMCall, traceToolExecution } from "../observability";

export interface RunnerParams {
  messages: CoreMessage[];
  updateStatus?: UpdateStatusFn;
  options?: GenerateResponseOptions;
  caseNumbers?: string[];
}

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Runs the agent conversation loop using Anthropic Messages API.
 * Handles tool calls sequentially, with basic retry support.
 */
export async function runAgent(params: RunnerParams): Promise<string> {
  return withLangSmithTrace(
    async () => {
      params.updateStatus?.("thinking");

      const chatService = AnthropicChatService.getInstance();
      const toolRegistry = getToolRegistry();

      const availableTools = toolRegistry.createTools({
        caseNumbers: params.caseNumbers ?? [],
        messages: params.messages,
        updateStatus: params.updateStatus,
        options: params.options,
      });

      const toolDefinitions = buildToolDefinitions(availableTools);
      const conversation: ChatMessage[] = params.messages.map(toChatMessage);

      const maxSteps = config.agentMaxToolIterations;
      const toolResults: ExecuteToolResult[] = [];

      for (let step = 0; step < maxSteps; step += 1) {
        // Create a child span for each LLM call
        const llmSpan = await createChildSpan({
          name: `anthropic_call_step_${step + 1}`,
          runType: "llm",
          metadata: {
            step: step + 1,
            maxSteps,
            conversationLength: conversation.length,
            toolsAvailable: toolDefinitions.length,
          },
          tags: {
            component: "runner",
            operation: "llm_call",
            provider: "anthropic",
          },
        });

        let response = await chatService.send({
          messages: conversation,
          tools: toolDefinitions,
          toolResults: toolResults.splice(0),
        });

        // Handle max_tokens truncation during tool use
        // Anthropic best practice: if response is cut off mid-tool-use, retry with higher max_tokens
        if (response.message.stop_reason === "max_tokens") {
          const lastBlock = response.message.content[response.message.content.length - 1];
          if (lastBlock && lastBlock.type === "tool_use") {
            console.warn("[Agent] Response truncated during tool use, retrying with higher max_tokens");

            // Retry with doubled max_tokens (8192)
            response = await chatService.send({
              messages: conversation,
              tools: toolDefinitions,
              toolResults: [], // Already spliced above
              maxTokens: 8192,
            });
          }
        }

        // Handle pause_turn for server tools (e.g., web search)
        // Anthropic best practice: continue the conversation with paused content
        // Using string comparison as SDK types may not include all stop reasons yet
        if ((response.message.stop_reason as string) === "pause_turn") {
          console.log("[Agent] Long-running turn paused, continuing...");

          // Add the paused assistant message to conversation
          const pausedContent = response.message.content
            .map((block: any) => {
              if (block.type === "text") return block.text;
              if (block.type === "tool_use") return `[Tool: ${block.name}]`;
              return "";
            })
            .join("\n");

          conversation.push({
            role: "assistant",
            content: pausedContent,
          });

          // Continue the turn
          response = await chatService.send({
            messages: conversation,
            tools: toolDefinitions,
            toolResults: [],
          });
        }

        await llmSpan?.end({
          toolCallsCount: response.toolCalls.length,
          hasText: !!response.outputText,
          usage: response.usage,
          stopReason: response.message.stop_reason,
        });

        const text = response.outputText ?? extractText(response.message);

        if (response.toolCalls.length === 0) {
          if (!text) {
            throw new Error("[Agent] Anthropic response did not include text output.");
          }
          params.updateStatus?.("complete");
          return text.trim();
        }

        params.updateStatus?.("calling-tool");

        // Create a child span for tool execution batch
        const toolBatchSpan = await createChildSpan({
          name: `tool_execution_batch_step_${step + 1}`,
          runType: "chain",
          metadata: {
            step: step + 1,
            toolCount: response.toolCalls.length,
            toolNames: response.toolCalls.map(tc => tc.name),
          },
          tags: {
            component: "runner",
            operation: "tool_batch",
          },
        });

        // Execute all tools in parallel for better performance
        // Following Anthropic best practice for parallel tool use
        const toolCalls: ToolCall[] = response.toolCalls.map(call => ({
          id: call.id,
          name: call.name,
          input: call.input,
        }));

        const currentToolResults = await Promise.all(
          toolCalls.map(toolCall => executeToolWithTrace(toolCall, availableTools))
        );

        // Accumulate tool results for next LLM call
        // The AnthropicChatService will format these as a single user message
        // with multiple tool_result blocks (Anthropic best practice for parallel tools)
        toolResults.push(...currentToolResults);

        await toolBatchSpan?.end({
          toolResultsCount: toolResults.length,
        });
      }

      throw new Error("[Agent] Exceeded maximum tool iterations.");
    },
    {
      name: "agent_runner",
      runType: "chain",
      metadata: {
        messageCount: params.messages.length,
        caseNumbers: params.caseNumbers,
        maxIterations: config.agentMaxToolIterations,
      },
      tags: {
        component: "runner",
        operation: "run",
      },
    }
  )();
}

function toChatMessage(message: CoreMessage): ChatMessage {
  const content = flattenContent(message.content);
  if (message.role === "system") {
    return { role: "system", content };
  }
  if (message.role === "assistant") {
    return { role: "assistant", content };
  }
  return { role: "user", content };
}

function buildToolDefinitions(tools: Record<string, unknown>): ToolDefinition[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: (tool as any)?.description ?? "",
    inputSchema: (tool as any)?.inputSchema ?? {},
  }));
}

async function executeTool(
  call: ToolCall,
  tools: Record<string, any>,
): Promise<ExecuteToolResult> {
  const tool = tools[call.name];
  if (!tool) {
    return {
      toolUseId: call.id,
      output: { error: `Tool ${call.name} not found` },
      isError: true,
    };
  }

  try {
    const result = await tool.execute(call.input);

    // Check if the result contains an error
    // Following Anthropic best practice: detect error objects and mark with isError
    const hasError = result && typeof result === 'object' && 'error' in result;

    // Check if tool returned multimodal content blocks (images, documents)
    // Tools can return _attachmentBlocks to indicate they want multimodal results
    if (result && typeof result === 'object' && '_attachmentBlocks' in result) {
      const { _attachmentBlocks, _attachmentCount, ...cleanOutput } = result as any;

      // Build content blocks: text first, then images
      const contentBlocks = [
        {
          type: "text" as const,
          text: JSON.stringify(cleanOutput),
        },
        ...(_attachmentBlocks || []),
      ];

      return {
        toolUseId: call.id,
        output: cleanOutput,
        isError: hasError,
        contentBlocks,
      };
    }

    return {
      toolUseId: call.id,
      output: result,
      isError: hasError,
    };
  } catch (error) {
    return {
      toolUseId: call.id,
      output: {
        error: error instanceof Error ? error.message : "Unknown tool error",
      },
      isError: true,
    };
  }
}

/**
 * Execute a tool with tracing
 */
async function executeToolWithTrace(
  call: ToolCall,
  tools: Record<string, any>,
): Promise<ExecuteToolResult> {
  const toolSpan = await createChildSpan({
    name: `tool_${call.name}`,
    runType: "tool",
    metadata: {
      toolName: call.name,
      toolId: call.id,
      inputPreview: JSON.stringify(call.input).slice(0, 200),
    },
    tags: {
      component: "runner",
      operation: "tool_execution",
      toolName: call.name,
    },
  });

  try {
    const result = await executeTool(call, tools);

    const hasError = result.output && typeof result.output === 'object' && 'error' in result.output;

    await toolSpan?.end({
      success: !hasError,
      outputPreview: JSON.stringify(result.output).slice(0, 200),
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await toolSpan?.end(undefined, errorMessage);
    throw error;
  }
}

function flattenContent(content: CoreMessage["content"]): string {
  // CoreMessage content can be string | undefined based on ChatMessage type
  // Handle defensively for backward compatibility
  return String(content ?? "");
}

function extractText(message: any): string | undefined {
  if (!message?.content) return undefined;
  const blocks = Array.isArray(message.content) ? message.content : [message.content];
  const text = blocks
    .filter((block: any) => block?.type === "text")
    .map((block: any) => block.text ?? "")
    .join("\n")
    .trim();
  return text || undefined;
}
