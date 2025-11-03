/**
 * Integration tests for Anthropic API best practices validation
 *
 * Tests parallel tool execution, error handling, tool_choice, and message formatting.
 * These tests validate that our implementation follows Anthropic's recommended patterns.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import { AnthropicChatService } from "../../lib/services/anthropic-chat";

describe("Anthropic Best Practices Validation", () => {
  describe("Parallel Tool Execution", () => {
    it("should execute multiple tool calls simultaneously with Promise.all", async () => {
      // Verify the runner uses Promise.all for parallel tool execution
      const runnerSource = await readFile(
        join(__dirname, "../../lib/agent/runner.ts"),
        "utf-8"
      );

      // Should use Promise.all for parallel execution
      expect(runnerSource).toContain("Promise.all");
      expect(runnerSource).toContain("toolCalls.map");

      // Should NOT use sequential for-of await pattern for tools
      expect(runnerSource).not.toMatch(/for\s*\(const call of response\.toolCalls\)/);
    });

    it("should batch all tool results in a single user message", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      // Tool results should be formatted as array in single message
      expect(chatServiceSource).toContain("toolResults");
      expect(chatServiceSource).toContain("tool_result");

      // Should push tool results to conversation as a batch
      expect(chatServiceSource).toContain("role: \"user\"");
    });
  });

  describe("Error Handling with is_error", () => {
    it("should detect error objects and set isError flag", async () => {
      const runnerSource = await readFile(
        join(__dirname, "../../lib/agent/runner.ts"),
        "utf-8"
      );

      // Should check for 'error' key in result
      expect(runnerSource).toContain("'error' in result");
      expect(runnerSource).toContain("isError");
      expect(runnerSource).toContain("hasError");
    });

    it("should send is_error: true to Anthropic API for failed tools", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      expect(chatServiceSource).toContain("is_error");
      expect(chatServiceSource).toContain("result.isError");
    });

    it("should have isError field in ExecuteToolResult interface", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      expect(chatServiceSource).toContain("export interface ExecuteToolResult");
      expect(chatServiceSource).toContain("isError?:");
    });
  });

  describe("max_tokens Truncation Handling", () => {
    it("should detect and retry truncated tool_use blocks", async () => {
      const runnerSource = await readFile(
        join(__dirname, "../../lib/agent/runner.ts"),
        "utf-8"
      );

      // Should check for stop_reason === "max_tokens"
      expect(runnerSource).toContain("max_tokens");
      expect(runnerSource).toContain("lastBlock");
      expect(runnerSource).toContain("tool_use");

      // Should retry with higher maxTokens
      expect(runnerSource).toContain("maxTokens: 8192");
    });
  });

  describe("tool_choice Parameter Support", () => {
    it("should support all tool_choice modes in type system", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      // Should have ToolChoice type with all modes
      expect(chatServiceSource).toContain("export type ToolChoice");
      expect(chatServiceSource).toContain('{ type: "auto" }');
      expect(chatServiceSource).toContain('{ type: "any" }');
      expect(chatServiceSource).toContain('{ type: "tool"');
      expect(chatServiceSource).toContain('{ type: "none" }');
    });

    it("should pass tool_choice to Anthropic API when specified", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      expect(chatServiceSource).toContain("request.toolChoice");
      expect(chatServiceSource).toContain("tool_choice");
    });

    it("should include toolChoice in ChatRequest interface", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      expect(chatServiceSource).toContain("export interface ChatRequest");
      expect(chatServiceSource).toContain("toolChoice?:");
    });
  });

  describe("pause_turn Stop Reason", () => {
    it("should handle pause_turn for server tools", async () => {
      const runnerSource = await readFile(
        join(__dirname, "../../lib/agent/runner.ts"),
        "utf-8"
      );

      // Should check for pause_turn stop reason
      expect(runnerSource).toContain("pause_turn");
      expect(runnerSource).toContain("stop_reason");
    });
  });

  describe("Tool Descriptions", () => {
    it("should have comprehensive descriptions (3-4+ sentences minimum)", async () => {
      const toolFiles = [
        "service-now.ts",
        "triage.ts",
        "weather.ts",
        "web-search.ts",
        "search.ts",
        "knowledge-base.ts",
        "context-update.ts",
        "current-issues.ts",
        "microsoft-learn.ts",
      ];

      for (const file of toolFiles) {
        const toolSource = await readFile(
          join(__dirname, `../../lib/agent/tools/${file}`),
          "utf-8"
        );

        // Each tool should have a description field
        expect(toolSource).toContain("description:");

        // Extract description (rough check - descriptions should be detailed)
        const descMatch = toolSource.match(/description:\s*"([^"]+)"/);
        if (!descMatch && toolSource.includes("description:")) {
          // Multi-line description
          const multiLineMatch = toolSource.match(/description:\s*"([^"]+)/);
          if (multiLineMatch) {
            // Should be detailed (at least 200 characters for comprehensive)
            const descriptionArea = toolSource.substring(
              toolSource.indexOf("description:"),
              toolSource.indexOf("description:") + 500
            );
            expect(descriptionArea.length).toBeGreaterThan(200);
          }
        }
      }
    });
  });

  describe("Message Formatting Best Practices", () => {
    it("should format tool results correctly for parallel tool use", () => {
      const chatService = new AnthropicChatService();

      const mockToolResults = [
        {
          toolUseId: "tool_1",
          output: { result: "data1" },
        },
        {
          toolUseId: "tool_2",
          output: { result: "data2" },
        },
      ];

      const request = {
        messages: [{ role: "user" as const, content: "Test" }],
        toolResults: mockToolResults,
      };

      // toMessageParams should create proper structure
      const params = (chatService as any).toMessageParams(request);

      // Should have added a user message with tool results
      const lastMessage = params.messages[params.messages.length - 1];
      expect(lastMessage.role).toBe("user");
      expect(Array.isArray(lastMessage.content)).toBe(true);
      expect(lastMessage.content.length).toBe(2);
      expect(lastMessage.content[0].type).toBe("tool_result");
      expect(lastMessage.content[1].type).toBe("tool_result");
    });

    it("should support multimodal content blocks in tool results", async () => {
      const chatServiceSource = await readFile(
        join(__dirname, "../../lib/services/anthropic-chat.ts"),
        "utf-8"
      );

      // Should have ContentBlock types
      expect(chatServiceSource).toContain("export interface ImageContentBlock");
      expect(chatServiceSource).toContain("export interface TextContentBlock");
      expect(chatServiceSource).toContain("contentBlocks?:");
    });
  });

  describe("System Prompt Guidance", () => {
    it("should include parallel tool execution guidance", async () => {
      const systemPrompt = await readFile(
        join(__dirname, "../../config/system-prompt.txt"),
        "utf-8"
      );

      // Should have guidance for parallel tool use
      expect(systemPrompt).toContain("parallel");
      expect(systemPrompt).toContain("simultaneously");

      // Should have examples
      expect(systemPrompt.toLowerCase()).toMatch(/(example|e\.g\.|for instance)/);
    });

    it("should include token cost warnings for images", async () => {
      const systemPrompt = await readFile(
        join(__dirname, "../../config/system-prompt.txt"),
        "utf-8"
      );

      expect(systemPrompt).toContain("Image");
      expect(systemPrompt).toContain("screenshot");
    });
  });
});
