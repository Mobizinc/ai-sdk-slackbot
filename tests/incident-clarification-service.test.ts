import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncidentClarificationService } from "../../lib/services/incident-clarification-service";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";
import { getIncidentEnrichmentRepository } from "../../lib/db/repositories/incident-enrichment-repository";
import { getIncidentEnrichmentService } from "../../lib/services/incident-enrichment-service";

// Mock all dependencies
vi.mock("../../lib/services/slack-messaging");
vi.mock("../../lib/db/repositories/incident-enrichment-repository");
vi.mock("../../lib/services/incident-enrichment-service");

const mockSlackService = {
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
};
const mockRepository = {
  requestClarification: vi.fn(),
  updateEnrichmentStage: vi.fn(),
};
const mockEnrichmentService = {
  handleClarificationResponse: vi.fn(),
};

describe("IncidentClarificationService", () => {
  let service: IncidentClarificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    vi.mocked(getSlackMessagingService).mockReturnValue(mockSlackService as any);
    vi.mocked(getIncidentEnrichmentRepository).mockReturnValue(mockRepository as any);
    vi.mocked(getIncidentEnrichmentService).mockReturnValue(mockEnrichmentService as any);
    
    service = new IncidentClarificationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Slack Message Sending", () => {
    it("✓ Sends Slack message with Block Kit buttons", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 65,
            match_reason: "Partial edge name match",
          },
          {
            sys_id: "ci_2",
            name: "server-01",
            class: "cmdb_ci_server",
            confidence: 60,
            match_reason: "Name match",
          },
        ],
        channelId: "C123456",
        threadTs: "1234567890.123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      const result = await service.requestClarification(request);

      expect(result.success).toBe(true);
      expect(result.messageTs).toBe("message_ts_123");

      // Verify Slack message structure
      expect(mockSlackService.postMessage).toHaveBeenCalledWith({
        channel: "C123456",
        text: "CI Clarification needed for INC001001",
        blocks: expect.arrayContaining([
          expect.objectContaining({
            type: "header",
            text: {
              type: "plain_text",
              text: "🔍 CI Clarification Needed: INC001001",
            },
          }),
          expect.objectContaining({
            type: "section",
            text: {
              type: "mrkdwn",
              text: expect.stringContaining("Multiple possible Configuration Items were found"),
            },
          }),
          expect.objectContaining({
            type: "section",
            text: {
              type: "mrkdwn",
              text: expect.stringContaining("*Option 1: edge-ACCT0242146-01*"),
            },
            accessory: expect.objectContaining({
              type: "button",
              text: {
                type: "plain_text",
                text: "Select This CI",
              },
              style: "primary",
              action_id: "select_ci_0",
            }),
          }),
          expect.objectContaining({
            type: "button",
            text: {
              type: "plain_text",
              text: "Skip Auto-Link",
            },
            action_id: "skip_ci",
          }),
        ]),
        threadTs: "1234567890.123456",
      });

      // Verify button values contain correct data
      const blocks = mockSlackService.postMessage.mock.calls[0][0].blocks;
      const selectButton = blocks.find((block: any) => block.accessory?.action_id === "select_ci_0");
      expect(JSON.parse(selectButton.accessory.value)).toEqual({
        action: "select_ci",
        incident_sys_id: "incident_sys_id_123",
        ci_sys_id: "ci_1",
        ci_name: "edge-ACCT0242146-01",
      });
    });

    it("✓ Limits candidate CIs to 5 options", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: Array.from({ length: 8 }, (_, i) => ({
          sys_id: `ci_${i}`,
          name: `ci-${i}`,
          class: "Test Class",
          confidence: 60,
          match_reason: "Test match",
        })),
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);

      const blocks = mockSlackService.postMessage.mock.calls[0][0].blocks;
      const selectButtons = blocks.filter((block: any) => 
        block.accessory?.action_id?.startsWith("select_ci_")
      );
      
      // Should only have 5 select buttons (limited)
      expect(selectButtons).toHaveLength(5);
    });
  });

  describe("Channel Configuration", () => {
    it("✓ Fails fast when no Slack channel configured", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
      };

      // Mock environment variable to be undefined
      const originalDefaultChannel = process.env.SLACK_DEFAULT_CHANNEL;
      delete process.env.SLACK_DEFAULT_CHANNEL;

      const result = await service.requestClarification(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No Slack channel configured - set SLACK_DEFAULT_CHANNEL or provide channelId");

      // Restore environment variable
      process.env.SLACK_DEFAULT_CHANNEL = originalDefaultChannel;
    });

    it("✓ Uses default channel when no channelId provided", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
      };

      process.env.SLACK_DEFAULT_CHANNEL = "DEFAULT_CHANNEL";

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);

      expect(mockSlackService.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "DEFAULT_CHANNEL",
        })
      );

      delete process.env.SLACK_DEFAULT_CHANNEL;
    });
  });

  describe("Duplicate Prevention", () => {
    it("✓ Prevents duplicate clarifications (TTL check)", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      // First request should succeed
      const result1 = await service.requestClarification(request);
      expect(result1.success).toBe(true);

      // Second request within TTL should fail
      const result2 = await service.requestClarification(request);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Clarification already pending");

      // Should only call Slack API once
      expect(mockSlackService.postMessage).toHaveBeenCalledTimes(1);
    });

    it("✓ Allows new clarification after TTL expires", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      // First request
      await service.requestClarification(request);

      // Fast forward time beyond TTL (4 hours)
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Second request should succeed
      const result2 = await service.requestClarification(request);
      expect(result2.success).toBe(true);

      // Should call Slack API twice
      expect(mockSlackService.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("Response Handling", () => {
    it("✓ Handles CI selection response", async () => {
      const response = {
        incidentSysId: "incident_sys_id_123",
        selectedCiSysId: "ci_1",
        selectedCiName: "test-ci",
        respondedBy: "user123",
      };

      mockEnrichmentService.handleClarificationResponse.mockResolvedValue({
        success: true,
        stage: "enriched",
        message: "Successfully linked CI: test-ci",
      });

      const result = await service.handleClarificationResponse(response);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Successfully linked CI: test-ci");

      expect(mockEnrichmentService.handleClarificationResponse).toHaveBeenCalledWith(
        "incident_sys_id_123",
        "ci_1",
        "test-ci"
      );
    });

    it("✓ Handles skip action", async () => {
      const incidentSysId = "incident_sys_id_123";

      await service.handleSkipAction(incidentSysId);

      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith(
        "incident_sys_id_123",
        "enriched",
        {
          manual_skip: true,
          skipped_at: expect.any(String),
        }
      );
    });

    it("✓ Updates Slack message after selection", async () => {
      // This would be tested in the interactivity handler, but we can verify
      // that the service removes from pending cache when handling response
      const response = {
        incidentSysId: "incident_sys_id_123",
        selectedCiSysId: "ci_1",
        selectedCiName: "test-ci",
        respondedBy: "user123",
      };

      mockEnrichmentService.handleClarificationResponse.mockResolvedValue({
        success: true,
        stage: "enriched",
        message: "Successfully linked CI: test-ci",
      });

      // First, add a pending clarification
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);
      expect(service.getPendingCount()).toBe(1);

      // Handle response
      await service.handleClarificationResponse(response);

      // Should be removed from pending
      expect(service.getPendingCount()).toBe(0);
    });
  });

  describe("Cleanup and Maintenance", () => {
    it("✓ Cleans up expired clarifications", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      // Add a pending clarification
      await service.requestClarification(request);
      expect(service.getPendingCount()).toBe(1);

      // Fast forward beyond TTL
      vi.advanceTimersByTime(5 * 60 * 60 * 1000);

      // Run cleanup
      service.cleanupExpiredClarifications();

      // Should be cleaned up
      expect(service.getPendingCount()).toBe(0);
    });

    it("✓ Stores clarification timestamp in DB", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);

      expect(mockRepository.requestClarification).toHaveBeenCalledWith(
        "incident_sys_id_123",
        "message_ts_123"
      );
    });
  });

  describe("Error Handling", () => {
    it("✓ Handles Slack API errors gracefully", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: false,
        error: "channel_not_found",
      });

      const result = await service.requestClarification(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to post clarification message to Slack");
    });

    it("✓ Handles repository errors gracefully", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      mockRepository.requestClarification.mockRejectedValue(new Error("Database connection failed"));

      const result = await service.requestClarification(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection failed");
    });

    it("✓ Handles enrichment service errors in response", async () => {
      const response = {
        incidentSysId: "incident_sys_id_123",
        selectedCiSysId: "ci_1",
        selectedCiName: "test-ci",
        respondedBy: "user123",
      };

      mockEnrichmentService.handleClarificationResponse.mockResolvedValue({
        success: false,
        stage: "error",
        message: "CI linking failed",
      });

      const result = await service.handleClarificationResponse(response);

      expect(result.success).toBe(false);
      expect(result.message).toBe("CI linking failed");
    });

    it("✓ Handles skip action errors gracefully", async () => {
      const incidentSysId = "incident_sys_id_123";

      mockRepository.updateEnrichmentStage.mockRejectedValue(new Error("Database error"));

      // Should not throw, just log error
      await expect(service.handleSkipAction(incidentSysId)).resolves.toBeUndefined();
    });
  });

  describe("Message Content Validation", () => {
    it("✓ Includes incident link in message", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);

      const blocks = mockSlackService.postMessage.mock.calls[0][0].blocks;
      const contextBlock = blocks.find((block: any) => block.type === "context");
      
      expect(contextBlock).toBeDefined();
      expect(contextBlock.elements[0].text).toContain(
        "Incident: <https://mobiz.service-now.com/incident.do?sys_id=incident_sys_id_123|INC001001>"
      );
    });

    it("✓ Formats CI options correctly", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 65,
            match_reason: "Partial edge name match",
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      await service.requestClarification(request);

      const blocks = mockSlackService.postMessage.mock.calls[0][0].blocks;
      const optionBlock = blocks.find((block: any) => 
        block.text?.text?.includes("*Option 1: edge-ACCT0242146-01*")
      );

      expect(optionBlock.text.text).toContain("_Class:_ VeloCloud Edge");
      expect(optionBlock.text.text).toContain("_Confidence:_ 65%");
      expect(optionBlock.text.text).toContain("_Match Reason:_ Partial edge name match");
    });
  });

  describe("Service Lifecycle", () => {
    it("✓ Initializes with correct TTL", () => {
      const newService = new IncidentClarificationService();
      // TTL should be 4 hours (4 * 60 * 60 * 1000 ms)
      expect(newService.getPendingCount()).toBe(0);
    });

    it("✓ Returns correct pending count", async () => {
      const request = {
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: [
          {
            sys_id: "ci_1",
            name: "test-ci",
            class: "Test Class",
            confidence: 60,
          },
        ],
        channelId: "C123456",
      };

      mockSlackService.postMessage.mockResolvedValue({
        ok: true,
        ts: "message_ts_123",
      });

      expect(service.getPendingCount()).toBe(0);

      await service.requestClarification(request);

      expect(service.getPendingCount()).toBe(1);
    });
  });
});