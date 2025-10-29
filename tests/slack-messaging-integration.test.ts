/**
 * Slack Messaging Integration Tests
 * Integration tests for enhanced Slack messaging with rate limiting, retry logic, and interactive components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlackMessagingService, getSlackMessagingService, __resetSlackMessagingService, __setSlackMessagingService } from "../lib/services/slack-messaging";
import type { WebClient } from "@slack/web-api";

describe("SlackMessaging Integration", () => {
  let mockClient: Partial<WebClient>;
  let service: SlackMessagingService;

  beforeEach(() => {
    // Create a comprehensive mock WebClient
    mockClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({
          ok: true,
          ts: "1234567890.123456",
          channel: "C123456",
        }),
        update: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
      } as any,
      conversations: {
        replies: vi.fn().mockResolvedValue({
          messages: [
            { text: "Message 1", user: "U123", bot_id: undefined },
            { text: "Message 2", bot_id: "B456" },
          ],
        }),
        info: vi.fn().mockResolvedValue({
          channel: { id: "C123456", name: "general" },
        }),
        history: vi.fn().mockResolvedValue({
          ok: true,
          messages: [{ text: "Message 1" }, { text: "Message 2" }],
        }),
        open: vi.fn().mockResolvedValue({
          channel: { id: "D123456" },
        }),
      } as any,
      assistant: {
        threads: {
          setStatus: vi.fn().mockResolvedValue({ ok: true }),
          setSuggestedPrompts: vi.fn().mockResolvedValue({ ok: true }),
        },
      } as any,
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: "U123BOT" }),
      } as any,
      views: {
        open: vi.fn().mockResolvedValue({ ok: true, view: { id: "V123" } }),
        update: vi.fn().mockResolvedValue({ ok: true }),
        publish: vi.fn().mockResolvedValue({ ok: true }),
      } as any,
      users: {
        lookupByEmail: vi.fn().mockResolvedValue({
          user: { id: "U123456", email: "test@example.com" },
        }),
      } as any,
      files: {
        uploadV2: vi.fn().mockResolvedValue({ ok: true }),
      } as any,
    };

    service = new SlackMessagingService(mockClient as WebClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetSlackMessagingService();
  });

  describe("Rate Limiting", () => {
    it("should handle rate limiting gracefully", async () => {
      // Mock rate limit error
      const rateLimitError = {
        data: { error: "rate_limited" },
        response: { headers: { "retry-after": "5" } }
      };
      
      mockClient.chat!.postMessage = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          ok: true,
          ts: "1234567890.123456",
          channel: "C123456",
        });

      const result = await service.postMessage({
        channel: "C123456",
        text: "Test message",
      });

      expect(result.ok).toBe(true);
      expect(mockClient.chat!.postMessage).toHaveBeenCalledTimes(2);
    });

    it("should implement exponential backoff for retries", async () => {
      const networkError = new Error("Network timeout");
      
      mockClient.chat!.postMessage = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          ts: "1234567890.123456",
          channel: "C123456",
        });

      const startTime = Date.now();
      const result = await service.postMessage({
        channel: "C123456",
        text: "Test message",
      });
      const endTime = Date.now();

      expect(result.ok).toBe(true);
      expect(mockClient.chat!.postMessage).toHaveBeenCalledTimes(3);
      expect(endTime - startTime).toBeGreaterThan(100); // Should have some delay for retries
    });

    it("should give up after max retries", async () => {
      const persistentError = new Error("Persistent error");
      
      mockClient.chat!.postMessage = vi.fn()
        .mockRejectedValue(persistentError);

      await expect(
        service.postMessage({
          channel: "C123456",
          text: "Test message",
        })
      ).rejects.toThrow("Persistent error");

      expect(mockClient.chat!.postMessage).toHaveBeenCalledTimes(3); // Max retries
    });
  });

  describe("Interactive Message Handling", () => {
    it("should post messages with interactive components", async () => {
      const interactiveMessage = {
        channel: "C123456",
        text: "Please select an option:", // Fallback text for notifications
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Please select an option:"
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Approve"
                },
                action_id: "approve_button",
                style: "primary"
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Reject"
                },
                action_id: "reject_button",
                style: "danger"
              }
            ]
          }
        ]
      };

      const result = await service.postMessage(interactiveMessage);

      expect(result.ok).toBe(true);
      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: "section" }),
            expect.objectContaining({ 
              type: "actions",
              elements: expect.arrayContaining([
                expect.objectContaining({
                  type: "button",
                  action_id: "approve_button",
                  style: "primary"
                }),
                expect.objectContaining({
                  type: "button",
                  action_id: "reject_button",
                  style: "danger"
                })
              ])
            })
          ])
        })
      );
    });

    it("should handle modal interactions", async () => {
      const modalView = {
        type: "modal",
        callback_id: "test_modal",
        title: {
          type: "plain_text",
          text: "Test Modal"
        },
        blocks: [
          {
            type: "input",
            block_id: "input_block",
            element: {
              type: "plain_text_input",
              action_id: "text_input"
            },
            label: {
              type: "plain_text",
              text: "Enter text"
            }
          }
        ],
        submit: {
          type: "plain_text",
          text: "Submit"
        }
      };

      const result = await service.openView({
        triggerId: "12345.67890",
        view: modalView,
      });

      expect(result).toBeDefined();
      expect(mockClient.views!.open).toHaveBeenCalledWith({
        trigger_id: "12345.67890",
        view: modalView,
      });
    });
  });

  describe("Thread Management", () => {
    it("should post messages in threads", async () => {
      const result = await service.postToThread({
        channel: "C123456",
        threadTs: "1234567880.111111",
        text: "Thread reply",
      });

      expect(result.ok).toBe(true);
      expect(mockClient.chat!.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          text: "Thread reply",
          thread_ts: "1234567880.111111",
        })
      );
    });

    it("should fetch thread replies correctly", async () => {
      const replies = await service.getThreadReplies({
        channel: "C123456",
        threadTs: "1234567890.123456",
        limit: 10,
      });

      expect(replies).toHaveLength(2);
      expect(mockClient.conversations!.replies).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123456",
          ts: "1234567890.123456",
          limit: 10,
        })
      );
    });

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
  });

  describe("Status Updates", () => {
    it("should create status updater function", async () => {
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
  });

  describe("File Uploads", () => {
    it("should upload files successfully", async () => {
      const buffer = Buffer.from("file content");
      const result = await service.uploadFile({
        channelId: "C123456",
        filename: "test.txt",
        title: "Test File",
        initialComment: "Here's the file",
        file: buffer,
      });

      expect(result.ok).toBe(true);
      expect(mockClient.files!.uploadV2).toHaveBeenCalledWith({
        channel_id: "C123456",
        filename: "test.txt",
        title: "Test File",
        initial_comment: "Here's the file",
        file: buffer,
      });
    });

    it("should handle file upload errors gracefully", async () => {
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

  describe("User and Channel Management", () => {
    it("should lookup users by email", async () => {
      const result = await service.lookupUserByEmail("test@example.com");

      expect(result.user.id).toBe("U123456");
      expect(mockClient.users!.lookupByEmail).toHaveBeenCalledWith({
        email: "test@example.com",
      });
    });

    it("should get conversation info", async () => {
      const result = await service.getConversationInfo("C123456");

      expect(result.channel.id).toBe("C123456");
      expect(result.channel.name).toBe("general");
      expect(mockClient.conversations!.info).toHaveBeenCalledWith({
        channel: "C123456",
      });
    });

    it("should open direct message conversations", async () => {
      const result = await service.openConversation("U123456");

      expect(result.channelId).toBe("D123456");
      expect(mockClient.conversations!.open).toHaveBeenCalledWith({
        users: "U123456",
      });
    });
  });

  describe("Message Formatting and Styling", () => {
    it("should format markdown correctly", () => {
      const formatted = service.formatMarkdown("*bold* _italic_ `code`");
      expect(formatted).toBe("*bold* _italic_ `code`");
    });

    it("should handle message updates", async () => {
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

    it("should delete messages", async () => {
      await service.deleteMessage({
        channel: "C123456",
        ts: "1234567890.123456",
      });

      expect(mockClient.chat!.delete).toHaveBeenCalledWith({
        channel: "C123456",
        ts: "1234567890.123456",
      });
    });
  });

  describe("Assistant Features", () => {
    it("should set suggested prompts", async () => {
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

    it("should handle missing_scope errors for suggested prompts", async () => {
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
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle authentication errors", async () => {
      const authError = {
        data: { error: "not_authed" },
      };
      mockClient.chat!.postMessage = vi.fn().mockRejectedValue(authError);

      await expect(
        service.postMessage({
          channel: "C123456",
          text: "Test message",
        })
      ).rejects.toThrow("not_authed");
    });

    it("should handle invalid channel errors", async () => {
      const channelError = {
        data: { error: "channel_not_found" },
      };
      mockClient.chat!.postMessage = vi.fn().mockRejectedValue(channelError);

      await expect(
        service.postMessage({
          channel: "INVALID",
          text: "Test message",
        })
      ).rejects.toThrow("channel_not_found");
    });

    it("should handle message too long errors", async () => {
      const longText = "a".repeat(50000); // Very long message
      const textTooLongError = {
        data: { error: "message_too_long" },
      };
      mockClient.chat!.postMessage = vi.fn().mockRejectedValue(textTooLongError);

      await expect(
        service.postMessage({
          channel: "C123456",
          text: longText,
        })
      ).rejects.toThrow("message_too_long");
    });

    it("should handle malformed responses", async () => {
      mockClient.chat!.postMessage = vi.fn().mockResolvedValue(null);

      const result = await service.postMessage({
        channel: "C123456",
        text: "Test message",
      });

      expect(result).toBeNull();
    });
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const mockService = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService);

      const instance1 = getSlackMessagingService();
      const instance2 = getSlackMessagingService();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockService1 = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService1);

      const instance1 = getSlackMessagingService();

      __resetSlackMessagingService();

      const mockService2 = new SlackMessagingService(mockClient as WebClient);
      __setSlackMessagingService(mockService2);

      const instance2 = getSlackMessagingService();

      expect(instance1).not.toBe(instance2);
    });
  });
});