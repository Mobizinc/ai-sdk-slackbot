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
import { config } from "../config";

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

/**
 * Content block types for multimodal tool results
 */
export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ImageContentBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string; // base64 encoded image data
  };
}

export interface DocumentContentBlock {
  type: "document";
  source: {
    type: "text";
    media_type: string;
    data: string;
  };
}

export type ContentBlock = TextContentBlock | ImageContentBlock | DocumentContentBlock;

export interface ExecuteToolResult {
  toolUseId: string;
  output: unknown;
  isError?: boolean; // Indicates if the tool execution resulted in an error
  contentBlocks?: ContentBlock[]; // Multimodal content blocks (images, documents, text)
}

export type ToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string }
  | { type: "none" };

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolResults?: ExecuteToolResult[];
  maxSteps?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: ToolChoice;
}

export interface ChatResponse {
  message: Message;
  toolCalls: ToolUseBlock[];
  outputText?: string;
  usage?: Anthropic.Messages.Usage;
}

/**
 * Caching strategy types
 */
export type CachingStrategy = "system-only" | "system-and-tools" | "aggressive";

/**
 * Helper to determine if caching should be applied based on config
 */
function shouldUsePromptCaching(): boolean {
  return config.anthropicPromptCachingEnabled === true;
}

/**
 * Get the configured caching strategy
 */
function getCachingStrategy(): CachingStrategy {
  const strategy = config.anthropicCachingStrategy as string;
  if (strategy === "system-and-tools" || strategy === "aggressive") {
    return strategy as CachingStrategy;
  }
  return "system-only";
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
        (block: Anthropic.Messages.ContentBlock): block is ToolUseBlock => block.type === "tool_use",
      )
    );

    const textBlocks = result.content.filter(
      (block: Anthropic.Messages.ContentBlock): block is Anthropic.Messages.TextBlock => block.type === "text",
    );

    return {
      message: result,
      toolCalls,
      outputText: textBlocks.map((block: Anthropic.Messages.TextBlock) => block.text).join("\n\n") || undefined,
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
      type: "custom" as const,
    }));

    const toolResults = request.toolResults?.map<ToolResultBlockParam>((result) => {
      // If contentBlocks provided, use multimodal content (images, documents, text)
      // This allows tools to return rich content like screenshots and diagrams
      if (result.contentBlocks && result.contentBlocks.length > 0) {
        const toolResultBlock: ToolResultBlockParam = {
          type: "tool_result",
          tool_use_id: result.toolUseId,
          content: result.contentBlocks as any, // Anthropic SDK accepts content block arrays
        };

        // Add is_error field if the tool execution resulted in an error
        if (result.isError) {
          (toolResultBlock as any).is_error = true;
        }

        return toolResultBlock;
      }

      // Fallback to legacy string/JSON output for backward compatibility
      let content: string;
      if (typeof result.output === "string") {
        content = result.output;
      } else if (result.output === undefined || result.output === null) {
        content = "";
      } else {
        try {
          content = JSON.stringify(result.output);
        } catch (error) {
          console.warn("[AnthropicChat] Failed to stringify tool output:", error);
          content = "";
        }
      }

      const toolResultBlock: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: result.toolUseId,
        content,
      };

      // Add is_error field if the tool execution resulted in an error
      // This follows Anthropic best practice for error handling
      if (result.isError) {
        (toolResultBlock as any).is_error = true;
      }

      return toolResultBlock;
    });

    // Apply prompt caching if enabled
    const useCaching = shouldUsePromptCaching();
    const cachingStrategy = getCachingStrategy();

    // Build system prompt with optional caching
    let systemPrompt: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> | undefined;

    if (systemSegments.length > 0) {
      const combinedSystem = systemSegments.join("\n\n");

      if (useCaching && combinedSystem.length > 1024) {
        // Use structured content with cache_control for system prompts > 1024 chars
        // Anthropic best practice: mark the last block as cacheable
        systemPrompt = [
          {
            type: "text",
            text: combinedSystem,
            cache_control: { type: "ephemeral" },
          },
        ];
      } else {
        // Use simple string for short prompts or when caching disabled
        systemPrompt = combinedSystem;
      }
    }

    const params: MessageCreateParams = {
      model,
      messages: conversation,
      temperature: request.temperature ?? 0.0,
      max_tokens: request.maxTokens ?? 4096,
      system: systemPrompt,
    };

    if (tools && tools.length > 0) {
      const toolsWithCaching = tools.map((tool, index) => {
        // Apply cache_control to tools if strategy includes them
        const shouldCacheTool = useCaching &&
          (cachingStrategy === "system-and-tools" || cachingStrategy === "aggressive") &&
          index === tools.length - 1; // Only cache the last tool (Anthropic best practice)

        return shouldCacheTool
          ? { ...tool, cache_control: { type: "ephemeral" as const } }
          : tool;
      });

      (params as any).tools = toolsWithCaching;

      // Add tool_choice parameter if specified
      // Allows control over whether Claude uses tools: auto (default), any, specific tool, or none
      if (request.toolChoice) {
        (params as any).tool_choice = request.toolChoice;
      }
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
