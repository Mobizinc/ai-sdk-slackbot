import type { CoreMessage, UpdateStatusFn, GenerateResponseOptions } from "./types";
import type { ChatMessage, ToolDefinition, ExecuteToolResult } from "../services/anthropic-chat";
import { AnthropicChatService } from "../services/anthropic-chat";
import { getToolRegistry } from "./tool-registry";
import { config } from "../config";

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
    const response = await chatService.send({
      messages: conversation,
      tools: toolDefinitions,
      toolResults: toolResults.splice(0),
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

    for (const call of response.toolCalls) {
      const toolCall: ToolCall = {
        id: call.id,
        name: call.name,
        input: call.input,
      };

      const toolResult = await executeTool(toolCall, availableTools);
      toolResults.push(toolResult);
      conversation.push({
        role: "tool",
        content: JSON.stringify(toolResult.output ?? {}),
        toolUseId: toolResult.toolUseId,
      });
    }
  }

  throw new Error("[Agent] Exceeded maximum tool iterations.");
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
    };
  }

  try {
    const result = await tool.execute(call.input);
    return {
      toolUseId: call.id,
      output: result,
    };
  } catch (error) {
    return {
      toolUseId: call.id,
      output: {
        error: error instanceof Error ? error.message : "Unknown tool error",
      },
    };
  }
}

function flattenContent(content: CoreMessage["content"]): string {
  // Converts content to string, handling potential null/undefined values defensively
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
