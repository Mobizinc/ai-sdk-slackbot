/**
 * Unit tests for multimodal content block support in AnthropicChatService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AnthropicChatService, type ExecuteToolResult, type ChatRequest } from "../../lib/services/anthropic-chat";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

// Mock the Anthropic client
vi.mock("../../lib/anthropic-provider", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(),
    },
  }),
  getConfiguredModel: () => "claude-sonnet-4-5",
}));

describe("AnthropicChatService - Multimodal Content Blocks", () => {
  let chatService: AnthropicChatService;
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chatService = new AnthropicChatService();
    mockCreate = vi.fn();
    (chatService as any).client = {
      messages: {
        create: mockCreate,
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Tool Result Formatting with Content Blocks", () => {
    it("should format tool result with contentBlocks as array", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_123",
          output: { case: { number: "SCS001" } },
          contentBlocks: [
            { type: "text", text: JSON.stringify({ case: { number: "SCS001" } }) },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "base64encodeddata==",
              },
            },
          ],
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Get case SCS001" }],
        toolResults,
      };

      await chatService.send(request);

      // Verify the API was called with content blocks array
      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      expect(lastUserMessage.content).toHaveLength(1);
      expect(lastUserMessage.content[0].type).toBe("tool_result");
      expect(lastUserMessage.content[0].tool_use_id).toBe("tool_123");
      expect(Array.isArray(lastUserMessage.content[0].content)).toBe(true);
      expect(lastUserMessage.content[0].content).toHaveLength(2);
      expect(lastUserMessage.content[0].content[0].type).toBe("text");
      expect(lastUserMessage.content[0].content[1].type).toBe("image");
    });

    it("should handle legacy string output (backward compatibility)", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_456",
          output: { temperature: 72, city: "San Francisco" },
          // NO contentBlocks - should use legacy string formatting
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Get weather" }],
        toolResults,
      };

      await chatService.send(request);

      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      expect(lastUserMessage.content[0].type).toBe("tool_result");
      expect(typeof lastUserMessage.content[0].content).toBe("string");
      expect(lastUserMessage.content[0].content).toContain("San Francisco");
    });

    it("should include is_error flag when tool result has isError: true", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Error handled" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_789",
          output: { error: "ServiceNow unavailable" },
          isError: true,
          contentBlocks: [
            {
              type: "text",
              text: "ServiceNow unavailable",
            },
          ],
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Get case" }],
        toolResults,
      };

      await chatService.send(request);

      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      expect(lastUserMessage.content[0].is_error).toBe(true);
    });

    it("should handle multiple tool results with mixed content (some with blocks, some without)", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_1",
          output: { case: "SCS001" },
          contentBlocks: [
            { type: "text", text: "Case data" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "screenshot1==",
              },
            },
          ],
        },
        {
          toolUseId: "tool_2",
          output: { weather: "sunny" },
          // No contentBlocks - legacy string
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Multi-tool request" }],
        toolResults,
      };

      await chatService.send(request);

      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      // Should have 2 tool results
      expect(lastUserMessage.content).toHaveLength(2);

      // First result should have content blocks
      expect(Array.isArray(lastUserMessage.content[0].content)).toBe(true);

      // Second result should have string content
      expect(typeof lastUserMessage.content[1].content).toBe("string");
    });

    it("should handle empty contentBlocks array", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_1",
          output: { data: "some data" },
          contentBlocks: [], // Empty array
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Test" }],
        toolResults,
      };

      await chatService.send(request);

      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      // Should fall back to legacy string format
      expect(typeof lastUserMessage.content[0].content).toBe("string");
    });
  });

  describe("Backward Compatibility", () => {
    it("should work with tools that never use contentBlocks", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Weather retrieved" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "weather_1",
          output: { temperature: 72, condition: "sunny" },
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Get weather" }],
        toolResults,
      };

      const response = await chatService.send(request);

      expect(response.outputText).toBe("Weather retrieved");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should handle null/undefined output gracefully", async () => {
      const mockResponse: Message = {
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const toolResults: ExecuteToolResult[] = [
        {
          toolUseId: "tool_1",
          output: null,
        },
        {
          toolUseId: "tool_2",
          output: undefined,
        },
      ];

      const request: ChatRequest = {
        messages: [{ role: "user", content: "Test" }],
        toolResults,
      };

      await chatService.send(request);

      const apiCall = mockCreate.mock.calls[0][0];
      const userMessages = apiCall.messages.filter((m: any) => m.role === "user");
      const lastUserMessage = userMessages[userMessages.length - 1];

      expect(lastUserMessage.content[0].content).toBe("");
      expect(lastUserMessage.content[1].content).toBe("");
    });
  });
});
