/**
 * Anthropic Chat Service
 *
 * Provides a high-level wrapper around Anthropic Messages API with
 * support for tool calling, retries, and LangSmith tracing integration.
 *
 * Phase 4A delivers the core building blocks. Runner integration and
 * service migrations occur in later sub-phases.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParams,
  Message,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, getConfiguredModel } from "../anthropic-provider";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolUseId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ExecuteToolResult {
  toolUseId: string;
  output: unknown;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolResults?: ExecuteToolResult[];
  maxSteps?: number;
  model?: string;
  temperature?: number;
}

export interface ChatResponse {
  message: Message;
  toolCalls: ToolUseBlock[];
  outputText?: string;
  usage?: Anthropic.Messages.Usage;
}

export class AnthropicChatService {
  constructor(private client: Anthropic = getAnthropicClient()) {}

  /**
   * Create or reuse a singleton instance (with LangSmith wrapping applied).
   */
  static getInstance(): AnthropicChatService {
    return getAnthropicChatService();
  }

  async send(request: ChatRequest): Promise<ChatResponse> {
    const params = this.toMessageParams(request);

    const result = await this.client.messages.create(params) as Message;

    const toolCalls = (
      result.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      )
    );

    const textBlocks = result.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === "text",
    );

    return {
      message: result,
      toolCalls,
      outputText: textBlocks.map((block) => block.text).join("\n\n") || undefined,
      usage: result.usage,
    };
  }

  private toMessageParams(request: ChatRequest): MessageCreateParams {
    const model = request.model ?? getConfiguredModel();

    const systemSegments: string[] = [];
    const conversation: MessageCreateParams["messages"] = [];

    for (const message of request.messages) {
      if (message.role === "system") {
        systemSegments.push(message.content);
        continue;
      }

      if (message.role === "assistant") {
        conversation.push({
          role: "assistant",
          content: [{ type: "text", text: message.content }],
        });
        continue;
      }

      if (message.role === "tool") {
        conversation.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolUseId ?? "unknown",
              content: message.content,
            },
          ],
        });
        continue;
      }

      conversation.push({
        role: "user",
        content: [{ type: "text", text: message.content }],
      });
    }

    const tools = request.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
      type: "tool" as const,
    }));

    const toolResults = request.toolResults?.map<ToolResultBlockParam>((result) => ({
      type: "tool_result",
      tool_use_id: result.toolUseId,
      content: String(result.output),
    }));

    const params: MessageCreateParams = {
      model,
      messages: conversation,
      temperature: request.temperature ?? 0.0,
      max_tokens: 4096,
      system: systemSegments.length > 0 ? systemSegments.join("\n\n") : undefined,
    };

    if (tools && tools.length > 0) {
      (params as any).tools = tools;
    }

    if (toolResults && toolResults.length > 0) {
      conversation.push({
        role: "user",
        content: toolResults,
      } as MessageCreateParams["messages"][number]);
    }

    return params;
  }
}

let singletonService: AnthropicChatService | null = null;

export function getAnthropicChatService(): AnthropicChatService {
  if (!singletonService) {
    singletonService = new AnthropicChatService();
  }
  return singletonService;
}

export function __resetAnthropicChatService(): void {
  singletonService = null;
}
