/**
 * Unit tests for runner multimodal content block handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runAgent } from "../../lib/agent/runner";
import type { CoreMessage } from "../../lib/agent/types";

// Mock dependencies
vi.mock("../../lib/services/anthropic-chat");
vi.mock("../../lib/agent/tool-registry");
vi.mock("../../lib/observability");

import { AnthropicChatService } from "../../lib/services/anthropic-chat";
import { getToolRegistry } from "../../lib/agent/tool-registry";

describe("Agent Runner - Multimodal Content Blocks", () => {
  let mockChatService: any;
  let mockToolRegistry: any;

  beforeEach(() => {
    // Mock AnthropicChatService
    mockChatService = {
      send: vi.fn(),
    };
    vi.mocked(AnthropicChatService.getInstance).mockReturnValue(mockChatService);

    // Mock Tool Registry
    mockToolRegistry = {
      createTools: vi.fn(),
    };
    vi.mocked(getToolRegistry).mockReturnValue(mockToolRegistry);

    // Mock observability
    vi.mock("../../lib/observability", () => ({
      withLangSmithTrace: (fn: any) => fn,
      createChildSpan: vi.fn().mockResolvedValue({
        end: vi.fn().mockResolvedValue(undefined),
      }),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Content Block Handling from Tools", () => {
    it("should convert _attachmentBlocks to contentBlocks in ExecuteToolResult", async () => {
      // Tool returns _attachmentBlocks
      const mockTool = {
        execute: vi.fn().mockResolvedValue({
          case: { number: "SCS001" },
          _attachmentBlocks: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "screenshot==",
              },
            },
          ],
          _attachmentCount: 1,
        }),
        name: "servicenow_action",
        description: "ServiceNow tool",
        inputSchema: {},
      };

      mockToolRegistry.createTools.mockReturnValue({
        servicenow_action: mockTool,
      });

      // First call: Claude requests tool
      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "servicenow_action",
              input: { action: "getCase", number: "SCS001" },
            },
          ],
          stop_reason: "tool_use",
        },
        toolCalls: [
          {
            id: "tool_1",
            name: "servicenow_action",
            input: { action: "getCase", number: "SCS001" },
          },
        ],
        outputText: undefined,
      });

      // Second call: Claude processes tool result
      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: "Case retrieved with screenshot" }],
          stop_reason: "end_turn",
        },
        toolCalls: [],
        outputText: "Case retrieved with screenshot",
      });

      const messages: CoreMessage[] = [
        { role: "user", content: "Get case SCS001 with screenshots" },
      ];

      const result = await runAgent({ messages });

      expect(result).toBe("Case retrieved with screenshot");

      // Verify tool was executed
      expect(mockTool.execute).toHaveBeenCalled();

      // Verify second send call received contentBlocks
      const secondSendCall = mockChatService.send.mock.calls[1][0];
      expect(secondSendCall.toolResults).toHaveLength(1);
      expect(secondSendCall.toolResults[0].contentBlocks).toBeDefined();
      expect(secondSendCall.toolResults[0].contentBlocks).toHaveLength(2); // Text + image
      expect(secondSendCall.toolResults[0].contentBlocks[0].type).toBe("text");
      expect(secondSendCall.toolResults[0].contentBlocks[1].type).toBe("image");
    });

    it("should handle tools without _attachmentBlocks (backward compatibility)", async () => {
      const mockTool = {
        execute: vi.fn().mockResolvedValue({
          temperature: 72,
          condition: "sunny",
        }),
        name: "get_weather",
        description: "Weather tool",
        inputSchema: {},
      };

      mockToolRegistry.createTools.mockReturnValue({
        get_weather: mockTool,
      });

      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "get_weather",
              input: { city: "SF" },
            },
          ],
          stop_reason: "tool_use",
        },
        toolCalls: [{ id: "tool_1", name: "get_weather", input: { city: "SF" } }],
        outputText: undefined,
      });

      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: "Weather is sunny" }],
          stop_reason: "end_turn",
        },
        toolCalls: [],
        outputText: "Weather is sunny",
      });

      const messages: CoreMessage[] = [{ role: "user", content: "Get weather" }];

      const result = await runAgent({ messages });

      expect(result).toBe("Weather is sunny");

      // Verify tool result does NOT have contentBlocks
      const secondSendCall = mockChatService.send.mock.calls[1][0];
      expect(secondSendCall.toolResults[0].contentBlocks).toBeUndefined();
    });

    it("should handle parallel tools with mixed attachments", async () => {
      const toolWithAttachments = {
        execute: vi.fn().mockResolvedValue({
          case: "SCS001",
          _attachmentBlocks: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "img==" } }],
          _attachmentCount: 1,
        }),
        name: "servicenow_action",
        description: "SN",
        inputSchema: {},
      };

      const toolWithoutAttachments = {
        execute: vi.fn().mockResolvedValue({
          weather: "sunny",
        }),
        name: "get_weather",
        description: "Weather",
        inputSchema: {},
      };

      mockToolRegistry.createTools.mockReturnValue({
        servicenow_action: toolWithAttachments,
        get_weather: toolWithoutAttachments,
      });

      // Claude calls both tools in parallel
      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [
            { type: "tool_use", id: "tool_1", name: "servicenow_action", input: {} },
            { type: "tool_use", id: "tool_2", name: "get_weather", input: {} },
          ],
          stop_reason: "tool_use",
        },
        toolCalls: [
          { id: "tool_1", name: "servicenow_action", input: {} },
          { id: "tool_2", name: "get_weather", input: {} },
        ],
        outputText: undefined,
      });

      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: "Both tools complete" }],
          stop_reason: "end_turn",
        },
        toolCalls: [],
        outputText: "Both tools complete",
      });

      const messages: CoreMessage[] = [{ role: "user", content: "Get both" }];

      const result = await runAgent({ messages });

      expect(result).toBe("Both tools complete");

      // Verify both tools executed in parallel
      expect(toolWithAttachments.execute).toHaveBeenCalled();
      expect(toolWithoutAttachments.execute).toHaveBeenCalled();

      // Verify tool results: one with contentBlocks, one without
      const secondSendCall = mockChatService.send.mock.calls[1][0];
      expect(secondSendCall.toolResults).toHaveLength(2);

      const resultsWithBlocks = secondSendCall.toolResults.filter((r: any) => r.contentBlocks);
      const resultsWithoutBlocks = secondSendCall.toolResults.filter((r: any) => !r.contentBlocks);

      expect(resultsWithBlocks).toHaveLength(1);
      expect(resultsWithoutBlocks).toHaveLength(1);
    });

    it("should strip _attachmentBlocks from output while adding to contentBlocks", async () => {
      const mockTool = {
        execute: vi.fn().mockResolvedValue({
          case: { number: "SCS001", priority: "High" },
          _attachmentBlocks: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "img==" } }],
          _attachmentCount: 1,
        }),
        name: "servicenow_action",
        description: "SN",
        inputSchema: {},
      };

      mockToolRegistry.createTools.mockReturnValue({
        servicenow_action: mockTool,
      });

      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [{ type: "tool_use", id: "tool_1", name: "servicenow_action", input: {} }],
          stop_reason: "tool_use",
        },
        toolCalls: [{ id: "tool_1", name: "servicenow_action", input: {} }],
        outputText: undefined,
      });

      mockChatService.send.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: "Done" }],
          stop_reason: "end_turn",
        },
        toolCalls: [],
        outputText: "Done",
      });

      const messages: CoreMessage[] = [{ role: "user", content: "Get case" }];

      await runAgent({ messages });

      const secondSendCall = mockChatService.send.mock.calls[1][0];
      const toolResult = secondSendCall.toolResults[0];

      // output should NOT contain _attachmentBlocks or _attachmentCount
      expect(toolResult.output._attachmentBlocks).toBeUndefined();
      expect(toolResult.output._attachmentCount).toBeUndefined();

      // But should have case data
      expect(toolResult.output.case).toEqual({ number: "SCS001", priority: "High" });

      // contentBlocks should have text (from cleaned output) + image
      expect(toolResult.contentBlocks).toHaveLength(2);
      expect(toolResult.contentBlocks[0].type).toBe("text");
      expect(toolResult.contentBlocks[1].type).toBe("image");
    });
  });
});
