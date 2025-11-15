/**
 * Comprehensive Unit Tests for Agent Orchestrator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateResponse as generateResponseAgent } from "../../lib/agent";
import type { CoreMessage } from "../../lib/agent/types";

const loadContextMock = vi.fn();
const buildPromptMock = vi.fn();
const runAgentMock = vi.fn();
const formatMessageMock = vi.fn();

vi.mock("../../lib/agent/context-loader", () => ({
  loadContext: (...args: unknown[]) => loadContextMock(...args),
}));

vi.mock("../../lib/agent/prompt-builder", () => ({
  buildPrompt: (...args: unknown[]) => buildPromptMock(...args),
}));

vi.mock("../../lib/agent/runner", () => ({
  runAgent: (...args: unknown[]) => runAgentMock(...args),
}));

vi.mock("../../lib/agent/message-formatter", () => ({
  formatMessage: (...args: unknown[]) => formatMessageMock(...args),
}));

describe("Agent Orchestrator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    loadContextMock.mockResolvedValue({
      messages: [{ role: "user", content: "Hi" }],
      metadata: { caseNumbers: [] },
    });
    buildPromptMock.mockResolvedValue({
      systemPrompt: "You are helpful.",
      conversation: [{ role: "user", content: "Hi" }],
    });
    runAgentMock.mockResolvedValue("raw response");
    formatMessageMock.mockReturnValue("formatted response");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Pipeline Integration", () => {
    it("runs the full refactored pipeline in correct order", async () => {
      const messages: CoreMessage[] = [{ role: "user", content: "Hi there" }];

      const result = await generateResponseAgent(messages);

      // Verify all modules were called
      expect(loadContextMock).toHaveBeenCalled();
      expect(buildPromptMock).toHaveBeenCalled();
      expect(runAgentMock).toHaveBeenCalled();
      expect(formatMessageMock).toHaveBeenCalled();
      expect(result).toBe("formatted response");
    });

    it("passes messages and options to context loader", async () => {
      const messages: CoreMessage[] = [{ role: "user", content: "Test" }];
      const options = {
        channelId: "C123456",
        threadTs: "1234567890.123456",
      };

      await generateResponseAgent(messages, undefined, options);

      expect(loadContextMock).toHaveBeenCalledWith({
        messages,
        channelId: "C123456",
        threadTs: "1234567890.123456",
      });
    });

    it("passes context to prompt builder", async () => {
      const context = {
        messages: [{ role: "user", content: "Hi" }],
        metadata: {
          caseNumbers: ["SCS0001234"],
          companyName: "Acme Corp",
        },
      };
      loadContextMock.mockResolvedValueOnce(context);

      await generateResponseAgent([{ role: "user", content: "Hi" }]);

      expect(buildPromptMock).toHaveBeenCalledWith({
        context,
        requestTimestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it("creates agent messages with system prompt", async () => {
      buildPromptMock.mockResolvedValueOnce({
        systemPrompt: "You are a helpful assistant.",
        conversation: [
          { role: "user", content: "Message 1" },
          { role: "assistant", content: "Response 1" },
        ],
      });

      await generateResponseAgent([{ role: "user", content: "Test" }]);

      expect(runAgentMock).toHaveBeenCalledWith({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Message 1" },
          { role: "assistant", content: "Response 1" },
        ],
        updateStatus: undefined,
        options: undefined,
        caseNumbers: [],
        contextMetadata: { caseNumbers: [] },
      });
    });

    it("extracts and passes case numbers to runner", async () => {
      loadContextMock.mockResolvedValueOnce({
        messages: [{ role: "user", content: "About SCS0001234" }],
        metadata: {
          caseNumbers: ["SCS0001234", "SCS0005678"],
        },
      });

      await generateResponseAgent([{ role: "user", content: "About SCS0001234" }]);

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumbers: ["SCS0001234", "SCS0005678"],
        })
      );
    });

    it("passes runner output to message formatter", async () => {
      runAgentMock.mockResolvedValueOnce("Raw LLM response with **markdown**");

      await generateResponseAgent([{ role: "user", content: "Test" }]);

      expect(formatMessageMock).toHaveBeenCalledWith({
        text: "Raw LLM response with **markdown**",
        updateStatus: undefined,
      });
    });
  });

  describe("Status Updates", () => {
    it("propagates updateStatus callback through all layers", async () => {
      const updateStatus = vi.fn();

      await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        updateStatus
      );

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          updateStatus,
        })
      );

      expect(formatMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          updateStatus,
        })
      );
    });

    it("handles missing updateStatus callback gracefully", async () => {
      const result = await generateResponseAgent([{ role: "user", content: "Test" }]);

      expect(result).toBe("formatted response");
      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          updateStatus: undefined,
        })
      );
    });
  });

  describe("Options Passthrough", () => {
    it("passes channelId through pipeline", async () => {
      const options = { channelId: "C987654" };

      await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        undefined,
        options
      );

      expect(loadContextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: "C987654",
        })
      );

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          options,
        })
      );
    });

    it("passes all options (channelId, channelName, threadTs)", async () => {
      const options = {
        channelId: "C123456",
        channelName: "general",
        threadTs: "1234567890.123456",
      };

      await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        undefined,
        options
      );

      expect(loadContextMock).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: "C123456",
          threadTs: "1234567890.123456",
        })
      );

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          options,
        })
      );
    });
  });

  describe("Error Handling", () => {
    it("falls back to legacy executor when context loader fails", async () => {
      loadContextMock.mockRejectedValueOnce(new Error("context error"));
      const legacyExecutor = vi.fn().mockResolvedValue("legacy fallback");

      const result = await generateResponseAgent(
        [{ role: "user", content: "Hello" }],
        undefined,
        undefined,
        { legacyExecutor }
      );

      expect(result).toBe("legacy fallback");
      expect(legacyExecutor).toHaveBeenCalledWith(
        [{ role: "user", content: "Hello" }],
        undefined,
        undefined
      );
      expect(buildPromptMock).not.toHaveBeenCalled();
    });

    it("falls back to legacy executor when prompt builder fails", async () => {
      buildPromptMock.mockRejectedValueOnce(new Error("prompt error"));
      const legacyExecutor = vi.fn().mockResolvedValue("legacy fallback");

      const result = await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        undefined,
        undefined,
        { legacyExecutor }
      );

      expect(result).toBe("legacy fallback");
      expect(runAgentMock).not.toHaveBeenCalled();
    });

    it("falls back to legacy executor when runner fails", async () => {
      runAgentMock.mockRejectedValueOnce(new Error("runner error"));
      const legacyExecutor = vi.fn().mockResolvedValue("legacy fallback");

      const result = await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        undefined,
        undefined,
        { legacyExecutor }
      );

      expect(result).toBe("legacy fallback");
      expect(formatMessageMock).not.toHaveBeenCalled();
    });

    it("falls back to legacy executor when formatter fails", async () => {
      formatMessageMock.mockImplementationOnce(() => {
        throw new Error("formatter error");
      });
      const legacyExecutor = vi.fn().mockResolvedValue("legacy fallback");

      const result = await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        undefined,
        undefined,
        { legacyExecutor }
      );

      expect(result).toBe("legacy fallback");
    });

    it("throws error when no legacy executor is provided and pipeline fails", async () => {
      loadContextMock.mockRejectedValueOnce(new Error("context error"));

      await expect(
        generateResponseAgent([{ role: "user", content: "Test" }])
      ).rejects.toThrow("context error");
    });

    it("passes all parameters to legacy executor on fallback", async () => {
      loadContextMock.mockRejectedValueOnce(new Error("error"));
      const legacyExecutor = vi.fn().mockResolvedValue("fallback");
      const updateStatus = vi.fn();
      const options = { channelId: "C123" };

      await generateResponseAgent(
        [{ role: "user", content: "Test" }],
        updateStatus,
        options,
        { legacyExecutor }
      );

      expect(legacyExecutor).toHaveBeenCalledWith(
        [{ role: "user", content: "Test" }],
        updateStatus,
        options
      );
    });
  });

  describe("Edge Cases", () => {
    it("handles empty messages array", async () => {
      const result = await generateResponseAgent([]);

      expect(loadContextMock).toHaveBeenCalledWith({
        messages: [],
        channelId: undefined,
        threadTs: undefined,
      });
      expect(result).toBe("formatted response");
    });

    it("handles empty case numbers in metadata", async () => {
      loadContextMock.mockResolvedValueOnce({
        messages: [{ role: "user", content: "Hi" }],
        metadata: {},
      });

      await generateResponseAgent([{ role: "user", content: "Hi" }]);

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumbers: [],
        })
      );
    });

    it("handles non-array case numbers in metadata", async () => {
      loadContextMock.mockResolvedValueOnce({
        messages: [{ role: "user", content: "Hi" }],
        metadata: {
          caseNumbers: "SCS0001234", // Invalid: should be array
        },
      });

      await generateResponseAgent([{ role: "user", content: "Hi" }]);

      expect(runAgentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumbers: [],
        })
      );
    });

    it("handles multi-turn conversation messages", async () => {
      const messages: CoreMessage[] = [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" },
      ];

      await generateResponseAgent(messages);

      expect(loadContextMock).toHaveBeenCalledWith({
        messages,
        channelId: undefined,
        threadTs: undefined,
      });
    });
  });
});
