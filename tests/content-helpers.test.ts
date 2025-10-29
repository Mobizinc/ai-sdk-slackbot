/**
 * Content Helper Utilities Tests
 */

import { describe, it, expect } from "vitest";
import {
  generatePatternSummary,
  extractKeyPoints,
  truncateToExcerpt,
  sanitizeHtml,
} from "../lib/utils/content-helpers";

describe("generatePatternSummary", () => {
  it("should generate concise pattern from case data", () => {
    const result = generatePatternSummary({
      short_description: "Microsoft Teams login failing with error 401",
      category: "authentication",
      priority: "1",
    });

    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toMatch(/teams|login|failing/i);
  });

  it("should include category in pattern", () => {
    const result = generatePatternSummary({
      short_description: "Application server timeout",
      category: "performance",
    });

    expect(result).toContain("(performance)");
  });

  it("should mark high priority cases", () => {
    const result = generatePatternSummary({
      short_description: "Production database down",
      priority: "1",
    });

    expect(result).toContain("high priority");
  });

  it("should handle missing fields gracefully", () => {
    const result = generatePatternSummary({});
    expect(result).toBeTruthy();
    expect(result).toBe("Technical issue");
  });

  it("should truncate long patterns to 60 chars", () => {
    const result = generatePatternSummary({
      short_description:
        "Very long description with many technical terms that should be truncated to stay within limits",
      category: "very_long_category_name",
      priority: "1",
    });

    expect(result.length).toBeLessThanOrEqual(60);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("should extract technical terms and filter stop words", () => {
    const result = generatePatternSummary({
      short_description: "The user is unable to access the SharePoint site with error",
    });

    // Should filter out stop words like "the", "user", "is", "unable", "to", "access", "with", "error"
    // Should keep technical terms like "SharePoint", "site"
    expect(result.toLowerCase()).toMatch(/sharepoint/);
    expect(result.toLowerCase()).not.toMatch(/\bthe\b/);
    expect(result.toLowerCase()).not.toMatch(/\buser\b/);
  });

  it("should prioritize capitalized and technical words", () => {
    const result = generatePatternSummary({
      short_description: "API_Gateway timeout connecting to SQL_Server database",
    });

    // Should include technical terms with separators and capitals
    expect(result.toLowerCase()).toMatch(/gateway|timeout|connecting|server|database/);
  });
});

describe("extractKeyPoints", () => {
  it("should extract 2-3 key points from content", () => {
    const content = `
      This is the first important sentence about authentication.
      This is the second sentence explaining the process.
      This is the third sentence with more details.
      This is a fourth sentence.
    `;

    const points = extractKeyPoints(content, 3);

    expect(points).toHaveLength(3);
    points.forEach((point) => {
      expect(point.length).toBeLessThanOrEqual(80);
    });
  });

  it("should filter out generic sentences", () => {
    const content = `
      In this article we will discuss authentication.
      Authentication requires valid credentials.
      Click here for more information.
      Users must verify their identity.
    `;

    const points = extractKeyPoints(content, 3);

    // Should skip "In this article" and "Click here" sentences
    expect(points.some((p) => p.toLowerCase().includes("in this article"))).toBe(false);
    expect(points.some((p) => p.toLowerCase().includes("click here"))).toBe(false);
  });

  it("should truncate long sentences to 80 chars", () => {
    const content = `
      This is a very long sentence that exceeds eighty characters and should be truncated with ellipsis.
      Short sentence.
    `;

    const points = extractKeyPoints(content, 2);

    const longPoint = points.find((p) => p.includes("very long"));
    expect(longPoint).toBeTruthy();
    expect(longPoint!.length).toBeLessThanOrEqual(80);
    expect(longPoint).toMatch(/\.\.\.$/);
  });

  it("should return empty array for empty content", () => {
    const points = extractKeyPoints("", 3);
    expect(points).toEqual([]);
  });

  it("should handle content with no valid sentences", () => {
    const content = "word word word";
    const points = extractKeyPoints(content, 3);

    // Should use first 80 chars as fallback
    expect(points).toHaveLength(1);
    expect(points[0]).toBe("word word word");
  });

  it("should respect maxPoints parameter", () => {
    const content = `
      First sentence here.
      Second sentence here.
      Third sentence here.
      Fourth sentence here.
      Fifth sentence here.
    `;

    const points = extractKeyPoints(content, 2);
    expect(points.length).toBeLessThanOrEqual(2);
  });

  it("should skip sentences that are too short or too long", () => {
    const content = `
      Short.
      This is a good sentence with adequate length for extraction.
      ${"A".repeat(250)}
      Another good sentence.
    `;

    const points = extractKeyPoints(content, 3);

    // Should skip "Short." (< 20 chars) and the 250-char sentence (> 200 chars)
    expect(points.every((p) => p.length >= 20 && p.length <= 200)).toBe(true);
  });
});

describe("truncateToExcerpt", () => {
  it("should not truncate short text", () => {
    const text = "This is a short text that fits.";
    const result = truncateToExcerpt(text, 150);

    expect(result).toBe(text);
  });

  it("should truncate at sentence boundary when possible", () => {
    const text =
      "This is the first sentence. This is the second sentence with more content that would exceed the limit if included.";

    const result = truncateToExcerpt(text, 50);

    expect(result).toContain("This is the first sentence.");
    expect(result).not.toContain("second sentence");
  });

  it("should truncate at word boundary if no complete sentence fits", () => {
    const text = "This is a very long sentence without any punctuation marks that goes on and on";

    const result = truncateToExcerpt(text, 30);

    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toMatch(/\.\.\.$/);
    // Should end with complete word + ellipsis (e.g., "word..." not "wo...")
    expect(result).toMatch(/\w+\.\.\.$/);
  });

  it("should use default maxLength of 150", () => {
    const text = "A".repeat(200);
    const result = truncateToExcerpt(text);

    expect(result.length).toBeLessThanOrEqual(150);
  });

  it("should return empty string for empty input", () => {
    const result = truncateToExcerpt("");
    expect(result).toBe("");
  });

  it("should handle null/undefined gracefully", () => {
    const result1 = truncateToExcerpt(null as any);
    const result2 = truncateToExcerpt(undefined as any);

    expect(result1).toBe("");
    expect(result2).toBe("");
  });

  it("should preserve multiple complete sentences within limit", () => {
    const text = "First sentence. Second sentence. Third sentence.";

    const result = truncateToExcerpt(text, 100);

    expect(result).toBe(text);
  });
});

describe("sanitizeHtml", () => {
  it("should strip HTML tags", () => {
    const html = "<p>This is <strong>bold</strong> text</p>";
    const result = sanitizeHtml(html);

    expect(result).toBe("This is bold text");
  });

  it("should convert <br> tags to spaces", () => {
    const html = "Line one<br>Line two<br/>Line three";
    const result = sanitizeHtml(html);

    expect(result).toBe("Line one Line two Line three");
  });

  it("should convert <p> tags to spaces", () => {
    const html = "<p>First paragraph</p><p>Second paragraph</p>";
    const result = sanitizeHtml(html);

    expect(result).toBe("First paragraph Second paragraph");
  });

  it("should normalize whitespace", () => {
    const html = "Multiple    spaces    and\n\nnewlines";
    const result = sanitizeHtml(html);

    expect(result).toBe("Multiple spaces and newlines");
  });

  it("should trim the result", () => {
    const html = "   <p>Text with spaces</p>   ";
    const result = sanitizeHtml(html);

    expect(result).toBe("Text with spaces");
  });

  it("should return empty string for empty input", () => {
    const result = sanitizeHtml("");
    expect(result).toBe("");
  });

  it("should handle null/undefined gracefully", () => {
    const result1 = sanitizeHtml(null as any);
    const result2 = sanitizeHtml(undefined as any);

    expect(result1).toBe("");
    expect(result2).toBe("");
  });

  it("should handle nested HTML tags", () => {
    const html = "<div><p><strong><em>Nested</em> content</strong></p></div>";
    const result = sanitizeHtml(html);

    expect(result).toBe("Nested content");
  });

  it("should handle self-closing tags", () => {
    const html = "Text before<br/>text after";
    const result = sanitizeHtml(html);

    expect(result).toBe("Text before text after");
  });
});
