/**
 * XSS Sanitization Security Tests
 * Comprehensive tests for XSS prevention in Slack messages
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeMrkdwn,
  sanitizePlainText,
  sanitizeUrl,
} from "../lib/utils/message-styling";

describe("XSS Sanitization Security Tests", () => {
  describe("Script Tag Injection", () => {
    it("should remove basic script tags", () => {
      const input = "<script>alert('xss')</script>";
      const result = sanitizeMrkdwn(input);
      expect(result).toBe("alert('xss')");
    });

    it("should remove script tags with attributes", () => {
      const input = '<script src="evil.js" onload="alert(1)"></script>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('');
    });

    it("should handle multiple script tags", () => {
      const input = "<script>alert(1)</script>Text<script>alert(2)</script>";
      const result = sanitizeMrkdwn(input);
      expect(result).toBe("Text");
    });

    it("should handle malformed script tags", () => {
      const input = "<script>alert(1)<script>";
      const result = sanitizeMrkdwn(input);
      expect(result).toBe("alert(1)");
    });

    it("should handle script tags in different cases", () => {
      const input = "<SCRIPT>alert('xss')</SCRIPT>";
      const result = sanitizeMrkdwn(input);
      expect(result).toBe("alert('xss')");
    });
  });

  describe("Event Handler Injection", () => {
    it("should remove onclick handlers", () => {
      const input = '<div onclick="alert(\'xss\')">Click me</div>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<div>Click me</div>');
    });

    it("should remove onload handlers", () => {
      const input = '<img src="x" onerror="alert(\'xss\')">';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<img src="x">');
    });

    it("should remove onmouseover handlers", () => {
      const input = '<a href="#" onmouseover="alert(\'xss\')">Hover</a>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<a href="#">Hover</a>');
    });

    it("should remove multiple event handlers", () => {
      const input = '<div onclick="alert(1)" onmouseover="alert(2)">Test</div>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<div>Test</div>');
    });

    it("should handle case variations in event handlers", () => {
      const input = '<div ONCLICK="alert(\'xss\')">Click</div>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<div>Click</div>');
    });
  });

  describe("JavaScript Protocol Injection", () => {
    it("should remove javascript: URLs", () => {
      const input = '<a href="javascript:alert(\'xss\')">Click</a>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<a href="">Click</a>');
    });

    it("should handle javascript with encoding", () => {
      const input = '<a href="javascript:%61lert(\'xss\')">Click</a>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<a href="">Click</a>');
    });

    it("should handle data URLs with scripts", () => {
      const input = '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<iframe src=""></iframe>');
    });
  });

  describe("CSS Expression Injection", () => {
    it("should remove CSS expressions", () => {
      const input = '<div style="width:expression(alert(\'xss\'))">Test</div>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<div style="">Test</div>');
    });

    it("should remove @import with javascript", () => {
      const input = '<style>@import "javascript:alert(\'xss\')";</style>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<style>@import "";</style>');
    });
  });

  describe("Meta Tag Injection", () => {
    it("should remove meta refresh with javascript", () => {
      const input = '<meta http-equiv="refresh" content="0;url=javascript:alert(\'xss\')">';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<meta http-equiv="refresh" content="">');
    });
  });

  describe("Form Action Injection", () => {
    it("should remove form actions with javascript", () => {
      const input = '<form action="javascript:alert(\'xss\')"><button type="submit">Submit</button></form>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<form action=""><button type="submit">Submit</button></form>');
    });
  });

  describe("IFrame Injection", () => {
    it("should remove iframes with malicious sources", () => {
      const input = '<iframe src="javascript:alert(\'xss\')"></iframe>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<iframe src=""></iframe>');
    });

    it("should remove iframe srcdoc with scripts", () => {
      const input = '<iframe srcdoc="<script>alert(\'xss\')</script>"></iframe>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<iframe srcdoc=""></iframe>');
    });
  });

  describe("Object and Embed Injection", () => {
    it("should remove object tags with malicious data", () => {
      const input = '<object data="javascript:alert(\'xss\')"></object>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<object data=""></object>');
    });

    it("should remove embed tags with malicious src", () => {
      const input = '<embed src="javascript:alert(\'xss\')">';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<embed src="">');
    });
  });

  describe("Link Target Injection", () => {
    it("should handle target attributes safely", () => {
      const input = '<a href="https://example.com" target="_blank">Link</a>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<a href="https://example.com">Link</a>');
    });
  });

  describe("SVG Injection", () => {
    it("should remove script tags in SVG", () => {
      const input = '<svg><script>alert(\'xss\')</script></svg>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<svg>alert(\'xss\')</svg>');
    });

    it("should remove event handlers in SVG", () => {
      const input = '<svg onclick="alert(\'xss\')"><circle r="10"/></svg>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<svg><circle r="10"/></svg>');
    });
  });

  describe("MathML Injection", () => {
    it("should remove script tags in MathML", () => {
      const input = '<math><script>alert(\'xss\')</script></math>';
      const result = sanitizeMrkdwn(input);
      expect(result).toBe('<math>alert(\'xss\')</math>');
    });
  });

  describe("Plain Text Sanitization", () => {
    it("should remove HTML from plain text", () => {
      const input = "Hello <script>alert('xss')</script> world";
      const result = sanitizePlainText(input);
      expect(result).toBe("Hello alert('xss') world");
    });

    it("should handle null/undefined inputs", () => {
      expect(sanitizePlainText(null as any)).toBe("");
      expect(sanitizePlainText(undefined as any)).toBe("");
    });

    it("should remove control characters", () => {
      const input = "Text\x00with\x1Fcontrol\x7Fcharacters";
      const result = sanitizePlainText(input);
      expect(result).toBe("Textwithcontrolcharacters");
    });

    it("should remove zero-width characters", () => {
      const input = "Text\u200Bwith\u200Czero\u200Dwidth\uFEFFcharacters";
      const result = sanitizePlainText(input);
      expect(result).toBe("Textwithzerowidthcharacters");
    });

    it("should truncate long text", () => {
      const longText = "a".repeat(4000);
      const result = sanitizePlainText(longText);
      expect(result.length).toBeLessThanOrEqual(3000);
    });
  });

  describe("URL Sanitization", () => {
    it("should allow safe protocols", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
      expect(sanitizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
      expect(sanitizeUrl("slack://channel?id=C123")).toBe("slack://channel?id=C123");
    });

    it("should block dangerous protocols", () => {
      expect(sanitizeUrl("javascript:alert('xss')")).toBe("");
      expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
      expect(sanitizeUrl("vbscript:msgbox('xss')")).toBe("");
      expect(sanitizeUrl("file:///etc/passwd")).toBe("");
    });

    it("should handle malformed URLs", () => {
      expect(sanitizeUrl("not-a-url")).toBe("");
      expect(sanitizeUrl("")).toBe("");
      expect(sanitizeUrl(null as any)).toBe("");
      expect(sanitizeUrl(undefined as any)).toBe("");
    });

    it("should prevent URL injection in attributes", () => {
      const input = 'javascript:alert("xss")';
      const result = sanitizeUrl(input);
      expect(result).toBe("");
    });
  });

  describe("Real-World Attack Vectors", () => {
    it("should handle XSS from OWASP examples", () => {
      const attacks = [
        "<SCRIPT>alert('XSS')</SCRIPT>",
        "<SCRIPT SRC=http://example.com/xss.js></SCRIPT>",
        "<IMG SRC=\"javascript:alert('XSS')\">",
        "<IMG SRC=javascript:alert('XSS')>",
        "<IMG SRC=JaVaScRiPt:alert('XSS')>",
        "<IMG SRC=javascript:alert(&quot;XSS&quot;)>",
        "<IMG SRC=`javascript:alert(\"RSnake says, 'XSS'\")`>",
        "<IMG \"\"\"><SCRIPT>alert(\"XSS\")</SCRIPT>\">",
        "<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>",
        "<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>",
        "<IMG SRC=&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041>",
        "<DIV style=\"background-image:url(javascript:alert('XSS'))\">",
        "<DIV style=\"background-image:\\0075\\0072\\006C\\0028'\\006a\\0061\\0076\\0061\\0073\\0063\\0072\\0069\\0070\\0074\\003a\\0061\\006c\\0065\\0072\\0074\\0028.1027\\0058.1053\\0053\\0027\\0029'\\0029\">",
      ];

      for (const attack of attacks) {
        const result = sanitizeMrkdwn(attack);
        expect(result).not.toContain("<script>");
        expect(result).not.toContain("javascript:");
        expect(result).not.toContain("onerror");
        expect(result).not.toContain("onclick");
      }
    });

    it("should handle encoded attacks", () => {
      const attacks = [
        "%3Cscript%3Ealert%28%27XSS%27%29%3C%2Fscript%3E",
        "&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;",
        "&#60;script&#62;alert(&#39;XSS&#39;)&#60;/script&#62;",
      ];

      for (const attack of attacks) {
        const result = sanitizeMrkdwn(attack);
        expect(result).not.toContain("<script>");
      }
    });

    it("should handle DOM-based XSS patterns", () => {
      const attacks = [
        "#<script>alert('XSS')</script>",
        "?param=<script>alert('XSS')</script>",
        "javascript:alert('XSS')",
        "data:text/html,<script>alert('XSS')</script>",
      ];

      for (const attack of attacks) {
        const result = sanitizeMrkdwn(attack);
        expect(result).not.toContain("<script>");
        expect(result).not.toContain("javascript:");
      }
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle very large inputs efficiently", () => {
      const largeInput = "<script>".repeat(10000) + "content" + "</script>".repeat(10000);
      const start = Date.now();
      const result = sanitizeMrkdwn(largeInput);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(result).not.toContain("<script>");
    });

    it("should handle deeply nested HTML", () => {
      const nestedInput = "<div>".repeat(1000) + "<script>alert('xss')</script>" + "</div>".repeat(1000);
      const result = sanitizeMrkdwn(nestedInput);
      expect(result).not.toContain("<script>");
    });

    it("should handle mixed encoding", () => {
      const mixedInput = "%3Cscript%3Ealert('XSS')%3C/script%3E<script>alert('XSS')</script>&lt;script&gt;alert('XSS')&lt;/script&gt;";
      const result = sanitizeMrkdwn(mixedInput);
      expect(result).not.toContain("<script>");
    });

    it("should handle Unicode attacks", () => {
      const unicodeAttacks = [
        "<\u0073cript>alert('XSS')</\u0073cript>",
        "<\u0073\u0063\u0072\u0069\u0070\u0074>alert('XSS')</\u0073\u0063\u0072\u0069\u0070\u0074>",
      ];

      for (const attack of unicodeAttacks) {
        const result = sanitizeMrkdwn(attack);
        expect(result).not.toContain("<script>");
      }
    });
  });

  describe("Slack-Specific Context", () => {
    it("should preserve Slack formatting while removing XSS", () => {
      const input = "*Bold* <script>alert('xss')</script> _italic_ <https://example.com|link>";
      const result = sanitizeMrkdwn(input);
      expect(result).toContain("*Bold*");
      expect(result).toContain("_italic_");
      expect(result).toContain("<https://example.com|link>");
      expect(result).not.toContain("<script>");
    });

    it("should preserve mentions while removing XSS", () => {
      const input = "<@U123> <script>alert('xss')</script> <#C456|general>";
      const result = sanitizeMrkdwn(input);
      expect(result).toContain("<@U123>");
      expect(result).toContain("<#C456|general>");
      expect(result).not.toContain("<script>");
    });

    it("should preserve emoji while removing XSS", () => {
      const input = ":smile: <script>alert('xss')</script> 🎉";
      const result = sanitizeMrkdwn(input);
      expect(result).toContain(":smile:");
      expect(result).toContain("🎉");
      expect(result).not.toContain("<script>");
    });

    it("should preserve code blocks while removing XSS", () => {
      const input = "```javascript\nconsole.log('hello');\n``` <script>alert('xss')</script>";
      const result = sanitizeMrkdwn(input);
      expect(result).toContain("```");
      expect(result).not.toContain("<script>");
    });
  });
});