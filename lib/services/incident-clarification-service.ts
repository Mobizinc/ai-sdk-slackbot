/**
 * Incident Clarification Service
 * Handles Slack interactions for CI clarification when confidence is below threshold
 */

import { getSlackMessagingService } from "./slack-messaging";
import { getIncidentEnrichmentRepository } from "../db/repositories/incident-enrichment-repository";
import { getIncidentEnrichmentService } from "./incident-enrichment-service";

export interface ClarificationRequest {
  incidentSysId: string;
  incidentNumber: string;
  candidateCIs: Array<{
    sys_id: string;
    name: string;
    class: string;
    confidence: number;
    match_reason?: string;
  }>;
  channelId?: string;
  threadTs?: string;
}

export interface ClarificationResponse {
  incidentSysId: string;
  selectedCiSysId: string;
  selectedCiName: string;
  respondedBy: string;
}

export class IncidentClarificationService {
  private pendingClarifications: Map<
    string,
    { requestedAt: Date; messageTs: string }
  > = new Map();
  private clarificationTTL: number = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

  constructor() {
    console.log(
      `[Incident Clarification Service] Initialized with TTL: ${this.clarificationTTL / 1000 / 60} minutes`
    );
  }

  /**
   * Send CI clarification request to Slack
   * Posts interactive message asking technician to select correct CI
   */
  public async requestClarification(
    request: ClarificationRequest
  ): Promise<{ success: boolean; messageTs?: string; error?: string }> {
    console.log(
      `[Incident Clarification Service] Requesting clarification for ${request.incidentNumber}`,
      {
        candidateCount: request.candidateCIs.length,
        channelId: request.channelId,
      }
    );

    // Check if clarification already pending
    const existing = this.pendingClarifications.get(request.incidentSysId);
    if (existing) {
      const age = Date.now() - existing.requestedAt.getTime();
      if (age < this.clarificationTTL) {
        console.log(
          `[Incident Clarification Service] Clarification already pending for ${request.incidentNumber} (age: ${Math.round(age / 1000 / 60)} minutes)`
        );
        return {
          success: false,
          error: "Clarification already pending",
        };
      } else {
        // TTL expired, remove from cache
        this.pendingClarifications.delete(request.incidentSysId);
      }
    }

    try {
      const slack = getSlackMessagingService();
      const repository = getIncidentEnrichmentRepository();

      // Build message blocks
      const blocks: any[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `🔍 CI Clarification Needed: ${request.incidentNumber}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Multiple possible Configuration Items were found, but none with high enough confidence to auto-link.\n\nPlease select the correct CI for this incident:`,
          },
        },
        {
          type: "divider",
        },
      ];

