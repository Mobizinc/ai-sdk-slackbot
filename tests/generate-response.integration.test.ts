/**
 * Integration Tests for generate-response.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateResponse } from "../lib/generate-response";
import { __setToolRegistry } from "../lib/agent/tool-registry";
import type { ChatMessage } from "../lib/agent/types";

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

function setMockAgentResponse(text: string) {
  runAgentMock.mockImplementation(async ({ updateStatus }: any) => {
    updateStatus?.("thinking");
    updateStatus?.("complete");
    return text;
  });

  formatMessageMock.mockImplementation(({ text: input }: { text: string }) => input);
}

function setMockAgentError(error: Error) {
  runAgentMock.mockImplementation(async () => {
    throw error;
  });
}

describe("generateResponse", () => {
  beforeEach(() => {
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
    __setToolRegistry(null);
  });

  it("generates a response for a simple conversation", async () => {
    setMockAgentResponse("Response to simple message");

    const messages: ChatMessage[] = [{ role: "user", content: "Hello, how are you?" }];

    const response = await generateResponse(messages);

    expect(response).toBe("Response to simple message");
    expect(runAgentMock).toHaveBeenCalled();
  });

  it("handles an empty message array", async () => {
    setMockAgentResponse("I'm here to help!");

    const response = await generateResponse([]);

    expect(response).toBe("I'm here to help!");
  });

  it("invokes updateStatus callbacks", async () => {
    setMockAgentResponse("Test response");
    const statusUpdates: string[] = [];
    const mockUpdateStatus = vi.fn((status: string) => {
      statusUpdates.push(status);
    });

    await generateResponse([{ role: "user", content: "Test message" }], mockUpdateStatus);

    expect(mockUpdateStatus).toHaveBeenCalled();
    expect(statusUpdates).toContain("thinking");
    expect(statusUpdates).toContain("complete");
  });

  it("passes through options", async () => {
    setMockAgentResponse("Response with full context");

    await generateResponse(
      [{ role: "user", content: "Test with full options" }],
      undefined,
      { channelId: "C123456", channelName: "general", threadTs: "1234567890.123456" },
    );

    expect(runAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.any(Array),
        updateStatus: expect.any(Function),
        options: expect.objectContaining({ channelId: "C123456", channelName: "general", threadTs: "1234567890.123456" }),
      }),
    );
  });

  it("propagates errors from the agent runner", async () => {
    const error = new Error("LLM failure");
    setMockAgentError(error);

    await expect(
      generateResponse([{ role: "user", content: "Trigger error" }]),
    ).rejects.toThrow("LLM failure");
  });
});
