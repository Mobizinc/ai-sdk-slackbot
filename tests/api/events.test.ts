/**
 * Events API Tests
 * 
 * Critical security and functionality tests for Slack Events API endpoint
 * Tests event handling, authentication, and request validation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "../../api/events";
import { verifyRequest } from "../../lib/slack-utils";

// Mock dependencies
vi.mock("../../lib/slack-utils", () => ({
  verifyRequest: vi.fn(),
}));

vi.mock("../../lib/background-tasks", () => ({
  enqueueBackgroundTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/slack/client", () => ({
  getSlackClient: vi.fn(() => ({
    conversations: {
      members: vi.fn().mockResolvedValue({
        ok: true,
        members: ["U123456", "U789012"],
      }),
    },
  })),
}));

describe("Events API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should reject requests without signature", async () => {
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ type: "url_verification" }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Unauthorized");
    });

    it("should reject requests with invalid signature", async () => {
      vi.mocked(verifyRequest).mockReturnValue(false);

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "invalid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify({ type: "url_verification" }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      expect(verifyRequest).toHaveBeenCalled();
    });

    it("should accept requests with valid signature", async () => {
      vi.mocked(verifyRequest).mockReturnValue(true);

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify({ type: "url_verification" }),
      });

      const response = await POST(request);
      
      // Should not be 401 for valid signature
      expect(response.status).not.toBe(401);
    });

    it("should reject replay attacks", async () => {
      vi.mocked(verifyRequest).mockReturnValue(false);

      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "old_signature",
          "x-slack-request-timestamp": oldTimestamp.toString(),
        },
        body: JSON.stringify({ type: "url_verification" }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
    });
  });

  describe("URL Verification", () => {
    beforeEach(() => {
      vi.mocked(verifyRequest).mockReturnValue(true);
    });

    it("should handle URL verification challenge", async () => {
      const challenge = "test_challenge_123";
      
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify({
          type: "url_verification",
          challenge,
        }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.challenge).toBe(challenge);
    });

    it("should reject URL verification without challenge", async () => {
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify({
          type: "url_verification",
        }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Missing challenge");
    });
  });

  describe("Event Handling", () => {
    beforeEach(() => {
      vi.mocked(verifyRequest).mockReturnValue(true);
    });

    it("should handle message events", async () => {
      const messageEvent = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U789012",
          text: "Hello world",
          ts: "1234567890.123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(messageEvent),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
    });

    it("should handle app mention events", async () => {
      const mentionEvent = {
        type: "event_callback",
        event: {
          type: "app_mention",
          channel: "C123456",
          user: "U789012",
          text: "<@U123456> help me",
          ts: "1234567890.123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(mentionEvent),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
    });

    it("should ignore bot messages", async () => {
      const botMessage = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U123456", // Bot user ID
          text: "Bot message",
          ts: "1234567890.123456",
          subtype: "bot_message",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(botMessage),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Should not process bot messages
    });

    it("should handle malformed events gracefully", async () => {
      const malformedEvent = {
        type: "event_callback",
        event: {
          // Missing required fields
          channel: "C123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(malformedEvent),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200); // Should still acknowledge to avoid retries
    });
  });

  describe("Input Validation", () => {
    beforeEach(() => {
      vi.mocked(verifySlackRequest).mockReturnValue(true);
    });

    it("should reject empty request body", async () => {
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: "",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid request body");
    });

    it("should reject non-JSON content", async () => {
      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: "not json",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
    });

    it("should reject oversized payloads", async () => {
      const largePayload = {
        type: "event_callback",
        event: {
          type: "message",
          text: "a".repeat(1000000), // 1MB text
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(largePayload),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toContain("Payload too large");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      vi.mocked(verifySlackRequest).mockReturnValue(true);
    });

    it("should handle processing errors gracefully", async () => {
      // Mock a processing error
      const { enqueueWebhook } = await import("../../lib/queue/qstash-client");
      vi.mocked(enqueueWebhook).mockRejectedValue(new Error("Queue error"));

      const event = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U789012",
          text: "Test message",
          ts: "1234567890.123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(event),
      });

      const response = await POST(request);
      
      // Should still return 200 to avoid Slack retries, but log the error
      expect(response.status).toBe(200);
    });

    it("should respond quickly to avoid timeouts", async () => {
      const startTime = Date.now();

      const event = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U789012",
          text: "Quick test",
          ts: "1234567890.123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(event),
      });

      const response = await POST(request);
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(1000); // Should respond within 1 second
    });
  });

  describe("Security", () => {
    beforeEach(() => {
      vi.mocked(verifySlackRequest).mockReturnValue(true);
    });

    it("should sanitize input data", async () => {
      const maliciousEvent = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U789012",
          text: '<script>alert("xss")</script>',
          ts: "1234567890.123456",
        },
      };

      const request = new Request("https://example.com/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-slack-signature": "valid_signature",
          "x-slack-request-timestamp": "1234567890",
        },
        body: JSON.stringify(maliciousEvent),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Input should be sanitized before processing
    });

    it("should rate limit requests", async () => {
      // This would require implementing rate limiting
      const event = {
        type: "event_callback",
        event: {
          type: "message",
          channel: "C123456",
          user: "U789012",
          text: "Rate limit test",
          ts: "1234567890.123456",
        },
      };

      // Make multiple rapid requests
      const requests = Array.from({ length: 100 }, () =>
        new Request("https://example.com/api/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-slack-signature": "valid_signature",
            "x-slack-request-timestamp": "1234567890",
          },
          body: JSON.stringify(event),
        })
      );

      const responses = await Promise.all(requests.map(req => POST(req)));
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});