      // Add candidate CI options
      request.candidateCIs.slice(0, 5).forEach((ci, index) => {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Option ${index + 1}: ${ci.name}*\n_Class:_ ${ci.class}\n_Confidence:_ ${ci.confidence}%\n_Match Reason:_ ${ci.match_reason || "N/A"}`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Select This CI",
            },
            style: "primary",
            value: JSON.stringify({
              action: "select_ci",
              incident_sys_id: request.incidentSysId,
              ci_sys_id: ci.sys_id,
              ci_name: ci.name,
            }),
            action_id: `select_ci_${index}`,
          },
        });
      });

      // Add "None of the above" option
      blocks.push({
        type: "divider",
      });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*None of the above match?*\nYou can manually link the CI in ServiceNow.`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Skip Auto-Link",
          },
          value: JSON.stringify({
            action: "skip_ci",
            incident_sys_id: request.incidentSysId,
          }),
          action_id: "skip_ci",
        },
      });

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Incident: <https://mobiz.service-now.com/incident.do?sys_id=${request.incidentSysId}|${request.incidentNumber}>`,
          },
        ],
      });

      // Post to Slack
      const targetChannel = request.channelId || process.env.SLACK_DEFAULT_CHANNEL;

      if (!targetChannel) {
        console.error(
          `[Incident Clarification Service] No Slack channel configured for ${request.incidentNumber}`
        );
        return {
          success: false,
          error: "No Slack channel configured - set SLACK_DEFAULT_CHANNEL or provide channelId",
        };
      }

      const messageResult = await slack.postMessage({
        channel: targetChannel,
        text: `CI Clarification needed for ${request.incidentNumber}`,
        blocks,
        threadTs: request.threadTs,
      });

      if (!messageResult.ok || !messageResult.ts) {
        throw new Error("Failed to post clarification message to Slack");
      }

      // Store in pending cache
      this.pendingClarifications.set(request.incidentSysId, {
        requestedAt: new Date(),
        messageTs: messageResult.ts,
      });

      // Update repository
      await repository.requestClarification(request.incidentSysId, messageResult.ts);

      console.log(
        `[Incident Clarification Service] Clarification sent for ${request.incidentNumber}`,
        {
          messageTs: messageResult.ts,
        }
      );

      return {
        success: true,
        messageTs: messageResult.ts,
      };
    } catch (error) {
      console.error(
        `[Incident Clarification Service] Error requesting clarification for ${request.incidentNumber}:`,
        error
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Handle CI selection from Slack interaction
   * Called when technician clicks a button in clarification message
   */
  public async handleClarificationResponse(
    response: ClarificationResponse
  ): Promise<{ success: boolean; message: string }> {
    console.log(
      `[Incident Clarification Service] Processing clarification response for ${response.incidentSysId}`,
      {
        ciSysId: response.selectedCiSysId,
        respondedBy: response.respondedBy,
      }
    );

    try {
      // Remove from pending cache
      this.pendingClarifications.delete(response.incidentSysId);

      // Use enrichment service to handle the response
      const enrichmentService = getIncidentEnrichmentService();
      const result = await enrichmentService.handleClarificationResponse(
        response.incidentSysId,
        response.selectedCiSysId,
        response.selectedCiName
      );

      if (result.success) {
        return {
          success: true,
          message: `Successfully linked CI: ${response.selectedCiName}`,
        };
      } else {
        return {
          success: false,
          message: result.message,
        };
      }
    } catch (error) {
      console.error(
        `[Incident Clarification Service] Error handling clarification response:`,
        error
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Handle "skip" action - user chose none of the CIs
   */
  public async handleSkipAction(incidentSysId: string): Promise<void> {
    console.log(
      `[Incident Clarification Service] User skipped CI selection for ${incidentSysId}`
    );

    try {
      const repository = getIncidentEnrichmentRepository();

      // Mark as enriched without CI link
      await repository.updateEnrichmentStage(incidentSysId, "enriched", {
        manual_skip: true,
        skipped_at: new Date().toISOString(),
      });

      // Remove from pending cache
      this.pendingClarifications.delete(incidentSysId);

      console.log(
        `[Incident Clarification Service] Incident ${incidentSysId} marked as enriched (CI skipped)`
      );
    } catch (error) {
      console.error(
        `[Incident Clarification Service] Error handling skip action:`,
        error
      );
    }
  }

  /**
   * Clean up expired clarifications from cache
   */
  public cleanupExpiredClarifications(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [incidentSysId, data] of this.pendingClarifications.entries()) {
      const age = now - data.requestedAt.getTime();
      if (age > this.clarificationTTL) {
        this.pendingClarifications.delete(incidentSysId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `[Incident Clarification Service] Cleaned up ${cleaned} expired clarifications`
      );
    }
  }

  /**
   * Get pending clarification count
   */
  public getPendingCount(): number {
    return this.pendingClarifications.size;
  }
}

// Singleton instance
let serviceInstance: IncidentClarificationService | null = null;

export function getIncidentClarificationService(): IncidentClarificationService {
  if (!serviceInstance) {
    serviceInstance = new IncidentClarificationService();
    // Run cleanup every hour
    setInterval(() => {
      serviceInstance?.cleanupExpiredClarifications();
    }, 60 * 60 * 1000);
  }
  return serviceInstance;
}
