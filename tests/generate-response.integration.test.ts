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
import type { CoreMessage } from "ai";

describe("generateResponse - Integration Tests", () => {
  beforeEach(() => {
    // Reset any test mocks before each test
    __resetGenerateTextImpl();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Functionality", () => {
    it("should generate a response with a simple message", async () => {
      // Mock the generateText implementation
      __setGenerateTextImpl(async ({ prompt }) => ({
        text: `Response to: ${prompt}`,
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 20 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "Hello, how are you?" },
      ];

      const response = await generateResponse(messages);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    });

    it("should handle empty message array gracefully", async () => {
      __setGenerateTextImpl(async () => ({
        text: "I'm here to help!",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 5, completionTokens: 10 },
      }));

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

      __setGenerateTextImpl(async () => ({
        text: "Test response",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 15 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "Test message" },
      ];

      await generateResponse(messages, mockUpdateStatus);

      // Verify updateStatus was called at least once
      expect(mockUpdateStatus).toHaveBeenCalled();
      expect(statusUpdates.length).toBeGreaterThan(0);
    });
  });

  describe("Options Handling", () => {
    it("should accept channelId option", async () => {
      __setGenerateTextImpl(async () => ({
        text: "Response with channel context",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 20 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "What channel am I in?" },
      ];

      const response = await generateResponse(messages, undefined, {
        channelId: "C123456",
      });

      expect(response).toBeDefined();
    });

    it("should accept all options together", async () => {
      __setGenerateTextImpl(async () => ({
        text: "Response with full context",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 15, completionTokens: 25 },
      }));

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

  describe("Test Injection Points", () => {
    it("should allow mocking generateText implementation", async () => {
      const mockText = "Mocked response for testing";
      __setGenerateTextImpl(async () => ({
        text: mockText,
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 5, completionTokens: 10 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "Doesn't matter what this says" },
      ];

      const response = await generateResponse(messages);

      expect(response).toContain(mockText);
    });

    it("should reset to default implementation when __resetGenerateTextImpl is called", async () => {
      // First, set a mock
      __setGenerateTextImpl(async () => ({
        text: "Mock A",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 5, completionTokens: 5 },
      }));

      let response1 = await generateResponse([
        { role: "user", content: "Test 1" },
      ]);
      expect(response1).toContain("Mock A");

      // Reset and set a different mock
      __resetGenerateTextImpl();
      __setGenerateTextImpl(async () => ({
        text: "Mock B",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 5, completionTokens: 5 },
      }));

      let response2 = await generateResponse([
        { role: "user", content: "Test 2" },
      ]);
      expect(response2).toContain("Mock B");
      expect(response2).not.toContain("Mock A");
    });
  });

  describe("Edge Cases", () => {
    it("should handle multi-turn conversations", async () => {
      __setGenerateTextImpl(async () => ({
        text: "Multi-turn response",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 30, completionTokens: 20 },
      }));

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
      // Simulate the GLM-4.6 edge case where LLM returns empty string
      __setGenerateTextImpl(async () => ({
        text: "",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 0 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "This might return empty" },
      ];

      const response = await generateResponse(messages);

      // Should have fallback mechanism for empty responses
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0); // Should provide fallback
    });

    it("should handle very long message history", async () => {
      __setGenerateTextImpl(async () => ({
        text: "Handled long history",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 500, completionTokens: 30 },
      }));

      // Create a long conversation (20 messages)
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

  describe("Error Handling", () => {
    it("should handle errors from generateText gracefully", async () => {
      __setGenerateTextImpl(async () => {
        throw new Error("Simulated LLM error");
      });

      const messages: CoreMessage[] = [
        { role: "user", content: "This will cause an error" },
      ];

      // Should either throw or handle gracefully with error message
      await expect(async () => {
        await generateResponse(messages);
      }).rejects.toThrow();
    });

    it("should handle updateStatus callback errors without failing", async () => {
      const failingCallback = vi.fn(() => {
        throw new Error("Callback error");
      });

      __setGenerateTextImpl(async () => ({
        text: "Response despite callback error",
        toolCalls: [],
        toolResults: [],
        usage: { promptTokens: 10, completionTokens: 15 },
      }));

      const messages: CoreMessage[] = [
        { role: "user", content: "Test with failing callback" },
      ];

      // Should still generate response even if callback fails
      const response = await generateResponse(messages, failingCallback);

      expect(response).toBeDefined();
      expect(failingCallback).toHaveBeenCalled();
    });
  });
});
