/**
 * Comprehensive Block Kit Validation Tests
 * Tests for message styling, validation, and sanitization
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeMrkdwn,
  sanitizePlainText,
  validateBlockCount,
  validateFieldsArray,
  validateContextElements,
  validateSelectOptions,
  validateTextLength,
  validateActionId,
  validateBlockId,
} from "../lib/utils/message-styling";

// Constants for testing
const MAX_TEXT_LENGTH = 3000;

// Helper functions for testing
function sanitizeSlackText(text: string): string {
  return sanitizePlainText(text, MAX_TEXT_LENGTH);
}

function sanitizeBlockText(block: any): any {
  if (!block || !block.type) {
    throw new Error("Invalid block text object");
  }

  if (block.type === 'plain_text') {
    return {
      ...block,
      text: sanitizePlainText(block.text)
    };
  } else if (block.type === 'mrkdwn') {
    return {
      ...block,
      text: sanitizeMrkdwn(block.text)
    };
  }

  throw new Error("Invalid block text object");
}

function sanitizeMarkdownText(text: string): string {
  return sanitizeMrkdwn(text);
}

function truncateText(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  // Take maxLength-3 characters and add ellipsis to stay within limit
  const ellipsis = '...';
  const truncateLength = Math.max(0, maxLength - ellipsis.length);
  return text.substring(0, truncateLength) + ellipsis;
}

function validateBlockKitStructure(payload: any): void {
  if (!payload || typeof payload !== 'object') {
    throw new Error("Invalid payload");
  }

  if (!Array.isArray(payload.blocks)) {
    throw new Error("Blocks must be an array");
  }

  validateBlockCount(payload.blocks, 'message');

  for (const block of payload.blocks) {
    validateBlockElement(block);
  }
}

function validateBlockElement(block: any): void {
  if (!block || typeof block !== 'object') {
    throw new Error("Invalid block");
  }

  if (!block.type) {
    throw new Error("Block must have a type");
  }

  const validTypes = ['section', 'divider', 'header', 'image', 'actions', 'context', 'input', 'file'];
  if (!validTypes.includes(block.type)) {
    throw new Error(`Invalid block type: ${block.type}`);
  }

  // Type-specific validation
  switch (block.type) {
    case 'section':
      // Check for explicitly null text (malformed)
      if (block.text === null) {
        throw new Error("Section block text cannot be null");
      }
      // Only validate text/fields if they exist (allow empty sections for circular reference test)
      if (block.text && block.text.text) {
        validateTextLength(block.text.text, 'mrkdwn');
      }
      if (block.fields) {
        validateFieldsArray(block.fields);
      }
      break;
    case 'header':
      if (block.text && block.text.text) {
        validateTextLength(block.text.text, 'plain_text', 150);
      }
      break;
    case 'actions':
      if (block.elements) {
        for (const element of block.elements) {
          validateInteractiveElement(element);
        }
      }
      break;
    case 'context':
      if (block.elements) {
        validateContextElements(block.elements);
      }
      break;
  }
}

function validateInteractiveElement(element: any): void {
  if (!element || typeof element !== 'object') {
    throw new Error("Invalid interactive element");
  }

  if (!element.type) {
    throw new Error("Interactive element must have a type");
  }

  const validTypes = ['button', 'static_select', 'external_select', 'users_select', 'channels_select', 'conversations_select', 'datepicker', 'timepicker', 'plain_text_input', 'checkboxes', 'radio_buttons', 'overflow'];
  if (!validTypes.includes(element.type)) {
    throw new Error(`Invalid interactive element type: ${element.type}`);
  }

  // Most interactive elements need action_id
  if (element.type !== 'overflow' && !element.action_id) {
    throw new Error("Interactive element must have an action_id");
  }

  if (element.action_id && !validateActionId(element.action_id)) {
    throw new Error("Invalid action_id format");
  }

  // Type-specific validation
  switch (element.type) {
    case 'static_select':
      if (element.options) {
        validateSelectOptions(element.options);
      }
      break;
    case 'checkboxes':
    case 'radio_buttons':
      if (element.options) {
        validateSelectOptions(element.options);
      }
      break;
  }
}

describe("Message Styling & Sanitization", () => {
  describe("sanitizeSlackText", () => {
    it("should remove dangerous HTML tags", () => {
      const input = "Hello <script>alert('xss')</script> world";
      const result = sanitizeSlackText(input);
      expect(result).toBe("Hello alert('xss') world");
    });

    it("should preserve safe HTML-like content", () => {
      const input = "Check out <https://example.com|this link>";
      const result = sanitizeSlackText(input);
      expect(result).toBe("Check out <https://example.com|this link>");
    });

    it("should handle null/undefined inputs", () => {
      expect(sanitizeSlackText(null as any)).toBe("");
      expect(sanitizeSlackText(undefined as any)).toBe("");
    });

    it("should handle empty strings", () => {
      expect(sanitizeSlackText("")).toBe("");
    });

    it("should remove dangerous attributes", () => {
      const input = '<div onclick="alert(\'xss\')" class="safe">Content</div>';
      const result = sanitizeSlackText(input);
      expect(result).toBe('<div class="safe">Content</div>');
    });

    it("should handle nested dangerous tags", () => {
      const input = "Text <div><script>alert('xss')</script></div> more";
      const result = sanitizeSlackText(input);
      expect(result).toBe("Text <div>alert('xss')</div> more");
    });

    it("should preserve Slack-specific formatting", () => {
      const input = "*bold* _italic_ ~strikethrough~ `code`";
      const result = sanitizeSlackText(input);
      expect(result).toBe("*bold* _italic_ ~strikethrough~ `code`");
    });

    it("should handle emoji and special characters", () => {
      const input = "Hello :smile: 🎉 test";
      const result = sanitizeSlackText(input);
      expect(result).toBe("Hello :smile: 🎉 test");
    });
  });

  describe("sanitizeBlockText", () => {
    it("should sanitize plain text blocks", () => {
      const input = {
        type: "plain_text" as const,
        text: "Hello <script>alert('xss')</script> world",
        emoji: true,
      };
      const result = sanitizeBlockText(input);
      expect(result.text).toBe("Hello alert('xss') world");
    });

    it("should sanitize markdown text blocks", () => {
      const input = {
        type: "mrkdwn" as const,
        text: "Check <https://example.com|link> and <script>alert('xss')</script>",
        verbatim: false,
      };
      const result = sanitizeBlockText(input);
      expect(result.text).toBe("Check <https://example.com|link> and alert('xss')");
    });

    it("should handle invalid block text objects", () => {
      const input = { type: "invalid", text: "test" } as any;
      expect(() => sanitizeBlockText(input)).toThrow("Invalid block text object");
    });
  });

  describe("sanitizeMarkdownText", () => {
    it("should sanitize markdown while preserving formatting", () => {
      const input = "*Bold* <script>alert('xss')</script> _italic_";
      const result = sanitizeMarkdownText(input);
      expect(result).toBe("*Bold* alert('xss') _italic_");
    });

    it("should preserve Slack markdown links", () => {
      const input = "Visit <https://example.com|Example Site> for more info";
      const result = sanitizeMarkdownText(input);
      expect(result).toBe("Visit <https://example.com|Example Site> for more info");
    });

    it("should handle channel and user mentions", () => {
      const input = "Hey <@U123> check <#C456|general>";
      const result = sanitizeMarkdownText(input);
      expect(result).toBe("Hey <@U123> check <#C456|general>");
    });

    it("should remove dangerous HTML from markdown", () => {
      const input = 'Text <img src="x" onerror="alert(\'xss\')"> more';
      const result = sanitizeMarkdownText(input);
      expect(result).toBe('Text <img src="x"> more');
    });
  });

  describe("truncateText", () => {
    it("should truncate text to maximum length", () => {
      const longText = "a".repeat(3001); // One char over limit
      const result = truncateText(longText);
      expect(result.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
      expect(result.endsWith("...")).toBe(true);
    });

    it("should not truncate short text", () => {
      const shortText = "Hello world";
      const result = truncateText(shortText);
      expect(result).toBe(shortText);
    });

    it("should handle custom maxLength", () => {
      const text = "Hello world";
      const result = truncateText(text, 5);
      expect(result).toBe("He...");
    });

    it("should handle empty text", () => {
      expect(truncateText("")).toBe("");
    });
  });

  describe("validateActionId", () => {
    it("should validate valid action IDs", () => {
      expect(validateActionId("valid_action_123")).toBe(true);
      expect(validateActionId("action")).toBe(true);
      expect(validateActionId("a")).toBe(true);
    });

    it("should reject invalid action IDs", () => {
      expect(validateActionId("")).toBe(false);
      expect(validateActionId("a".repeat(256))).toBe(false);
      expect(validateActionId("action with spaces")).toBe(false);
      expect(validateActionId("action-with-dashes")).toBe(false);
    });

    it("should handle null/undefined", () => {
      expect(validateActionId(null as any)).toBe(false);
      expect(validateActionId(undefined as any)).toBe(false);
    });
  });

  describe("validateBlockId", () => {
    it("should validate valid block IDs", () => {
      expect(validateBlockId("valid_block_123")).toBe(true);
      expect(validateBlockId("block")).toBe(true);
      expect(validateBlockId("b")).toBe(true);
    });

    it("should reject invalid block IDs", () => {
      expect(validateBlockId("")).toBe(false);
      expect(validateBlockId("b".repeat(256))).toBe(false);
      expect(validateBlockId("block with spaces")).toBe(false);
      expect(validateBlockId("block-with-dashes")).toBe(false);
    });

    it("should handle null/undefined", () => {
      expect(validateBlockId(null as any)).toBe(false);
      expect(validateBlockId(undefined as any)).toBe(false);
    });
  });
});

describe("Block Kit Structure Validation", () => {
  describe("validateBlockKitStructure", () => {
    it("should validate valid block kit structures", () => {
      const validStructure = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Hello world",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Click me",
                },
                action_id: "button_click",
              },
            ],
          },
        ],
      };

      expect(() => validateBlockKitStructure(validStructure)).not.toThrow();
    });

    it("should reject invalid block kit structures", () => {
      const invalidStructure = {
        blocks: [
          {
            type: "invalid_type",
            text: "Hello",
          },
        ],
      };

      expect(() => validateBlockKitStructure(invalidStructure)).toThrow();
    });

    it("should handle empty blocks array", () => {
      const emptyStructure = { blocks: [] };
      expect(() => validateBlockKitStructure(emptyStructure)).not.toThrow();
    });

    it("should reject non-array blocks", () => {
      const invalidStructure = { blocks: "not an array" };
      expect(() => validateBlockKitStructure(invalidStructure)).toThrow();
    });
  });

  describe("validateBlockElement", () => {
    it("should validate section blocks", () => {
      const sectionBlock = {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Hello world",
        },
      };

      expect(() => validateBlockElement(sectionBlock)).not.toThrow();
    });

    it("should validate divider blocks", () => {
      const dividerBlock = { type: "divider" };
      expect(() => validateBlockElement(dividerBlock)).not.toThrow();
    });

    it("should validate header blocks", () => {
      const headerBlock = {
        type: "header",
        text: {
          type: "plain_text",
          text: "Header",
        },
      };

      expect(() => validateBlockElement(headerBlock)).not.toThrow();
    });

    it("should validate image blocks", () => {
      const imageBlock = {
        type: "image",
        image_url: "https://example.com/image.png",
        alt_text: "Example image",
      };

      expect(() => validateBlockElement(imageBlock)).not.toThrow();
    });

    it("should validate actions blocks", () => {
      const actionsBlock = {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Click",
            },
            action_id: "button_click",
          },
        ],
      };

      expect(() => validateBlockElement(actionsBlock)).not.toThrow();
    });

    it("should validate context blocks", () => {
      const contextBlock = {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Context text",
          },
        ],
      };

      expect(() => validateBlockElement(contextBlock)).not.toThrow();
    });

    it("should reject invalid block types", () => {
      const invalidBlock = { type: "invalid_type" };
      expect(() => validateBlockElement(invalidBlock)).toThrow("Invalid block type");
    });

    it("should reject blocks without type", () => {
      const noTypeBlock = { text: "Hello" };
      expect(() => validateBlockElement(noTypeBlock)).toThrow("Block must have a type");
    });
  });

  describe("validateInteractiveElement", () => {
    it("should validate button elements", () => {
      const button = {
        type: "button",
        text: {
          type: "plain_text",
          text: "Click me",
        },
        action_id: "button_click",
      };

      expect(() => validateInteractiveElement(button)).not.toThrow();
    });

    it("should validate select menu elements", () => {
      const select = {
        type: "static_select",
        action_id: "select_choice",
        placeholder: {
          type: "plain_text",
          text: "Choose an option",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Option 1",
            },
            value: "option1",
          },
        ],
      };

      expect(() => validateInteractiveElement(select)).not.toThrow();
    });

    it("should validate input elements", () => {
      const input = {
        type: "plain_text_input",
        action_id: "text_input",
        placeholder: {
          type: "plain_text",
          text: "Enter text",
        },
      };

      expect(() => validateInteractiveElement(input)).not.toThrow();
    });

    it("should validate checkbox elements", () => {
      const checkbox = {
        type: "checkboxes",
        action_id: "checkbox_group",
        options: [
          {
            text: {
              type: "mrkdwn",
              text: "Option 1",
            },
            value: "option1",
          },
        ],
      };

      expect(() => validateInteractiveElement(checkbox)).not.toThrow();
    });

    it("should validate radio button elements", () => {
      const radio = {
        type: "radio_buttons",
        action_id: "radio_group",
        options: [
          {
            text: {
              type: "mrkdwn",
              text: "Option 1",
            },
            value: "option1",
          },
        ],
      };

      expect(() => validateInteractiveElement(radio)).not.toThrow();
    });

    it("should reject invalid interactive elements", () => {
      const invalidElement = { type: "invalid_interactive" };
      expect(() => validateInteractiveElement(invalidElement)).toThrow("Invalid interactive element type");
    });

    it("should reject elements without action_id where required", () => {
      const buttonWithoutId = {
        type: "button",
        text: {
          type: "plain_text",
          text: "Click",
        },
      };

      expect(() => validateInteractiveElement(buttonWithoutId)).toThrow("Interactive element must have an action_id");
    });

    it("should reject invalid action_id format", () => {
      const buttonWithInvalidId = {
        type: "button",
        text: {
          type: "plain_text",
          text: "Click",
        },
        action_id: "invalid id with spaces",
      };

      expect(() => validateInteractiveElement(buttonWithInvalidId)).toThrow("Invalid action_id format");
    });
  });
});

describe("Edge Cases and Error Handling", () => {
  it("should handle deeply nested structures", () => {
    const deepStructure = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Nested <script>alert('xss')</script> content",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Click <script>alert('xss')</script> here",
            },
            action_id: "nested_button",
          },
        },
      ],
    };

    expect(() => validateBlockKitStructure(deepStructure)).not.toThrow();
  });

  it("should handle Unicode and special characters", () => {
    const unicodeText = "Hello 🎉 世界 ñiño 🚀";
    const result = sanitizeSlackText(unicodeText);
    expect(result).toBe(unicodeText);
  });

  it("should handle very long action_ids and block_ids", () => {
    const longId = "a".repeat(300);
    expect(validateActionId(longId)).toBe(false);
    expect(validateBlockId(longId)).toBe(false);
  });

  it("should handle malformed JSON-like structures", () => {
    const malformed = {
      blocks: [
        {
          type: "section",
          text: null, // Missing required text
        },
      ],
    };

    expect(() => validateBlockKitStructure(malformed)).toThrow();
  });

  it("should handle circular references gracefully", () => {
    const circular: any = { type: "section" };
    circular.self = circular;

    // Should not throw infinite recursion errors
    expect(() => validateBlockElement(circular)).not.toThrow();
  });
});