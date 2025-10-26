/**
 * Comprehensive Unit Tests for Message Formatter
 */

import { describe, it, expect, vi } from "vitest";
import { formatMessage } from "../../lib/agent/message-formatter";

describe("Message Formatter", () => {
  describe("Markdown to Slack Conversion", () => {
    it("converts headers to bold text", () => {
      const text = "# Level 1\n## Level 2\n### Level 3";
      const result = formatMessage({ text });

      expect(result).toContain("*Level 1*");
      expect(result).toContain("*Level 2*");
      expect(result).toContain("*Level 3*");
    });

    it("converts markdown bold to Slack bold", () => {
      const text = "This is **bold** text and **another bold** section.";
      const result = formatMessage({ text });

      expect(result).toContain("*bold*");
      expect(result).toContain("*another bold*");
      expect(result).not.toContain("**");
    });

    it("converts markdown links to Slack format", () => {
      const text = "Check out [Google](https://google.com) and [Docs](https://docs.example.com).";
      const result = formatMessage({ text });

      expect(result).toContain("<https://google.com|Google>");
      expect(result).toContain("<https://docs.example.com|Docs>");
      expect(result).not.toContain("[");
      expect(result).not.toContain("]");
    });

    it("handles combined formatting (headers + bold + links)", () => {
      const text = "# Title\nThis is **bold** and [link](https://example.com).";
      const result = formatMessage({ text });

      expect(result).toContain("*Title*");
      expect(result).toContain("*bold*");
      expect(result).toContain("<https://example.com|link>");
    });

    it("handles multiple lines with various formatting", () => {
      const text = `# Main Header
Here's some **bold text** and a [link](https://test.com).
## Subheader
More **emphasis** here.`;
      const result = formatMessage({ text });

      expect(result).toContain("*Main Header*");
      expect(result).toContain("*Subheader*");
      expect(result).toContain("*bold text*");
      expect(result).toContain("*emphasis*");
      expect(result).toContain("<https://test.com|link>");
    });
  });

  describe("Edge Cases", () => {
    it("handles empty text", () => {
      const result = formatMessage({ text: "" });
      expect(result).toBe("");
    });

    it("handles whitespace-only text", () => {
      const result = formatMessage({ text: "   \n\n   " });
      expect(result).toBe("");
    });

    it("handles text with no markdown formatting", () => {
      const text = "Just plain text without any formatting.";
      const result = formatMessage({ text });
      expect(result).toBe(text);
    });

    it("handles partial markdown patterns that shouldn't match", () => {
      const text = "This has **unmatched bold and a [broken link";
      const result = formatMessage({ text });
      // Should leave unmatched patterns as-is
      expect(result).toContain("**unmatched bold");
      expect(result).toContain("[broken link");
    });

    it("preserves text without trailing/leading spaces when trimming", () => {
      const text = "  # Header  \n  Some text  ";
      const result = formatMessage({ text });
      expect(result.startsWith(" ")).toBe(false);
      expect(result.endsWith(" ")).toBe(false);
    });

    it("handles special characters in link text without parentheses", () => {
      const text = "[Link with & symbols!](https://example.com)";
      const result = formatMessage({ text });
      expect(result).toContain("<https://example.com|Link with & symbols!>");
    });

    it("handles simple URLs with query parameters", () => {
      const text = "[Search](https://example.com?q=test)";
      const result = formatMessage({ text });
      expect(result).toContain("<https://example.com?q=test|Search>");
    });
  });

  describe("Status Updates", () => {
    it("calls updateStatus with 'formatting' then 'sent'", () => {
      const updateStatus = vi.fn();
      const text = "Test message";

      formatMessage({ text, updateStatus });

      expect(updateStatus).toHaveBeenCalledTimes(2);
      expect(updateStatus).toHaveBeenNthCalledWith(1, "formatting");
      expect(updateStatus).toHaveBeenNthCalledWith(2, "sent");
    });

    it("handles missing updateStatus callback gracefully", () => {
      const text = "Test message";

      expect(() => formatMessage({ text })).not.toThrow();
      const result = formatMessage({ text });
      expect(result).toBe("Test message");
    });
  });
});
