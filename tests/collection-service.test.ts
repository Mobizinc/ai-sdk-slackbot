import { describe, it, expect } from "vitest";
import { collectionService } from "../lib/services/muscle-memory/collection-service";
import type { InteractionCapture } from "../lib/services/muscle-memory/collection-service";

describe("CollectionService", () => {
  describe("shouldCaptureExemplar", () => {
    it("should approve high-quality successful interactions", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "VPN issue" },
        actionTaken: { agentType: "ServiceNow", workNotes: ["Escalated"] },
        outcome: "success",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(true);
      expect(decision.qualityScore).toBe(0.6); // 0.4 + 0.2
      expect(decision.reason).toContain("quality");
    });

    it("should reject low-quality interactions below threshold", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "Test" },
        actionTaken: { agentType: "ServiceNow" },
        outcome: "success",
        qualitySignals: [
          { type: "implicit", value: "clean_interaction", weight: 0.1, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(false);
      expect(decision.qualityScore).toBe(0.1);
      expect(decision.reason).toContain("below threshold");
    });

    it("should always reject failure outcomes regardless of quality", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "Test" },
        actionTaken: { agentType: "ServiceNow" },
        outcome: "failure",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(false);
      expect(decision.reason).toContain("Failure outcomes");
    });

    it("should require higher threshold for user-corrected interactions", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "Test" },
        actionTaken: { agentType: "ServiceNow" },
        outcome: "user_corrected",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      // Quality is 0.6, but user_corrected requires 0.7
      expect(decision.shouldCapture).toBe(false);
      expect(decision.reason).toContain("User-corrected");
    });

    it("should allow user-corrected interactions with sufficient quality", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "Test" },
        actionTaken: { agentType: "ServiceNow" },
        outcome: "user_corrected",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "human_feedback", value: "positive", weight: 0.3, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(true);
      expect(decision.qualityScore).toBe(0.9); // Above 0.7 threshold
    });
  });

  describe("summarizeContext", () => {
    it("should extract text from discovery pack", () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: {
          discoveryPack: {
            businessContext: { entityName: "Altus Healthcare" },
            slackRecent: {
              messages: [
                { text: "VPN connection failing intermittently" },
                { text: "Seeing packet loss to 10.52.0.4" },
              ],
            },
          },
          userRequest: "Help with VPN connectivity",
        },
        actionTaken: { agentType: "ServiceNow", workNotes: ["Escalated to network team"] },
        outcome: "success",
        qualitySignals: [],
      };

      const summary = collectionService.summarizeContext(interaction);

      expect(summary).toContain("Altus Healthcare");
      expect(summary).toContain("VPN");
      expect(summary.length).toBeGreaterThan(50);
      expect(summary.length).toBeLessThan(600); // Should be concise
    });

    it("should extract from case snapshot when discovery pack absent", () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "kb_generation",
        inputContext: {
          caseSnapshot: {
            short_description: "Azure VM won't start",
            priority: "2 - High",
          },
        },
        actionTaken: {
          agentType: "KBGeneration",
          kbArticle: { title: "How to restart Azure VMs", number: "KB0012345" },
        },
        outcome: "success",
        qualitySignals: [],
      };

      const summary = collectionService.summarizeContext(interaction);

      expect(summary).toContain("Azure VM");
      expect(summary).toContain("KB0012345");
    });

    it("should handle minimal context gracefully", () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: {},
        actionTaken: { agentType: "ServiceNow" },
        outcome: "success",
        qualitySignals: [],
      };

      const summary = collectionService.summarizeContext(interaction);

      expect(summary).toContain("SCS0123456");
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe("prepareExemplar", () => {
    it("should structure exemplar data for storage", () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: { userRequest: "Network issue" },
        actionTaken: {
          agentType: "ServiceNow",
          workNotes: ["Created incident INC0789012", "Escalated to L2"],
        },
        outcome: "success",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const qualityScore = 0.85;
      const exemplar = collectionService.prepareExemplar(interaction, qualityScore);

      expect(exemplar.caseNumber).toBe("SCS0123456");
      expect(exemplar.interactionType).toBe("triage");
      expect(exemplar.outcome).toBe("success");
      expect(exemplar.qualityScore).toBe(0.85);
      expect(exemplar.inputContext).toEqual(interaction.inputContext);
      expect(exemplar.actionTaken).toEqual(interaction.actionTaken);
      expect(exemplar.qualitySignals).toHaveProperty("supervisorApproval", true);
      expect(exemplar.qualitySignals).toHaveProperty("outcomeSuccess", true);
    });

    it("should include summary in prepared exemplar", () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: {
          userRequest: "Azure VPN tunnel down between on-prem and cloud",
        },
        actionTaken: {
          agentType: "ServiceNow",
          workNotes: ["Reset VPN gateway", "Verified connectivity restored"],
        },
        outcome: "success",
        qualitySignals: [],
      };

      const exemplar = collectionService.prepareExemplar(interaction, 0.8);

      expect(exemplar.summary).toBeDefined();
      expect(exemplar.summary).toContain("VPN");
      expect(exemplar.summary.length).toBeGreaterThan(20);
    });
  });

  describe("edge cases", () => {
    it("should handle empty quality signals array", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "triage",
        inputContext: {},
        actionTaken: { agentType: "ServiceNow" },
        outcome: "success",
        qualitySignals: [],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(false);
      expect(decision.qualityScore).toBe(0);
      expect(decision.reason).toContain("below threshold");
    });

    it("should handle unknown interaction types", async () => {
      const interaction: InteractionCapture = {
        caseNumber: "SCS0123456",
        interactionType: "custom_workflow" as any,
        inputContext: {},
        actionTaken: { agentType: "Custom" },
        outcome: "success",
        qualitySignals: [
          { type: "supervisor", value: "approved", weight: 0.4, recordedAt: new Date() },
          { type: "outcome", value: "success", weight: 0.2, recordedAt: new Date() },
        ],
      };

      const decision = await collectionService.shouldCaptureExemplar(interaction);

      expect(decision.shouldCapture).toBe(true); // Should work with any type
      expect(decision.qualityScore).toBe(0.6);
    });
  });
});
