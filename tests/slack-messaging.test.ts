/**
 * Unit Tests for Slack Messaging Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SlackMessagingService,
  getSlackMessagingService,
  __resetSlackMessagingService,
  __setSlackMessagingService,
} from "../lib/services/slack-messaging";
import type { WebClient } from "@slack/web-api";

describe("SlackMessagingService", () => {
  let mockClient: Partial<WebClient>;
  let service: SlackMessagingService;

  beforeEach(() => {
    // Create a mock WebClient
    mockClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({
          ok: true,
          ts: "1234567890.123456",
          channel: "C123456",
        }),
        update: vi.fn().mockResolvedValue({ ok: true }),
      } as any,
      conversations: {
        replies: vi.fn().mockResolvedValue({
          messages: [
            { text: "Message 1", user: "U123", bot_id: undefined },
            { text: "Message 2", bot_id: "B456" },
          ],
        }),
      } as any,
      assistant: {
        threads: {
          setStatus: vi.fn().mockResolvedValue({ ok: true }),
        },
      } as any,
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: "U123BOT" }),
      } as any,
    };

    service = new SlackMessagingService(mockClient as WebClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetSlackMessagingService();
  });

  describe("postMessage", () => {
    it("should post a message to a channel", async () => {
      const result = await service.postMessage({
        channel: "C123456",
        text: "Hello, world!",
      });

      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: "Hello, world!",
        thread_ts: undefined,
        unfurl_links: false,
      });

      expect(result.ok).toBe(true);
      expect(result.ts).toBe("1234567890.123456");
    });

    it("should post a message to a thread", async () => {
      const result = await service.postMessage({
        channel: "C123456",
        text: "Reply in thread",
        threadTs: "1234567880.111111",
      });

      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: "Reply in thread",
        thread_ts: "1234567880.111111",
        unfurl_links: false,
      });

      expect(result.ok).toBe(true);
    });

    it("should respect unfurlLinks option", async () => {
      await service.postMessage({
        channel: "C123456",
        text: "Check out https://example.com",
        unfurlLinks: true,
      });

      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          unfurl_links: true,
        })
      );
    });

    it("should handle errors and rethrow", async () => {
      const error = new Error("Slack API error");
      mockClient.chat!.postMessage = vi.fn().mockRejectedValue(error);

      await expect(
        service.postMessage({
          channel: "C123456",
          text: "This will fail",
        })
      ).rejects.toThrow("Slack API error");
    });
  });

  describe("postToThread", () => {
    it("should post a message to a thread (convenience method)", async () => {
      const result = await service.postToThread({
        channel: "C123456",
        threadTs: "1234567880.111111",
        text: "Thread reply",
      });

      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: "Thread reply",
        thread_ts: "1234567880.111111",
        unfurl_links: false,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("updateMessage", () => {
    it("should update an existing message", async () => {
      await service.updateMessage({
        channel: "C123456",
        ts: "1234567890.123456",
        text: "Updated text",
      });

      expect(mockClient.chat!.update).toHaveBeenCalledWith({
        channel: "C123456",
        ts: "1234567890.123456",
        text: "Updated text",
      });
    });

    it("should handle update errors", async () => {
      const error = new Error("Message not found");
      mockClient.chat!.update = vi.fn().mockRejectedValue(error);

      await expect(
        service.updateMessage({
          channel: "C123456",
          ts: "1234567890.123456",
          text: "Won't work",
        })
      ).rejects.toThrow("Message not found");
    });
  });

  describe("getThreadReplies", () => {
    it("should fetch thread replies", async () => {
      const replies = await service.getThreadReplies({
        channel: "C123456",
        threadTs: "1234567890.123456",
      });

      expect(mockClient.conversations!.replies).toHaveBeenCalledWith({
        channel: "C123456",
        ts: "1234567890.123456",
        limit: 50,
      });

      expect(replies).toHaveLength(2);
    });

    it("should respect limit parameter", async () => {
      await service.getThreadReplies({
        channel: "C123456",
        threadTs: "1234567890.123456",
        limit: 10,
      });

      expect(mockClient.conversations!.replies).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        })
      );
    });

    it("should return empty array when no messages", async () => {
      mockClient.conversations!.replies = vi.fn().mockResolvedValue({
        messages: undefined,
      });

      const replies = await service.getThreadReplies({
        channel: "C123456",
        threadTs: "1234567890.123456",
      });

      expect(replies).toEqual([]);
    });
  });

  describe("getThread", () => {
    it("should format thread messages as CoreMessage array", async () => {
      mockClient.conversations!.replies = vi.fn().mockResolvedValue({
        messages: [
          { text: "User message", user: "U123" },
          { text: "Bot response", bot_id: "B456" },
          { text: "Another user message", user: "U789" },
        ],
      });

      const thread = await service.getThread(
        "C123456",
        "1234567890.123456",
        "B456"
      );

      expect(thread).toHaveLength(3);
      expect(thread[0]).toEqual({ role: "user", content: "User message" });
      expect(thread[1]).toEqual({ role: "assistant", content: "Bot response" });
      expect(thread[2]).toEqual({
        role: "user",
        content: "Another user message",
      });
    });

    it("should remove bot mentions from user messages", async () => {
      mockClient.conversations!.replies = vi.fn().mockResolvedValue({
        messages: [
          { text: "<@B456> help me", user: "U123" },
          { text: "Sure, I can help", bot_id: "B456" },
        ],
      });

      const thread = await service.getThread(
        "C123456",
        "1234567890.123456",
        "B456"
      );

      expect(thread[0].content).toBe("help me");
      expect(thread[1].content).toBe("Sure, I can help");
    });

    it("should filter out messages without text", async () => {
      mockClient.conversations!.replies = vi.fn().mockResolvedValue({
        messages: [
          { text: "Valid message", user: "U123" },
          { text: null, user: "U456" }, // No text
          { text: "Another valid", user: "U789" },
        ],
      });

      const thread = await service.getThread(
        "C123456",
        "1234567890.123456",
        "B456"
      );

      expect(thread).toHaveLength(2);
    });

    it("should throw error when no messages found", async () => {
      mockClient.conversations!.replies = vi.fn().mockResolvedValue({
        messages: [],
      });

      await expect(
        service.getThread("C123456", "1234567890.123456", "B456")
      ).rejects.toThrow("No messages found in thread");
    });
  });

  describe("createStatusUpdater", () => {
    it("should create a status updater function", async () => {
      const updateStatus = service.createStatusUpdater(
        "C123456",
        "1234567890.123456"
      );

      await updateStatus("Processing...");

      expect(mockClient.assistant!.threads!.setStatus).toHaveBeenCalledWith({
        channel_id: "C123456",
        thread_ts: "1234567890.123456",
        status: "Processing...",
      });
    });

    it("should disable status updates after missing_scope error", async () => {
      const error = {
        data: { error: "missing_scope" },
      };
      mockClient.assistant!.threads!.setStatus = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue({ ok: true });

      const updateStatus = service.createStatusUpdater(
        "C123456",
        "1234567890.123456"
      );

      // First call should fail but be handled
      await updateStatus("First try");
      expect(mockClient.assistant!.threads!.setStatus).toHaveBeenCalledTimes(1);

      // Second call should be skipped
      await updateStatus("Second try");
      expect(mockClient.assistant!.threads!.setStatus).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should disable status updates after method_not_supported error", async () => {
      const error = {
        data: { error: "method_not_supported_for_channel_type" },
      };
      mockClient.assistant!.threads!.setStatus = vi
        .fn()
        .mockRejectedValueOnce(error);

      const updateStatus = service.createStatusUpdater(
        "C123456",
        "1234567890.123456"
      );

      await updateStatus("Try it");

      // Should not throw, just disable future calls
      expect(mockClient.assistant!.threads!.setStatus).toHaveBeenCalledTimes(1);

      await updateStatus("Should be skipped");
      expect(mockClient.assistant!.threads!.setStatus).toHaveBeenCalledTimes(1);
    });

    it("should rethrow non-scope errors", async () => {
      const error = new Error("Network error");
      mockClient.assistant!.threads!.setStatus = vi
        .fn()
        .mockRejectedValue(error);

      const updateStatus = service.createStatusUpdater(
        "C123456",
        "1234567890.123456"
      );

      await expect(updateStatus("This will fail")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("getBotUserId", () => {
    it("should return bot user ID", async () => {
      const botId = await service.getBotUserId();

      expect(mockClient.auth!.test).toHaveBeenCalled();
      expect(botId).toBe("U123BOT");
    });

    it("should throw error if user_id is undefined", async () => {
      mockClient.auth!.test = vi.fn().mockResolvedValue({});

      await expect(service.getBotUserId()).rejects.toThrow(
        "botUserId is undefined"
      );
    });

    it("should handle auth errors", async () => {
      const error = new Error("Invalid token");
      mockClient.auth!.test = vi.fn().mockRejectedValue(error);

      await expect(service.getBotUserId()).rejects.toThrow("Invalid token");
    });
  });

  describe("formatMarkdown", () => {
    it("should pass through text as-is", () => {
      const formatted = service.formatMarkdown("*bold* _italic_ `code`");
      expect(formatted).toBe("*bold* _italic_ `code`");
    });
  });

  describe("uploadFile", () => {
    beforeEach(() => {
      mockClient.files = {
        uploadV2: vi.fn().mockResolvedValue({ ok: true }),
      } as any;
    });

    it("should upload a file successfully", async () => {
      const buffer = Buffer.from("file content");
      const result = await service.uploadFile({
        channelId: "C123456",
        filename: "test.txt",
        title: "Test File",
        initialComment: "Here's the file",
        file: buffer,
      });

      expect(mockClient.files!.uploadV2).toHaveBeenCalledWith({
        channel_id: "C123456",
        filename: "test.txt",
        title: "Test File",
        initial_comment: "Here's the file",
        file: buffer,
      });

      expect(result.ok).toBe(true);
    });

    it("should handle missing_scope error gracefully", async () => {
      const error = {
        data: { error: "missing_scope" },
      };
      mockClient.files!.uploadV2 = vi.fn().mockRejectedValue(error);

      const buffer = Buffer.from("file content");

      await expect(
        service.uploadFile({
          channelId: "C123456",
          filename: "test.txt",
          title: "Test File",
          file: buffer,
        })
      ).rejects.toThrow();
    });
  });

  describe("getConversationInfo", () => {
    beforeEach(() => {
      mockClient.conversations = {
        ...mockClient.conversations,
        info: vi.fn().mockResolvedValue({
          channel: { id: "C123456", name: "general" },
        }),
      } as any;
    });

    it("should get conversation info", async () => {
      const result = await service.getConversationInfo("C123456");

      expect(mockClient.conversations!.info).toHaveBeenCalledWith({
        channel: "C123456",
      });

      expect(result.channel).toBeDefined();
    });

    it("should handle errors", async () => {
      const error = new Error("Channel not found");
      mockClient.conversations!.info = vi.fn().mockRejectedValue(error);

      await expect(service.getConversationInfo("C123456")).rejects.toThrow(
        "Channel not found"
      );
    });
  });

  describe("getConversationHistory", () => {
    beforeEach(() => {
      mockClient.conversations = {
        ...mockClient.conversations,
        history: vi.fn().mockResolvedValue({
          ok: true,
          messages: [{ text: "Message 1" }, { text: "Message 2" }],
        }),
      } as any;
    });

    it("should get conversation history", async () => {
      const result = await service.getConversationHistory({
        channel: "C123456",
        latest: "1234567890.123456",
        limit: 10,
        inclusive: true,
      });

      expect(mockClient.conversations!.history).toHaveBeenCalledWith({
        channel: "C123456",
        latest: "1234567890.123456",
        limit: 10,
        inclusive: true,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("openView", () => {
    beforeEach(() => {
      mockClient.views = {
        open: vi.fn().mockResolvedValue({ ok: true }),
      } as any;
    });

    it("should open a modal view", async () => {
      const view = { type: "modal", title: { type: "plain_text", text: "Test" } };
      const result = await service.openView({
        triggerId: "12345.67890",
        view,
      });

      expect(mockClient.views!.open).toHaveBeenCalledWith({
        trigger_id: "12345.67890",
        view,
      });

      expect(result).toBeDefined();
    });

    it("should handle errors", async () => {
      const error = new Error("Invalid trigger_id");
      mockClient.views!.open = vi.fn().mockRejectedValue(error);

      await expect(
        service.openView({
          triggerId: "invalid",
          view: {},
        })
      ).rejects.toThrow("Invalid trigger_id");
    });
  });

  describe("lookupUserByEmail", () => {
    beforeEach(() => {
      mockClient.users = {
        lookupByEmail: vi.fn().mockResolvedValue({
          user: { id: "U123456", email: "test@example.com" },
        }),
      } as any;
    });

    it("should lookup user by email", async () => {
      const result = await service.lookupUserByEmail("test@example.com");

      expect(mockClient.users!.lookupByEmail).toHaveBeenCalledWith({
        email: "test@example.com",
      });

      expect(result.user.id).toBe("U123456");
    });

    it("should handle user not found", async () => {
      const error = new Error("users_not_found");
      mockClient.users!.lookupByEmail = vi.fn().mockRejectedValue(error);

      await expect(service.lookupUserByEmail("notfound@example.com")).rejects.toThrow(
        "users_not_found"
      );
    });
  });

  describe("openConversation", () => {
    beforeEach(() => {
      mockClient.conversations = {
        ...mockClient.conversations,
        open: vi.fn().mockResolvedValue({
          channel: { id: "D123456" },
        }),
      } as any;
    });

    it("should open a direct message conversation", async () => {
      const result = await service.openConversation("U123456");

      expect(mockClient.conversations!.open).toHaveBeenCalledWith({
        users: "U123456",
      });

      expect(result.channelId).toBe("D123456");
    });

    it("should handle errors", async () => {
      const error = new Error("User not found");
      mockClient.conversations!.open = vi.fn().mockRejectedValue(error);

      await expect(service.openConversation("U123456")).rejects.toThrow(
        "User not found"
      );
    });
  });

  describe("deleteMessage", () => {
    beforeEach(() => {
      mockClient.chat = {
        ...mockClient.chat,
        delete: vi.fn().mockResolvedValue({ ok: true }),
      } as any;
    });

    it("should delete a message", async () => {
      await service.deleteMessage({
        channel: "C123456",
        ts: "1234567890.123456",
      });

      expect(mockClient.chat!.delete).toHaveBeenCalledWith({
        channel: "C123456",
        ts: "1234567890.123456",
      });
    });

    it("should handle errors", async () => {
      const error = new Error("Message not found");
      mockClient.chat!.delete = vi.fn().mockRejectedValue(error);

      await expect(
        service.deleteMessage({
          channel: "C123456",
          ts: "1234567890.123456",
        })
      ).rejects.toThrow("Message not found");
    });
  });

  describe("setAssistantSuggestedPrompts", () => {
    beforeEach(() => {
      mockClient.assistant = {
        threads: {
          setSuggestedPrompts: vi.fn().mockResolvedValue({ ok: true }),
          setStatus: mockClient.assistant!.threads!.setStatus,
        },
      } as any;
    });

    it("should set assistant suggested prompts", async () => {
      const prompts = [
        { title: "Prompt 1", message: "Message 1" },
        { title: "Prompt 2", message: "Message 2" },
      ];

      await service.setAssistantSuggestedPrompts({
        channelId: "C123456",
        threadTs: "1234567890.123456",
        prompts,
      });

      expect(mockClient.assistant!.threads!.setSuggestedPrompts).toHaveBeenCalledWith({
        channel_id: "C123456",
        thread_ts: "1234567890.123456",
        prompts,
      });
    });

    it("should handle missing_scope error gracefully", async () => {
      const error = {
        data: { error: "missing_scope" },
      };
      mockClient.assistant!.threads!.setSuggestedPrompts = vi
        .fn()
        .mockRejectedValue(error);

      // Should not throw
      await service.setAssistantSuggestedPrompts({
        channelId: "C123456",
        threadTs: "1234567890.123456",
        prompts: [{ title: "Test", message: "Test" }],
      });

      expect(mockClient.assistant!.threads!.setSuggestedPrompts).toHaveBeenCalled();
    });

    it("should rethrow non-scope errors", async () => {
      const error = new Error("Network error");
      mockClient.assistant!.threads!.setSuggestedPrompts = vi
        .fn()
        .mockRejectedValue(error);

      await expect(
        service.setAssistantSuggestedPrompts({
          channelId: "C123456",
          threadTs: "1234567890.123456",
          prompts: [{ title: "Test", message: "Test" }],
        })
      ).rejects.toThrow("Network error");
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      // Set a mock instance first to avoid requiring slack-utils in test
      const mockService = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService);

      const instance1 = getSlackMessagingService();
      const instance2 = getSlackMessagingService();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      // Set initial mock instance
      const mockService1 = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService1);

      const instance1 = getSlackMessagingService();

      __resetSlackMessagingService();

      // Set new mock instance after reset
      const mockService2 = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService2);

      const instance2 = getSlackMessagingService();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customService = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(customService);

      const instance = getSlackMessagingService();
      expect(instance).toBe(customService);
    });
  });
});
