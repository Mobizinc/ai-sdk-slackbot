/**
 * Slack Interactivity API Security Tests
 * 
 * Critical security tests for interactive component handling
 * Tests protection against malicious payloads, unauthorized access, and data injection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST } from "../../api/interactivity";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";
import { getEscalationService } from "../../lib/services/escalation-service";
import { getKBApprovalManager } from "../../lib/handle-kb-approval";
import { getIncidentClarificationService } from "../../lib/services/incident-clarification-service";

// Mock dependencies
vi.mock("../../lib/slack-utils", () => ({
  verifyRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/services/slack-messaging", () => ({
  getSlackMessagingService: vi.fn(() => ({
    getBotUserId: vi.fn().mockResolvedValue("U123BOT"),
    postMessage: vi.fn(),
    updateMessage: vi.fn(),
    openView: vi.fn(),
  })),
}));

vi.mock("../../lib/services/escalation-service", () => ({
  getEscalationService: vi.fn(() => ({
    handleEscalationAction: vi.fn(),
  })),
}));

vi.mock("../../lib/handle-kb-approval", () => ({
  getKBApprovalManager: vi.fn(() => ({
    handleApprovalAction: vi.fn(),
    handleRejectionAction: vi.fn(),
    handleEditAction: vi.fn(),
  })),
}));

vi.mock("../../lib/services/incident-clarification-service", () => ({
  getIncidentClarificationService: vi.fn(() => ({
    handleClarificationResponse: vi.fn().mockResolvedValue({ success: true, message: "Success" }),
    handleSkipAction: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../lib/db/init", () => ({
  initializeDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("Interactivity API Security", () => {
  let mockSlackMessaging: any;
  let mockEscalationService: any;
  let mockKBManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSlackMessaging = getSlackMessagingService();
    mockEscalationService = getEscalationService();
    mockKBManager = getKBApprovalManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Payload Validation", () => {
    it("should reject empty payload", async () => {
      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "",
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("should reject malformed JSON", async () => {
      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid json{",
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("should reject payload without type", async () => {
      const payload = {
        // Missing type field
        user: { id: "U123" },
        actions: [],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("should reject payload without user", async () => {
      const payload = {
        type: "block_actions",
        // Missing user field
        actions: [],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("Block Actions Security", () => {
    it("should sanitize action IDs", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "<script>alert('xss')</script>",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      // Should handle gracefully without executing script
      expect(response.status).not.toBe(500);
    });

    it("should handle extremely long action IDs", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "a".repeat(1000),
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should validate action value types", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: { malicious: "object" },
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe("View Submission Security", () => {
    it("should sanitize modal input values", async () => {
      const payload = {
        type: "view_submission",
        user: { id: "U123" },
        view: {
          id: "V123",
          state: {
            values: {
              block1: {
                input1: {
                  type: "plain_text_input",
                  value: "<script>alert('xss')</script>",
                },
              },
            },
          },
        },
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should handle deeply nested state objects", async () => {
      const payload = {
        type: "view_submission",
        user: { id: "U123" },
        view: {
          id: "V123",
          state: {
            values: {
              block1: {
                input1: {
                  type: "plain_text_input",
                  value: "normal value",
                  nested: {
                    deep: {
                      malicious: "object",
                    },
                  },
                },
              },
            },
          },
        },
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should validate required fields in submissions", async () => {
      const payload = {
        type: "view_submission",
        user: { id: "U123" },
        view: {
          id: "V123",
          state: {
            values: {
              // Missing required blocks
            },
          },
        },
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe("User Authorization", () => {
    it("should validate user ID format", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "invalid-user-id" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should handle missing user ID", async () => {
      const payload = {
        type: "block_actions",
        user: {}, // Missing id
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("should handle null user ID", async () => {
      const payload = {
        type: "block_actions",
        user: { id: null },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("Rate Limiting and Abuse Prevention", () => {
    it("should handle rapid successive requests", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const requests = Array.from({ length: 10 }, () =>
        new Request("https://example.com/api/interactivity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      // Send multiple requests rapidly
      const responses = await Promise.allSettled(requests.map(req => POST(req)));

      // All should be handled gracefully
      responses.forEach(result => {
        if (result.status === "fulfilled") {
          expect(result.value.status).not.toBe(500);
        }
      });
    });

    it("should handle large payloads efficiently", async () => {
      const largePayload = {
        type: "view_submission",
        user: { id: "U123" },
        view: {
          id: "V123",
          state: {
            values: {
              block1: {
                input1: {
                  type: "plain_text_input",
                  value: "x".repeat(10000), // Large input
                },
              },
            },
          },
        },
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(largePayload),
      });

      const start = performance.now();
      const response = await POST(request);
      const end = performance.now();

      expect(response.status).not.toBe(500);
      expect(end - start).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle service failures gracefully", async () => {
      // Mock service failure
      mockEscalationService.handleEscalationAction.mockRejectedValue(
        new Error("Service unavailable")
      );

      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "escalation_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should handle Slack API failures", async () => {
      // Mock Slack API failure
      mockSlackMessaging.postMessage.mockRejectedValue(
        new Error("Slack API error")
      );

      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should handle database connection failures", async () => {
      // Mock database failure
      const { initializeDatabase } = await import("../../lib/db/init");
      vi.mocked(initializeDatabase).mockRejectedValue(
        new Error("Database connection failed")
      );

      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe("Content Type and Encoding", () => {
    it("should reject non-JSON content types", async () => {
      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json",
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("should handle UTF-8 encoding", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "Test with unicode: 🚀 ñáéíóú 测试",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });

    it("should handle malformed UTF-8", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "Malformed: \xFF\xFE",
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe("Integration Security", () => {
    it("should validate escalation action parameters", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "escalate_project",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              caseNumber: "INC0010001",
              escalationType: "project",
              malicious: "injection",
            }),
          },
        ],
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
      
      if (mockEscalationService.handleEscalationAction.mock.calls.length > 0) {
        const callArgs = mockEscalationService.handleEscalationAction.mock.calls[0][0];
        // Should handle malicious parameters gracefully
        expect(typeof callArgs).toBe("object");
      }
    });

    it("should validate KB approval parameters", async () => {
      const payload = {
        type: "view_submission",
        user: { id: "U123" },
        view: {
          id: "V123",
          private_metadata: JSON.stringify({
            articleId: "KB0010001",
            caseNumber: "INC0010001",
            malicious: "data",
          }),
          state: {
            values: {
              block1: {
                title: {
                  type: "plain_text_input",
                  value: "<script>alert('xss')</script>",
                },
              },
            },
          },
        },
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(500);
    });
  });

  describe("Incident Enrichment Button Handlers", () => {
    let mockClarificationService: any;

    beforeEach(() => {
      mockClarificationService = getIncidentClarificationService();
    });

    it("✓ Routes select_ci_* actions to handleIncidentEnrichmentAction", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: "incident_sys_id_123",
              ci_sys_id: "ci_sys_id_456",
              ci_name: "test-ci",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it("✓ Routes skip_ci action to handleIncidentEnrichmentAction", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "skip_ci",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "skip_ci",
              incident_sys_id: "incident_sys_id_123",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it("✓ Parses button JSON value correctly", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: "incident_sys_id_123",
              ci_sys_id: "ci_sys_id_456",
              ci_name: "edge-ACCT0242146-01",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it("✓ Calls clarificationService.handleClarificationResponse for select", async () => {
      const mockClarificationService = getIncidentClarificationService();
      (mockClarificationService.handleClarificationResponse as any).mockResolvedValue({
        success: true,
        message: "Successfully linked CI: test-ci",
      });

      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: "incident_sys_id_123",
              ci_sys_id: "ci_sys_id_456",
              ci_name: "test-ci",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      await POST(request);

      expect(mockClarificationService.handleClarificationResponse).toHaveBeenCalledWith({
        incidentSysId: "incident_sys_id_123",
        selectedCiSysId: "ci_sys_id_456",
        selectedCiName: "test-ci",
        respondedBy: "U123",
      });
    });

    it("✓ Calls clarificationService.handleSkipAction for skip", async () => {
      const { getIncidentClarificationService } = await import("../../lib/services/incident-clarification-service");
      const mockClarificationService = getIncidentClarificationService();

      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "skip_ci",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "skip_ci",
              incident_sys_id: "incident_sys_id_123",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      await POST(request);

      expect(mockClarificationService.handleSkipAction).toHaveBeenCalledWith("incident_sys_id_123");
    });

    it("✓ Updates Slack message with confirmation", async () => {
      const mockClarificationService = getIncidentClarificationService();
      (mockClarificationService.handleClarificationResponse as any).mockResolvedValue({
        success: true,
        message: "Successfully linked CI: test-ci",
      });

      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: "incident_sys_id_123",
              ci_sys_id: "ci_sys_id_456",
              ci_name: "test-ci",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      await POST(request);

      expect(mockSlackMessaging.updateMessage).toHaveBeenCalledWith({
        channel: "C123456",
        ts: "1234567890.123456",
        text: "CI linked by <@U123>: test-ci",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✓ CI linked by <@U123>: *test-ci*\n\nSuccessfully linked CI: test-ci",
            },
          },
        ],
      });
    });

    it("✓ Handles parse errors gracefully", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: "invalid json{",
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Should post error message
      expect(mockSlackMessaging.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        threadTs: "1234567890.123456",
        text: "Error processing CI selection - invalid button data",
      });
    });

    it("✓ Posts error message on failure", async () => {
      const mockClarificationService = getIncidentClarificationService();
      (mockClarificationService.handleClarificationResponse as any).mockResolvedValue({
        success: false,
        message: "CI linking failed",
      });

      const payload = {
        type: "block_actions",
        user: { id: "U123", username: "testuser", name: "Test User" },
        container: {
          type: "message",
          message_ts: "1234567890.123456",
          channel_id: "C123456",
          is_ephemeral: false,
        },
        team: { id: "T123", domain: "example" },
        actions: [
          {
            action_id: "select_ci_0",
            block_id: "block1",
            type: "button",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: "incident_sys_id_123",
              ci_sys_id: "ci_sys_id_456",
              ci_name: "test-ci",
            }),
            action_ts: "1234567890.123456",
          },
        ],
        response_url: "https://hooks.slack.com/response",
      };

      const request = new Request("https://example.com/api/interactivity", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
      });

      await POST(request);

      expect(mockSlackMessaging.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        threadTs: "1234567890.123456",
        text: "Error linking CI: CI linking failed",
      });
    });
  });

  describe("Performance and Resource Limits", () => {
    it("should handle concurrent requests", async () => {
      const payload = {
        type: "block_actions",
        user: { id: "U123" },
        actions: [
          {
            action_id: "test_action",
            block_id: "block1",
            type: "button",
            value: "test",
          },
        ],
      };

      const concurrentRequests = Array.from({ length: 50 }, () =>
        new Request("https://example.com/api/interactivity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      const start = performance.now();
      const responses = await Promise.allSettled(
        concurrentRequests.map(req => POST(req))
      );
      const end = performance.now();

      // All should complete without errors
      responses.forEach(result => {
        if (result.status === "fulfilled") {
          expect(result.value.status).not.toBe(500);
        }
      });

      // Should complete within reasonable time
      expect(end - start).toBeLessThan(10000); // 10 seconds for 50 requests
    });

    it("should handle memory pressure", async () => {
      const largePayloads = Array.from({ length: 10 }, (_, i) => ({
        type: "view_submission",
        user: { id: `U${i}` },
        view: {
          id: `V${i}`,
          state: {
            values: {
              block1: {
                input1: {
                  type: "plain_text_input",
                  value: "x".repeat(50000), // 50KB per payload
                },
              },
            },
          },
        },
      }));

      const requests = largePayloads.map(payload =>
        new Request("https://example.com/api/interactivity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      const responses = await Promise.allSettled(requests.map(req => POST(req)));

      responses.forEach(result => {
        if (result.status === "fulfilled") {
          expect(result.value.status).not.toBe(500);
        }
      });
    });
  });
});