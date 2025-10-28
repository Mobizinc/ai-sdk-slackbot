/**
 * Anthropic-Native Tool Helpers
 *
 * Provides tool creation utilities compatible with Anthropic Messages API.
 * Re-exports ChatMessage from AnthropicChatService as the canonical message type.
 *
 * This module eliminates the dependency on the `ai` package for agent tools.
 */

import type { ChatMessage } from "../../services/anthropic-chat";

/**
 * Canonical message type - re-exported from AnthropicChatService
 * Matches Anthropic Messages API schema end-to-end
 */
export type { ChatMessage };

/**
 * @deprecated Use ChatMessage instead. CoreMessage is kept for backward compatibility.
 * Will be removed in a future release.
 */
export type CoreMessage = ChatMessage;

/**
 * Tool definition compatible with Anthropic's tool schema
 */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: any) => Promise<any>;
}

/**
 * Options for creating an Anthropic tool
 */
export interface CreateToolOptions<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | any;
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Creates an Anthropic-compatible tool definition
 *
 * Replacement for AI SDK's `tool()` function. Returns a tool definition
 * that can be used with AnthropicChatService.
 *
 * @param options - Tool configuration including name, description, schema, and executor
 * @returns Tool definition compatible with Anthropic Messages API
 *
 * @example
 * const weatherTool = createTool({
 *   name: "get_weather",
 *   description: "Get weather for a location",
 *   inputSchema: z.object({ city: z.string() }),
 *   execute: async ({ city }) => {
 *     return { temp: 72, city };
 *   }
 * });
 */
export function createTool<TInput = any, TOutput = any>(
  options: CreateToolOptions<TInput, TOutput>
): AnthropicToolDefinition {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    execute: options.execute,
  };
}

/**
 * Type guard to check if a message is a tool message
 */
export function isToolMessage(message: CoreMessage): message is CoreMessage & { toolUseId: string } {
  return message.role === "tool" && Boolean(message.toolUseId);
}

/**
 * Helper to format tool result for Anthropic Messages API
 */
export function formatToolResult(toolUseId: string, output: any): CoreMessage {
  return {
    role: "tool",
    content: typeof output === "string" ? output : JSON.stringify(output),
    toolUseId,
  };
}
