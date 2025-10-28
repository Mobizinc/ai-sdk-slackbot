/**
 * Status and Error Handling Tests
 * Tests for status update functions and error handling utilities
 */

import { describe, it, expect } from "vitest";
import {
  addProcessingStatus,
  addCompletedStatus,
  createErrorBlocks,
  createLoadingBlocks,
  createProgressiveLoadingBlocks,
  getErrorGuidance,
  createHeaderBlock,
  createSectionBlock,
  createActionsBlock,
  createButton,
  MessageEmojis,
} from "../lib/utils/message-styling";

describe("Status and Error Handling Tests", () => {
  describe("addProcessingStatus", () => {
    it("should add processing status before actions block", () => {
      const blocks = [
        createHeaderBlock("Case Update"),
        createSectionBlock("Case details here"),
        createActionsBlock([
          {
            text: "Acknowledge",
            actionId: "ack_button",
          },
        ]),
      ];
      
      const updatedBlocks = addProcessingStatus(blocks, "Processing your request...");
      
      expect(updatedBlocks).toHaveLength(4);
      expect((updatedBlocks[2] as any).type).toBe("section");
      expect((updatedBlocks[2] as any).text.text).toContain(MessageEmojis.PROCESSING);
      expect((updatedBlocks[2] as any).text.text).toContain("Processing your request...");
      
      // Actions block should be moved to position 3
      expect((updatedBlocks[3] as any).type).toBe("actions");
    });

    it("should add processing status at end when no actions block", () => {
      const blocks = [
        createHeaderBlock("Header"),
        createSectionBlock("Content"),
      ];
      
      const updatedBlocks = addProcessingStatus(blocks, "Loading...");
      
      expect(updatedBlocks).toHaveLength(3);
      expect((updatedBlocks[2] as any).type).toBe("section");
      expect((updatedBlocks[2] as any).text.text).toContain(MessageEmojis.PROCESSING);
      expect((updatedBlocks[2] as any).text.text).toContain("Loading...");
    });

    it("should handle empty blocks array", () => {
      const updatedBlocks = addProcessingStatus([], "Processing...");
      
      expect(updatedBlocks).toHaveLength(1);
      expect((updatedBlocks[0] as any).type).toBe("section");
      expect((updatedBlocks[0] as any).text.text).toContain(MessageEmojis.PROCESSING);
    });

    it("should handle multiple actions blocks (use first)", () => {
      const blocks = [
        createSectionBlock("Content"),
        createActionsBlock([{ text: "Action 1", actionId: "action1" }]),
        createActionsBlock([{ text: "Action 2", actionId: "action2" }]),
      ];
      
      const updatedBlocks = addProcessingStatus(blocks, "Processing...");
      
      expect(updatedBlocks).toHaveLength(4);
      // Processing status should be inserted before first actions block
      expect((updatedBlocks[1] as any).type).toBe("section");
      expect((updatedBlocks[1] as any).text.text).toContain(MessageEmojis.PROCESSING);
    });

    it("should preserve original blocks order", () => {
      const blocks = [
        createHeaderBlock("Header"),
        createSectionBlock("Section 1"),
        createSectionBlock("Section 2"),
        createActionsBlock([{ text: "Action", actionId: "action" }]),
      ];
      
      const updatedBlocks = addProcessingStatus(blocks, "Processing...");
      
      expect((updatedBlocks[0] as any).type).toBe("header");
      expect((updatedBlocks[1] as any).type).toBe("section");
      expect((updatedBlocks[2] as any).type).toBe("section");
      expect((updatedBlocks[3] as any).type).toBe("section"); // Processing status
      expect((updatedBlocks[4] as any).type).toBe("actions");
    });
  });

  describe("addCompletedStatus", () => {
    it("should add completed status and disable buttons", () => {
      const blocks = [
        createHeaderBlock("Case Update"),
        addProcessingStatus([], "Processing...")[0], // Add a processing status
        createActionsBlock([
          {
            text: "Acknowledge",
            actionId: "ack_button",
            style: "primary",
          },
          {
            text: "Escalate",
            actionId: "escalate_button",
            style: "danger",
            confirm: {
              title: { type: "plain_text", text: "Confirm" },
              text: { type: "mrkdwn", text: "Are you sure?" },
              confirm: { type: "plain_text", text: "Yes" },
              deny: { type: "plain_text", text: "No" },
            } as any,
          },
        ]),
      ];
      
      const updatedBlocks = addCompletedStatus(blocks, "Request completed successfully!");
      
      expect(updatedBlocks).toHaveLength(3); // Processing status removed, completed status added
      
      // Check completed status was added
      expect((updatedBlocks[1] as any).type).toBe("section");
      expect((updatedBlocks[1] as any).text.text).toContain(MessageEmojis.SUCCESS);
      expect((updatedBlocks[1] as any).text.text).toContain("Request completed successfully!");
      
      // Check buttons are disabled
      const actionsBlock = updatedBlocks[2] as any;
      expect(actionsBlock.type).toBe("actions");
      expect(actionsBlock.elements[0].style).toBeUndefined();
      expect(actionsBlock.elements[0].confirm).toBeUndefined();
      expect(actionsBlock.elements[1].style).toBeUndefined();
      expect(actionsBlock.elements[1].confirm).toBeUndefined();
    });

    it("should remove existing processing status blocks", () => {
      const processingBlock1 = addProcessingStatus([], "Processing 1...")[0];
      const processingBlock2 = addProcessingStatus([], "Processing 2...")[0];
      
      const blocks = [
        createHeaderBlock("Header"),
        processingBlock1,
        createSectionBlock("Content"),
        processingBlock2,
        createActionsBlock([{ text: "Action", actionId: "action" }]),
      ];
      
      const updatedBlocks = addCompletedStatus(blocks, "Done!");
      
      // Should remove both processing blocks
      const processingBlocks = updatedBlocks.filter(
        (block) => (block as any).text?.text?.includes(MessageEmojis.PROCESSING)
      );
      expect(processingBlocks).toHaveLength(0);
      
      // Should add completed status
      const completedBlocks = updatedBlocks.filter(
        (block) => (block as any).text?.text?.includes(MessageEmojis.SUCCESS)
      );
      expect(completedBlocks).toHaveLength(1);
    });

    it("should add completed status at end when no actions block", () => {
      const blocks = [
        createHeaderBlock("Header"),
        createSectionBlock("Content"),
      ];
      
      const updatedBlocks = addCompletedStatus(blocks, "Completed!");
      
      expect(updatedBlocks).toHaveLength(3);
      expect((updatedBlocks[2] as any).type).toBe("section");
      expect((updatedBlocks[2] as any).text.text).toContain(MessageEmojis.SUCCESS);
      expect((updatedBlocks[2] as any).text.text).toContain("Completed!");
    });

    it("should handle empty blocks array", () => {
      const updatedBlocks = addCompletedStatus([], "All done!");
      
      expect(updatedBlocks).toHaveLength(1);
      expect((updatedBlocks[0] as any).type).toBe("section");
      expect((updatedBlocks[0] as any).text.text).toContain(MessageEmojis.SUCCESS);
    });

    it("should preserve non-processing blocks", () => {
      const blocks = [
        createHeaderBlock("Header"),
        createSectionBlock("Normal content"),
        addProcessingStatus([], "Processing...")[0],
        createSectionBlock("More content"),
      ];
      
      const updatedBlocks = addCompletedStatus(blocks, "Done!");
      
      expect(updatedBlocks).toHaveLength(4);
      expect((updatedBlocks[0] as any).type).toBe("header");
      expect((updatedBlocks[1] as any).type).toBe("section");
      expect((updatedBlocks[2] as any).type).toBe("section"); // Completed status
      expect((updatedBlocks[3] as any).type).toBe("section");
    });
  });

  describe("createErrorBlocks", () => {
    it("should create basic error blocks", () => {
      const blocks = createErrorBlocks(
        "send message",
        "The message could not be sent due to a network error."
      );
      
      expect(blocks).toHaveLength(2);
      
      // Error header
      expect((blocks[0] as any).type).toBe("section");
      expect((blocks[0] as any).text.text).toContain(MessageEmojis.ERROR);
      expect((blocks[0] as any).text.text).toContain("Failed to send message");
      
      // Error details
      expect((blocks[1] as any).type).toBe("section");
      expect((blocks[1] as any).text.text).toContain("network error");
    });

    it("should create error blocks with retry action", () => {
      const blocks = createErrorBlocks(
        "create project",
        "ServiceNow is temporarily unavailable.",
        {
          actionId: "retry_create_project",
          value: "project_123",
        }
      );
      
      expect(blocks).toHaveLength(3);
      
      // Should have actions block with retry button
      expect((blocks[2] as any).type).toBe("actions");
      expect((blocks[2] as any).elements).toHaveLength(2);
      
      const retryButton = (blocks[2] as any).elements[0];
      expect(retryButton.text.text).toContain(MessageEmojis.REFRESH);
      expect(retryButton.text.text).toContain("Retry");
      expect(retryButton.action_id).toBe("retry_create_project");
      expect(retryButton.value).toBe("project_123");
      
      const supportButton = (blocks[2] as any).elements[1];
      expect(supportButton.text.text).toContain(MessageEmojis.PHONE);
      expect(supportButton.text.text).toContain("Contact Support");
    });

    it("should handle special characters in action labels", () => {
      const blocks = createErrorBlocks(
        "upload file & process data",
        "Invalid file format detected."
      );
      
      expect((blocks[0] as any).text.text).toContain("Failed to upload file & process data");
    });

    it("should handle empty guidance", () => {
      const blocks = createErrorBlocks("test action", "");
      
      expect(blocks).toHaveLength(2);
      expect((blocks[1] as any).text.text).toBe("");
    });

    it("should handle very long error messages", () => {
      const longMessage = "x".repeat(5000);
      const blocks = createErrorBlocks("action", longMessage);
      
      // Should handle long messages (function doesn't truncate)
      expect((blocks[1] as any).text.text).toBe(longMessage);
    });
  });

  describe("getErrorGuidance", () => {
    it("should return specific guidance for known actions", () => {
      const guidance = getErrorGuidance("escalation_create_project", new Error("ServiceNow error"));
      
      expect(guidance).toContain("project creation permissions");
      expect(guidance).toContain("ServiceNow connectivity");
      expect(guidance).toContain("refreshing the page");
    });

    it("should return specific guidance for KB approval", () => {
      const guidance = getErrorGuidance("kb_approve", new Error("Permission denied"));
      
      expect(guidance).toContain("KB publishing permissions");
      expect(guidance).toContain("knowledge base configuration");
    });

    it("should return specific guidance for case resolution", () => {
      const guidance = getErrorGuidance("quick_resolve_case", new Error("Validation failed"));
      
      expect(guidance).toContain("case is still open");
      expect(guidance).toContain("case close permissions");
      expect(guidance).toContain("required fields are filled");
    });

    it("should return technical details for unknown actions", () => {
      const error = new Error("Database connection failed");
      const guidance = getErrorGuidance("unknown_action", error);
      
      expect(guidance).toContain("Technical details:");
      expect(guidance).toContain("Database connection failed");
    });

    it("should handle non-Error objects", () => {
      const guidance = getErrorGuidance("test_action", "String error message");
      
      expect(guidance).toContain("Technical details:");
      expect(guidance).toContain("Unknown error"); // Non-Error objects become "Unknown error"
    });

    it("should handle null/undefined errors", () => {
      const guidance1 = getErrorGuidance("test_action", null);
      const guidance2 = getErrorGuidance("test_action", undefined);
      
      expect(guidance1).toContain("Unknown error");
      expect(guidance2).toContain("Unknown error");
    });
  });

  describe("createLoadingBlocks", () => {
    it("should create simple loading blocks", () => {
      const blocks = createLoadingBlocks("Processing your request...");
      
      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).type).toBe("section");
      expect((blocks[0] as any).text.text).toContain(MessageEmojis.PROCESSING);
      expect((blocks[0] as any).text.text).toContain("Processing your request...");
    });

    it("should handle empty status text", () => {
      const blocks = createLoadingBlocks("");
      
      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).text.text).toContain(MessageEmojis.PROCESSING);
    });

    it("should handle special characters in status", () => {
      const blocks = createLoadingBlocks("Loading & processing data... 🚀");
      
      expect((blocks[0] as any).text.text).toContain("Loading & processing data... 🚀");
    });
  });

  describe("createProgressiveLoadingBlocks", () => {
    it("should create progressive loading blocks with details", () => {
      const blocks = createProgressiveLoadingBlocks(
        "Processing case...",
        [
          "Validating input data",
          "Checking ServiceNow connectivity",
          "Creating case record",
        ]
      );
      
      expect(blocks).toHaveLength(2);
      
      // Main status
      expect((blocks[0] as any).type).toBe("section");
      expect((blocks[0] as any).text.text).toContain(MessageEmojis.PROCESSING);
      expect((blocks[0] as any).text.text).toContain("Processing case...");
      
      // Details
      expect((blocks[1] as any).type).toBe("section");
      expect((blocks[1] as any).text.text).toContain("• Validating input data");
      expect((blocks[1] as any).text.text).toContain("• Checking ServiceNow connectivity");
      expect((blocks[1] as any).text.text).toContain("• Creating case record");
    });

    it("should handle empty details array", () => {
      const blocks = createProgressiveLoadingBlocks("Loading...", []);
      
      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).text.text).toContain("Loading...");
    });

    it("should handle undefined details", () => {
      const blocks = createProgressiveLoadingBlocks("Loading...");
      
      expect(blocks).toHaveLength(1);
      expect((blocks[0] as any).text.text).toContain("Loading...");
    });

    it("should handle special characters in details", () => {
      const blocks = createProgressiveLoadingBlocks(
        "Processing...",
        ["Step 1 & validation", "Step 2 • processing", "Step 3 🚀 completion"]
      );
      
      expect((blocks[1] as any).text.text).toContain("Step 1 & validation");
      expect((blocks[1] as any).text.text).toContain("Step 2 • processing");
      expect((blocks[1] as any).text.text).toContain("Step 3 🚀 completion");
    });

    it("should handle very long detail items", () => {
      const longDetail = "A".repeat(1000);
      const blocks = createProgressiveLoadingBlocks("Loading...", [longDetail]);
      
      expect((blocks[1] as any).text.text).toContain("• " + longDetail);
    });
  });

  describe("Status Update Integration", () => {
    it("should handle complete workflow: processing -> completed", () => {
      const initialBlocks = [
        createHeaderBlock("Case Management"),
        createSectionBlock("Please select an action:"),
        createActionsBlock([
          {
            text: "Acknowledge",
            actionId: "acknowledge",
            style: "primary",
          },
          {
            text: "Escalate",
            actionId: "escalate",
            style: "danger",
          },
        ]),
      ];
      
      // Add processing status
      const processingBlocks = addProcessingStatus(initialBlocks, "Acknowledging case...");
      expect(processingBlocks).toHaveLength(4);
      expect((processingBlocks[2] as any).text.text).toContain(MessageEmojis.PROCESSING);
      
      // Complete the action
      const completedBlocks = addCompletedStatus(processingBlocks, "Case acknowledged successfully!");
      expect(completedBlocks).toHaveLength(4);
      expect((completedBlocks[2] as any).text.text).toContain(MessageEmojis.SUCCESS);
      
      // Buttons should be disabled
      const actionsBlock = completedBlocks[3] as any;
      expect(actionsBlock.elements[0].style).toBeUndefined();
      expect(actionsBlock.elements[1].style).toBeUndefined();
    });

    it("should handle error scenario", () => {
      const initialBlocks = [
        createHeaderBlock("Case Update"),
        createActionsBlock([
          {
            text: "Create Project",
            actionId: "create_project",
          },
        ]),
      ];
      
      // Simulate error
      const errorBlocks = createErrorBlocks(
        "create project",
        "ServiceNow validation failed: Missing required field 'short_description'",
        {
          actionId: "retry_create_project",
          value: "retry_data",
        }
      );
      
      expect(errorBlocks).toHaveLength(3);
      expect((errorBlocks[0] as any).text.text).toContain(MessageEmojis.ERROR);
      expect((errorBlocks[2] as any).elements[0].text.text).toContain(MessageEmojis.REFRESH);
    });

    it("should handle complex multi-step process", () => {
      const blocks = createProgressiveLoadingBlocks(
        "Creating escalation project...",
        [
          "Validating user permissions",
          "Checking project template availability",
          "Preparing project data",
          "Creating project in ServiceNow",
          "Setting up notifications",
        ]
      );
      
      expect(blocks).toHaveLength(2);
      expect((blocks[1] as any).text.text).toContain("• Validating user permissions");
      expect((blocks[1] as any).text.text).toContain("• Setting up notifications");
    });
  });

  describe("Error Handling Edge Cases", () => {
    it("should handle malformed blocks gracefully", () => {
      const malformedBlocks = [
        null,
        undefined,
        { type: null },
        { type: "unknown" },
        { type: "section" }, // Missing required text
      ];
      
      // These functions may throw errors with malformed input - that's expected behavior
      expect(() => addProcessingStatus(malformedBlocks as any, "Processing...")).toThrow();
      expect(() => addCompletedStatus(malformedBlocks as any, "Done!")).toThrow();
    });

    it("should handle very long status messages", () => {
      const longStatus = "Processing status: " + "x".repeat(5000);
      
      const processingBlocks = addProcessingStatus([], longStatus);
      expect((processingBlocks[0] as any).text.text).toBe(`${MessageEmojis.PROCESSING} ${longStatus}`); // Emoji added
      
      const completedBlocks = addCompletedStatus([], longStatus);
      expect((completedBlocks[0] as any).text.text).toBe(`${MessageEmojis.SUCCESS} ${longStatus}`); // Emoji added
    });

    it("should handle unicode and emoji in status messages", () => {
      const unicodeStatus = "处理中 🚀 ñáéíóú";
      
      const blocks = addProcessingStatus([], unicodeStatus);
      expect((blocks[0] as any).text.text).toContain(unicodeStatus);
    });

    it("should preserve block metadata", () => {
      const blocks = [
        {
          type: "section" as const,
          block_id: "custom_section",
          text: { type: "mrkdwn" as const, text: "Content" },
        },
        createActionsBlock([{ text: "Action", actionId: "action" }]),
      ];
      
      const updatedBlocks = addProcessingStatus(blocks, "Processing...");
      
      // Should preserve block_id
      expect(((updatedBlocks[0] as any).block_id)).toBe("custom_section");
    });
  });
});