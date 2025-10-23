/**
 * Integration Tests for generate-response.ts
 *
 * These tests establish a baseline for the refactor. They verify:
 * 1. The main export (generateResponse) works correctly
 * 2. Test injection points (__setGenerateTextImpl, __resetGenerateTextImpl) work
 * 3. Common scenarios (with tools, without tools, error handling) are covered
 *
 * During the refactor, these tests MUST continue passing to ensure no regressions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateResponse,
  __setGenerateTextImpl,
  __resetGenerateTextImpl,
} from "../lib/generate-response";
import {
  __resetFeatureFlags,
  __setFeatureFlags,
} from "../lib/config/feature-flags";
import { __setToolRegistry } from "../lib/agent/tool-registry";
import type { CoreMessage } from "ai";

const loadContextMock = vi.fn();
const buildPromptMock = vi.fn();
const runAgentMock = vi.fn();
const formatMessageMock = vi.fn();

vi.mock("../lib/agent/context-loader", () => ({
  loadContext: (...args: unknown[]) => loadContextMock(...args),
}));

vi.mock("../lib/agent/prompt-builder", () => ({
  buildPrompt: (...args: unknown[]) => buildPromptMock(...args),
}));

vi.mock("../lib/agent/runner", () => ({
  runAgent: (...args: unknown[]) => runAgentMock(...args),
}));

vi.mock("../lib/agent/message-formatter", () => ({
  formatMessage: (...args: unknown[]) => formatMessageMock(...args),
}));

function setMockLLMResponse(mockText: string) {
  __setGenerateTextImpl(async () => ({
    text: mockText,
    toolCalls: [],
    toolResults: [],
    usage: { promptTokens: 10, completionTokens: 20 },
  }));

  runAgentMock.mockImplementation(async ({ updateStatus }: any) => {
    updateStatus?.("thinking");
    updateStatus?.("complete");
    return mockText;
  });

  formatMessageMock.mockImplementation(({ text }: { text: string }) => text);
}

function setMockLLMError(error: Error) {
  __setGenerateTextImpl(async () => {
    throw error;
  });

  runAgentMock.mockImplementation(async () => {
    throw error;
  });
}

function describeWithBothModes(name: string, fn: () => void) {
  describe(`${name} [Legacy Mode]`, () => {
    beforeEach(() => {
      __setFeatureFlags({ refactorEnabled: false });
    });
    fn();
  });

  describe(`${name} [Refactored Mode]`, () => {
    beforeEach(() => {
      __setFeatureFlags({ refactorEnabled: true });
    });
    fn();
  });
}

describe("generateResponse - Integration Tests", () => {
  beforeEach(() => {
    __resetGenerateTextImpl();
    __resetFeatureFlags();
    __setToolRegistry(null);

    loadContextMock.mockReset();
    buildPromptMock.mockReset();
    runAgentMock.mockReset();
    formatMessageMock.mockReset();

    loadContextMock.mockImplementation(async (input: any) => ({
      messages: input.messages,
      metadata: {},
    }));

    buildPromptMock.mockImplementation(async ({ context }: any) => ({
      systemPrompt: "Mock system prompt",
      conversation: context.messages,
    }));

    formatMessageMock.mockImplementation(({ text }: { text: string }) => text);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetFeatureFlags();
    __setToolRegistry(null);
  });

  describeWithBothModes("Basic Functionality", () => {
    it("should generate a response with a simple message", async () => {
      setMockLLMResponse("Response to simple message");

      const messages: CoreMessage[] = [
        { role: "user", content: "Hello, how are you?" },
      ];

      const response = await generateResponse(messages);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    it("should handle empty message array gracefully", async () => {
      setMockLLMResponse("I'm here to help!");

      const messages: CoreMessage[] = [];

      const response = await generateResponse(messages);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should preserve updateStatus callback functionality", async () => {
      const statusUpdates: string[] = [];
      const mockUpdateStatus = vi.fn((status: string) => {
        statusUpdates.push(status);
      });

      setMockLLMResponse("Test response");

      const messages: CoreMessage[] = [
        { role: "user", content: "Test message" },
      ];

      await generateResponse(messages, mockUpdateStatus);

      expect(mockUpdateStatus).toHaveBeenCalled();
      expect(statusUpdates.length).toBeGreaterThan(0);
    });
  });

  describeWithBothModes("Options Handling", () => {
    it("should accept channelId option", async () => {
      setMockLLMResponse("Response with channel context");

      const messages: CoreMessage[] = [
        { role: "user", content: "What channel am I in?" },
      ];

      const response = await generateResponse(messages, undefined, {
        channelId: "C123456",
      });

      expect(response).toBeDefined();
    });

    it("should accept all options together", async () => {
      setMockLLMResponse("Response with full context");

      const messages: CoreMessage[] = [
        { role: "user", content: "Test with full options" },
      ];

      const response = await generateResponse(messages, undefined, {
        channelId: "C123456",
        channelName: "general",
        threadTs: "1234567890.123456",
      });

      expect(response).toBeDefined();
    });
  });

  describeWithBothModes("Test Injection Points", () => {
    it("should allow mocking generateText implementation", async () => {
      const mockText = "Mocked response for testing";
      setMockLLMResponse(mockText);

      const messages: CoreMessage[] = [
        { role: "user", content: "Doesn't matter what this says" },
      ];

      const response = await generateResponse(messages);

      expect(response).toContain(mockText);
    });

    it("should reset to default implementation when __resetGenerateTextImpl is called", async () => {
      setMockLLMResponse("Mock A");

      let response1 = await generateResponse([
        { role: "user", content: "Test 1" },
      ]);
      expect(response1).toContain("Mock A");

      __resetGenerateTextImpl();
      setMockLLMResponse("Mock B");
      let response2 = await generateResponse([
        { role: "user", content: "Test 2" },
      ]);
      expect(response2).toContain("Mock B");
      expect(response2).not.toContain("Mock A");
    });
  });

  describeWithBothModes("Edge Cases", () => {
    it("should handle multi-turn conversations", async () => {
      setMockLLMResponse("Multi-turn response");

      const messages: CoreMessage[] = [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" },
        { role: "assistant", content: "Second response" },
        { role: "user", content: "Third message" },
      ];

      const response = await generateResponse(messages);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle empty response from LLM (edge case)", async () => {
      const fallback = "Fallback greeting";
      __setGenerateTextImpl(async () => ({
        text: fallback,
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 0 },
      }));
      runAgentMock.mockImplementation(async () => {
        throw new Error("Empty response");
      });
      formatMessageMock.mockImplementation(({ text }: { text: string }) => text);

      const messages: CoreMessage[] = [
        { role: "user", content: "This might return empty" },
      ];

      const response = await generateResponse(messages);

      expect(response).toContain("Fallback");
    });

    it("should handle very long message history", async () => {
      setMockLLMResponse("Handled long history");

      const messages: CoreMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i + 1}: Lorem ipsum dolor sit amet`,
        });
      }

      const response = await generateResponse(messages);

      expect(response).toBeDefined();
    });
  });

  describeWithBothModes("Error Handling", () => {
    it("should handle errors from generateText gracefully", async () => {
      const error = new Error("Simulated LLM error");
      setMockLLMError(error);

      const messages: CoreMessage[] = [
        { role: "user", content: "This will cause an error" },
      ];

      await expect(async () => {
        await generateResponse(messages);
      }).rejects.toThrow();
    });

    it("should handle updateStatus callback errors without failing", async () => {
      const failingCallback = vi.fn(() => {
        throw new Error("Callback error");
      });

      setMockLLMResponse("Response despite callback error");

      const messages: CoreMessage[] = [
        { role: "user", content: "Test with failing callback" },
      ];

      const response = await generateResponse(messages, failingCallback);

      expect(response).toBeDefined();
      expect(failingCallback).toHaveBeenCalled();
    });
  });
});
