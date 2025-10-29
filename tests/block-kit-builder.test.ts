/**
 * Block Kit Builder Function Tests
 * Tests for all block creation and builder functions
 */

import { describe, it, expect } from "vitest";
import {
  createHeaderBlock,
  createSectionBlock,
  createFieldsBlock,
  createDivider,
  createContextBlock,
  createActionsBlock,
  createImageBlock,
  createFileBlock,
  createButton,
  createOverflowMenu,
  truncateText,
  validateBlockCount,
  validateFieldsArray,
  validateContextElements,
  validateSelectOptions,
  validateTextLength,
  validateActionId,
  validateBlockId,
} from "../lib/utils/message-styling";

describe("Block Kit Builder Functions", () => {
  describe("createHeaderBlock", () => {
    it("should create a valid header block", () => {
      const block = createHeaderBlock("Test Header");
      
      expect((block as any).type).toBe("header");
      expect((block as any).text.type).toBe("plain_text");
      expect((block as any).text.text).toBe("Test Header");
      expect((block as any).text.emoji).toBe(true);
    });

    it("should handle empty text", () => {
      const block = createHeaderBlock("");
      
      expect((block as any).text.text).toBe("");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle long text within limits", () => {
      const longText = "A".repeat(150); // Header limit is 150 chars
      const block = createHeaderBlock(longText);
      
      expect((block as any).text.text).toBe(longText);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle long text without truncation", () => {
      const tooLongText = "x".repeat(200);
      const block = createHeaderBlock(tooLongText);
      
      // Function doesn't truncate, returns text as-is
      expect((block as any).text.text).toBe(tooLongText);
      expect((block as any).text.text.length).toBe(200);
    });
  });

  describe("createSectionBlock", () => {
    it("should create a valid section block with text", () => {
      const block = createSectionBlock("Test section text");
      
      expect((block as any).type).toBe("section");
      expect((block as any).text.type).toBe("mrkdwn");
      expect((block as any).text.text).toBe("Test section text");
    });

    it("should create a section block with accessory", () => {
      const button = createButton({
        text: "Click me",
        actionId: "test_button",
      });
      
      const block = createSectionBlock("Text with button", button);
      
      expect((block as any).type).toBe("section");
      expect((block as any).accessory).toBeDefined();
      expect((block as any).accessory.type).toBe("button");
      expect((block as any).accessory.action_id).toBe("test_button");
    });

    it("should handle empty text", () => {
      const block = createSectionBlock("");
      
      expect((block as any).text.text).toBe("");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle markdown formatting", () => {
      const markdownText = "*Bold* _italic_ `code`";
      const block = createSectionBlock(markdownText);
      
      expect((block as any).text.text).toBe(markdownText);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });
  });

  describe("createFieldsBlock", () => {
    it("should create a valid fields block", () => {
      const fields = [
        { label: "Status", value: "Open" },
        { label: "Priority", value: "High" },
      ];
      
      const block = createFieldsBlock(fields);
      
      expect((block as any).type).toBe("section");
      expect((block as any).fields).toHaveLength(2);
      expect((block as any).fields[0].type).toBe("mrkdwn");
      expect((block as any).fields[0].text).toBe("*Status:*\nOpen");
      expect((block as any).fields[1].text).toBe("*Priority:*\nHigh");
    });

    it("should handle empty fields array", () => {
      const block = createFieldsBlock([]);
      
      expect((block as any).fields).toHaveLength(0);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle maximum fields (10)", () => {
      const fields = Array.from({ length: 10 }, (_, i) => ({
        label: `Field ${i}`,
        value: `Value ${i}`,
      }));
      
      const block = createFieldsBlock(fields);
      
      expect((block as any).fields).toHaveLength(10);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle many fields without validation", () => {
      const fields = Array.from({ length: 11 }, (_, i) => ({
        label: `Field ${i}`,
        value: `Value ${i}`,
      }));
      
      // Function doesn't validate field count
      expect(() => createFieldsBlock(fields)).not.toThrow();
      const block = createFieldsBlock(fields);
      expect((block as any).fields).toHaveLength(11);
    });

    it("should handle special characters in field values", () => {
      const fields = [
        { label: "Special", value: "Test & <script>alert('xss')</script>" },
      ];
      
      const block = createFieldsBlock(fields);
      
      expect((block as any).fields[0].text).toContain("*Special:*\n");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });
  });

  describe("createDivider", () => {
    it("should create a valid divider block", () => {
      const block = createDivider();
      
      expect((block as any).type).toBe("divider");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should have no additional properties", () => {
      const block = createDivider();
      
      expect(Object.keys(block as any)).toEqual(["type"]);
    });
  });

  describe("createContextBlock", () => {
    it("should create a valid context block", () => {
      const block = createContextBlock("Context information");
      
      expect((block as any).type).toBe("context");
      expect((block as any).elements).toHaveLength(1);
      expect((block as any).elements[0].type).toBe("mrkdwn");
      expect((block as any).elements[0].text).toBe("Context information");
    });

    it("should handle empty text", () => {
      const block = createContextBlock("");
      
      expect((block as any).elements[0].text).toBe("");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle markdown in context", () => {
      const markdownText = "Status: *Open* | Priority: _High_";
      const block = createContextBlock(markdownText);
      
      expect((block as any).elements[0].text).toBe(markdownText);
    });
  });

  describe("createActionsBlock", () => {
    it("should create a valid actions block with buttons", () => {
      const buttons = [
        {
          text: "Approve",
          actionId: "approve_button",
          style: "primary" as const,
        },
        {
          text: "Reject",
          actionId: "reject_button",
          style: "danger" as const,
        },
      ];
      
      const block = createActionsBlock(buttons);
      
      expect((block as any).type).toBe("actions");
      expect((block as any).elements).toHaveLength(2);
      expect((block as any).elements[0].type).toBe("button");
      expect((block as any).elements[0].text.text).toBe("Approve");
      expect((block as any).elements[0].action_id).toBe("approve_button");
      expect((block as any).elements[0].style).toBe("primary");
    });

    it("should handle buttons with URLs", () => {
      const buttons = [
        {
          text: "Open Link",
          actionId: "link_button",
          url: "https://example.com",
        },
      ];
      
      const block = createActionsBlock(buttons);
      
      expect((block as any).elements[0].url).toBe("https://example.com");
    });

    it("should handle buttons with confirmation dialogs", () => {
      const buttons = [
        {
          text: "Delete",
          actionId: "delete_button",
          style: "danger" as const,
          confirm: {
            title: "Confirm Delete",
            text: "Are you sure you want to delete?",
            confirm: "Delete",
            deny: "Cancel",
          },
        },
      ];
      
      const block = createActionsBlock(buttons);
      
      expect((block as any).elements[0].confirm).toBeDefined();
      expect((block as any).elements[0].confirm.title.text).toBe("Confirm Delete");
    });

    it("should handle empty buttons array", () => {
      const block = createActionsBlock([]);
      
      expect((block as any).elements).toHaveLength(0);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle maximum buttons (5)", () => {
      const buttons = Array.from({ length: 5 }, (_, i) => ({
        text: `Button ${i}`,
        actionId: `button_${i}`,
      }));
      
      const block = createActionsBlock(buttons);
      
      expect((block as any).elements).toHaveLength(5);
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });
  });

  describe("createImageBlock", () => {
    it("should create a valid image block", () => {
      const block = createImageBlock(
        "https://example.com/image.png",
        "Alt text"
      );
      
      expect((block as any).type).toBe("image");
      expect((block as any).image_url).toBe("https://example.com/image.png");
      expect((block as any).alt_text).toBe("Alt text");
    });

    it("should create image block with title", () => {
      const block = createImageBlock(
        "https://example.com/image.png",
        "Alt text",
        "Image Title"
      );
      
      expect((block as any).title.text).toBe("Image Title");
      expect((block as any).title.emoji).toBe(true);
    });

    it("should create image block with block_id", () => {
      const block = createImageBlock(
        "https://example.com/image.png",
        "Alt text",
        undefined,
        "test_image_block"
      );
      
      expect((block as any).block_id).toBe("test_image_block");
    });

    it("should handle URLs without sanitization", () => {
      const block = createImageBlock(
        "javascript:alert('xss')",
        "Alt text",
        "Title"
      );
      
      // Function doesn't sanitize URLs
      expect((block as any).image_url).toBe("javascript:alert('xss')");
    });
  });

  describe("createFileBlock", () => {
    it("should create a valid file block", () => {
      const block = createFileBlock("external_id_123");
      
      expect((block as any).type).toBe("file");
      expect((block as any).external_id).toBe("external_id_123");
      expect((block as any).source).toBe("remote");
    });

    it("should create file block with custom source", () => {
      const block = createFileBlock("external_id_123", "local");
      
      expect((block as any).source).toBe("local");
    });

    it("should create file block with block_id", () => {
      const block = createFileBlock("external_id_123", "remote", "file_block_1");
      
      expect((block as any).block_id).toBe("file_block_1");
    });
  });

  describe("createButton", () => {
    it("should create a valid button", () => {
      const button = createButton({
        text: "Click me",
        actionId: "test_button",
      });
      
      expect((button as any).type).toBe("button");
      expect((button as any).text.text).toBe("Click me");
      expect((button as any).action_id).toBe("test_button");
      expect((button as any).text.emoji).toBe(true);
    });

    it("should create button with value", () => {
      const button = createButton({
        text: "Click me",
        actionId: "test_button",
        value: "button_value",
      });
      
      expect((button as any).value).toBe("button_value");
    });

    it("should create button with URL", () => {
      const button = createButton({
        text: "Open Link",
        actionId: "link_button",
        url: "https://example.com",
      });
      
      expect((button as any).url).toBe("https://example.com");
    });

    it("should sanitize dangerous URLs", () => {
      const button = createButton({
        text: "Dangerous",
        actionId: "danger_button",
        url: "javascript:alert('xss')",
      });
      
      expect((button as any).url).toBe("");
    });

    it("should create button with style", () => {
      const button = createButton({
        text: "Primary",
        actionId: "primary_button",
        style: "primary",
      });
      
      expect((button as any).style).toBe("primary");
    });

    it("should create button with confirmation", () => {
      const button = createButton({
        text: "Delete",
        actionId: "delete_button",
        style: "danger",
        confirm: {
          title: "Confirm",
          text: "Are you sure?",
          confirm: "Yes",
          deny: "No",
        },
      });
      
      expect((button as any).confirm).toBeDefined();
      expect((button as any).confirm.title.text).toBe("Confirm");
      expect((button as any).confirm.text.text).toBe("Are you sure?");
    });
  });

  describe("createOverflowMenu", () => {
    it("should create a valid overflow menu", () => {
      const options = [
        { text: "Option 1", value: "opt1" },
        { text: "Option 2", value: "opt2" },
      ];
      
      const menu = createOverflowMenu("overflow_menu", options);
      
      expect((menu as any).type).toBe("overflow");
      expect((menu as any).action_id).toBe("overflow_menu");
      expect((menu as any).options).toHaveLength(2);
      expect((menu as any).options[0].text.text).toBe("Option 1");
      expect((menu as any).options[0].value).toBe("opt1");
    });

    it("should handle empty options", () => {
      const menu = createOverflowMenu("empty_menu", []);
      
      expect((menu as any).options).toHaveLength(0);
    });

    it("should handle maximum options (5)", () => {
      const options = Array.from({ length: 5 }, (_, i) => ({
        text: `Option ${i}`,
        value: `opt${i}`,
      }));
      
      const menu = createOverflowMenu("max_menu", options);
      
      expect((menu as any).options).toHaveLength(5);
    });
  });

  describe("Block Integration Tests", () => {
    it("should create a complete message with multiple block types", () => {
      const blocks = [
        createHeaderBlock("Case Update"),
        createSectionBlock("This case has been updated with new information."),
        createFieldsBlock([
          { label: "Status", value: "In Progress" },
          { label: "Priority", value: "High" },
        ]),
        createDivider(),
        createActionsBlock([
          {
            text: "Acknowledge",
            actionId: "acknowledge_button",
            style: "primary",
          },
          {
            text: "Escalate",
            actionId: "escalate_button",
          },
        ]),
      ];
      
      expect(() => validateBlockCount(blocks, 'message')).not.toThrow();
      expect(blocks).toHaveLength(5);
    });

    it("should handle complex nested structures", () => {
      const imageBlock = createImageBlock(
        "https://example.com/chart.png",
        "Performance Chart",
        "Monthly Metrics"
      );
      
      const sectionWithImage = createSectionBlock(
        "Here's the performance chart:",
        imageBlock
      );
      
      expect((sectionWithImage as any).accessory).toBeDefined();
      expect((sectionWithImage as any).accessory.type).toBe("image");
      expect(() => validateBlockCount([sectionWithImage], 'message')).not.toThrow();
    });

    it("should maintain block order in arrays", () => {
      const blocks = [
        createHeaderBlock("First"),
        createSectionBlock("Second"),
        createDivider(),
        createContextBlock("Fourth"),
      ];
      
      expect((blocks[0] as any).type).toBe("header");
      expect((blocks[1] as any).type).toBe("section");
      expect((blocks[2] as any).type).toBe("divider");
      expect((blocks[3] as any).type).toBe("context");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle null/undefined inputs gracefully", () => {
      expect(() => createHeaderBlock(null as any)).not.toThrow();
      expect(() => createSectionBlock(undefined as any)).not.toThrow();
      expect(() => createDivider()).not.toThrow();
    });

    it("should handle very long text inputs", () => {
      const veryLongText = "A".repeat(10000);
      
      const headerBlock = createHeaderBlock(veryLongText);
      const sectionBlock = createSectionBlock(veryLongText);
      
      expect((headerBlock as any).text.text.length).toBe(10000);
      expect((sectionBlock as any).text.text.length).toBe(10000);
    });

    it("should handle special characters and unicode", () => {
      const specialText = "🚨 Incident: <script>alert('xss')</script> & Special chars: ñáéíóú";
      
      const block = createSectionBlock(specialText);
      
      expect((block as any).text.text).toContain("🚨 Incident:");
      expect(() => validateBlockCount([block], 'message')).not.toThrow();
    });

    it("should handle malformed URLs gracefully", () => {
      const button = createButton({
        text: "Bad URL",
        actionId: "bad_url",
        url: "not-a-url",
      });
      
      expect((button as any).url).toBe("");
    });
  });
});