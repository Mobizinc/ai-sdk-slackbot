/**
 * Comprehensive Unit Tests for Agent Runner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAgent } from "../../lib/agent/runner";
import { AnthropicChatService } from "../../lib/services/anthropic-chat";
import { getToolRegistry } from "../../lib/agent/tool-registry";

vi.mock("../../lib/services/anthropic-chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/services/anthropic-chat")>();
  return {
    ...actual,
    AnthropicChatService: {
      ...actual.AnthropicChatService,
      getInstance: vi.fn(),
    },
  };
});

vi.mock("../../lib/agent/tool-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/agent/tool-registry")>();
  return {
    ...actual,
    getToolRegistry: vi.fn(),
  };
});

describe("Agent Runner", () => {
  const mockSend = vi.fn();
  const mockTool = {
    description: "Test tool",
    inputSchema: {},
    execute: vi.fn(),
  };

  beforeEach(() => {
    (AnthropicChatService.getInstance as unknown as vi.Mock).mockReturnValue({
      send: mockSend,
    });
    (getToolRegistry as unknown as vi.Mock).mockReturnValue({
      createTools: vi.fn().mockReturnValue({ testTool: mockTool }),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Basic Text Responses", () => {
    it("returns text response when no tool calls", async () => {
      mockSend.mockResolvedValue({
        outputText: "Hello from Anthropic",
        message: { content: [] },
        toolCalls: [],
      });

      const result = await runAgent({
        messages: [{ role: "user", content: "Hi" }],
        caseNumbers: ["SCS123"],
      });

      expect(result).toBe("Hello from Anthropic");
      expect(mockSend).toHaveBeenCalledTimes(1);
      const registry = (getToolRegistry as unknown as vi.Mock).mock.results[0]
        .value;
      expect(registry.createTools).toHaveBeenCalledWith(
        expect.objectContaining({ caseNumbers: ["SCS123"] }),
      );
    });

    it("extracts text from message content blocks when outputText is missing", async () => {
      mockSend.mockResolvedValue({
        outputText: undefined,
        message: {
          content: [
            { type: "text", text: "First block" },
            { type: "text", text: "Second block" },
          ],
        },
        toolCalls: [],
      });

      const result = await runAgent({
        messages: [{ role: "user", content: "Hi" }],
        caseNumbers: [],
      });

      // The implementation joins with single newline, not double
      expect(result).toBe("First block\nSecond block");
    });

    it("throws error when no text output is available", async () => {
      mockSend.mockResolvedValue({
        outputText: undefined,
        message: { content: [] },
        toolCalls: [],
      });

      await expect(
        runAgent({
          messages: [{ role: "user", content: "Hi" }],
          caseNumbers: [],
        })
      ).rejects.toThrow("Anthropic response did not include text output");
    });
  });

  describe("Tool Execution", () => {
    it("executes tool call and returns final response", async () => {
      mockTool.execute.mockResolvedValue({ result: "done" });

      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [
            {
              id: "tool_1",
              name: "testTool",
              input: { query: "status" },
            },
          ],
        })
        .mockResolvedValueOnce({
          outputText: "Completed",
          message: { content: [] },
          toolCalls: [],
        });

      const result = await runAgent({
        messages: [{ role: "user", content: "Run tool" }],
        caseNumbers: ["SCS000"],
      });

      expect(mockTool.execute).toHaveBeenCalledWith({ query: "status" });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result).toBe("Completed");
    });

    it("executes multiple tool calls in sequence", async () => {
      const tool1 = {
        description: "Tool 1",
        inputSchema: {},
        execute: vi.fn().mockResolvedValue({ result: "tool1 result" }),
      };
      const tool2 = {
        description: "Tool 2",
        inputSchema: {},
        execute: vi.fn().mockResolvedValue({ result: "tool2 result" }),
      };

      (getToolRegistry as unknown as vi.Mock).mockReturnValue({
        createTools: vi.fn().mockReturnValue({ tool1, tool2 }),
      });

      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [
            { id: "call_1", name: "tool1", input: {} },
            { id: "call_2", name: "tool2", input: {} },
          ],
        })
        .mockResolvedValueOnce({
          outputText: "Both tools completed",
          message: { content: [] },
          toolCalls: [],
        });

      const result = await runAgent({
        messages: [{ role: "user", content: "Run tools" }],
        caseNumbers: [],
      });

      expect(tool1.execute).toHaveBeenCalled();
      expect(tool2.execute).toHaveBeenCalled();
      expect(result).toBe("Both tools completed");
    });

    it("handles unknown tool gracefully", async () => {
      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [
            { id: "call_1", name: "unknownTool", input: {} },
          ],
        })
        .mockResolvedValueOnce({
          outputText: "Handled unknown tool",
          message: { content: [] },
          toolCalls: [],
        });

      const result = await runAgent({
        messages: [{ role: "user", content: "Use unknown tool" }],
        caseNumbers: [],
      });

      expect(result).toBe("Handled unknown tool");
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("handles tool execution errors gracefully", async () => {
      mockTool.execute.mockRejectedValue(new Error("Tool failure"));

      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [
            {
              id: "tool_1",
              name: "testTool",
              input: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          outputText: "All set",
          message: { content: [] },
          toolCalls: [],
        });

      const result = await runAgent({
        messages: [{ role: "user", content: "Try tool" }],
        caseNumbers: ["SCS999"],
      });

      expect(mockTool.execute).toHaveBeenCalled();
      expect(result).toBe("All set");
    });
  });

  describe("Status Updates", () => {
    it("calls updateStatus with 'thinking' at start", async () => {
      const updateStatus = vi.fn();
      mockSend.mockResolvedValue({
        outputText: "Response",
        message: { content: [] },
        toolCalls: [],
      });

      await runAgent({
        messages: [{ role: "user", content: "Hi" }],
        caseNumbers: [],
        updateStatus,
      });

      expect(updateStatus).toHaveBeenCalledWith("thinking");
    });

    it("calls updateStatus with 'calling-tool' when tools are invoked", async () => {
      const updateStatus = vi.fn();
      mockTool.execute.mockResolvedValue({ result: "done" });

      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [{ id: "call_1", name: "testTool", input: {} }],
        })
        .mockResolvedValueOnce({
          outputText: "Done",
          message: { content: [] },
          toolCalls: [],
        });

      await runAgent({
        messages: [{ role: "user", content: "Run tool" }],
        caseNumbers: [],
        updateStatus,
      });

      expect(updateStatus).toHaveBeenCalledWith("calling-tool");
    });

    it("calls updateStatus with 'complete' at end", async () => {
      const updateStatus = vi.fn();
      mockSend.mockResolvedValue({
        outputText: "Response",
        message: { content: [] },
        toolCalls: [],
      });

      await runAgent({
        messages: [{ role: "user", content: "Hi" }],
        caseNumbers: [],
        updateStatus,
      });

      expect(updateStatus).toHaveBeenLastCalledWith("complete");
    });

    it("handles missing updateStatus gracefully", async () => {
      mockSend.mockResolvedValue({
        outputText: "Response",
        message: { content: [] },
        toolCalls: [],
      });

      const result = await runAgent({
        messages: [{ role: "user", content: "Hi" }],
        caseNumbers: [],
      });

      expect(result).toBe("Response");
    });
  });

  describe("Iteration Limits", () => {
    it("throws if tool iterations exceed max (6 steps)", async () => {
      mockSend.mockResolvedValue({
        message: { content: [] },
        toolCalls: [
          { id: "tool_1", name: "testTool", input: {} },
        ],
      });

      await expect(
        runAgent({ messages: [{ role: "user", content: "Loop" }], caseNumbers: [] }),
      ).rejects.toThrow("Exceeded maximum tool iterations.");

      expect(mockSend).toHaveBeenCalledTimes(6);
    });

    it("completes successfully within iteration limit", async () => {
      mockTool.execute.mockResolvedValue({ result: "done" });

      // 3 tool iterations, then final response
      mockSend
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [{ id: "1", name: "testTool", input: {} }],
        })
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [{ id: "2", name: "testTool", input: {} }],
        })
        .mockResolvedValueOnce({
          message: { content: [] },
          toolCalls: [{ id: "3", name: "testTool", input: {} }],
        })
        .mockResolvedValueOnce({
          outputText: "Finally done",
          message: { content: [] },
          toolCalls: [],
        });

      const result = await runAgent({
        messages: [{ role: "user", content: "Multi-step task" }],
        caseNumbers: [],
      });

      expect(result).toBe("Finally done");
      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });

  describe("Message and Tool Context", () => {
    it("passes all parameters to tool registry createTools", async () => {
      const messages = [{ role: "user", content: "Test" }];
      const caseNumbers = ["SCS123", "SCS456"];
      const updateStatus = vi.fn();
      const options = { channelId: "C123" };

      mockSend.mockResolvedValue({
        outputText: "Response",
        message: { content: [] },
        toolCalls: [],
      });

      await runAgent({
        messages,
        caseNumbers,
        updateStatus,
        options,
      });

      const registry = (getToolRegistry as unknown as vi.Mock).mock.results[0].value;
      expect(registry.createTools).toHaveBeenCalledWith({
        caseNumbers,
        messages,
        updateStatus,
        options,
      });
    });

    it("handles system messages in conversation", async () => {
      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ];

      mockSend.mockResolvedValue({
        outputText: "Response",
        message: { content: [] },
        toolCalls: [],
      });

      await runAgent({
        messages,
        caseNumbers: [],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "system" }),
            expect.objectContaining({ role: "user" }),
          ]),
        })
      );
    });
  });
});
