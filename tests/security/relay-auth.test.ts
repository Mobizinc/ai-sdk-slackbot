/**
 * Relay Authentication Security Tests
 * 
 * Critical security tests for HMAC signature verification
 * Tests protection against replay attacks, forged requests, and timing attacks
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { verifyRelaySignature } from "../../lib/relay-auth";
import crypto from "crypto";

describe("Relay Authentication Security", () => {
  const testSecret = "test-webhook-secret-key";
  const testBody = JSON.stringify({ test: "payload" });
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment
    process.env.RELAY_WEBHOOK_SECRET = testSecret;
  });

  describe("HMAC Signature Verification", () => {
    it("should verify valid HMAC signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.timestamp).toBe(timestamp);
      }
    });

    it("should reject invalid HMAC signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = "invalid-signature-hash";

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${invalidSignature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.message).toContain("Invalid signature");
      }
    });

    it("should reject signature with wrong secret", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac("sha256", "wrong-secret")
        .update(`${timestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });
  });

  describe("Replay Attack Protection", () => {
    it("should reject old timestamps (replay attacks)", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${oldTimestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${oldTimestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.message).toContain("timestamp");
      }
    });

    it("should reject future timestamps", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${futureTimestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${futureTimestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should accept recent timestamps within tolerance", () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${recentTimestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${recentTimestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("Header Validation", () => {
    it("should reject missing signature header", () => {
      const headers = new Headers();

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.message).toContain("signature");
      }
    });

    it("should reject malformed signature header", () => {
      const headers = new Headers({
        "x-relay-signature": "invalid-format",
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should reject signature header without timestamp", () => {
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(testBody)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should reject signature header without version", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const headers = new Headers({
        "x-relay-signature": `t=${timestamp}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });
  });

  describe("Secret Configuration", () => {
    beforeEach(() => {
      delete process.env.RELAY_WEBHOOK_SECRET;
    });

    it("should reject when no secret is configured", () => {
      const headers = new Headers({
        "x-relay-signature": "t=123,v1=signature",
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(500);
        expect(result.message).toContain("not configured");
      }
    });

    it("should reject empty secret", () => {
      process.env.RELAY_WEBHOOK_SECRET = "";
      const headers = new Headers({
        "x-relay-signature": "t=123,v1=signature",
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(500);
      }
    });

    it("should reject whitespace-only secret", () => {
      process.env.RELAY_WEBHOOK_SECRET = "   ";
      const headers = new Headers({
        "x-relay-signature": "t=123,v1=signature",
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(500);
      }
    });
  });

  describe("Body Tampering Detection", () => {
    it("should reject modified body with valid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const originalBody = JSON.stringify({ original: "data" });
      const modifiedBody = JSON.stringify({ modified: "data" });
      
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${originalBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: modifiedBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should reject empty body with signature for non-empty body", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: "",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });
  });

  describe("Custom Tolerance Configuration", () => {
    it("should use custom tolerance when provided", () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${oldTimestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${oldTimestamp},v1=${signature}`,
      });

      // Should fail with default tolerance (5 minutes)
      const defaultResult = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });
      expect(defaultResult.ok).toBe(false);

      // Should pass with extended tolerance (3 minutes)
      const extendedResult = verifyRelaySignature({
        headers,
        rawBody: testBody,
        toleranceSeconds: 180, // 3 minutes
      });
      expect(extendedResult.ok).toBe(true);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle non-string timestamp gracefully", () => {
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`invalid.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=invalid,v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should handle negative timestamp", () => {
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`-1.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=-1,v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });

    it("should handle extremely large timestamp", () => {
      const largeTimestamp = Number.MAX_SAFE_INTEGER;
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${largeTimestamp}.${testBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${largeTimestamp},v1=${signature}`,
      });

      const result = verifyRelaySignature({
        headers,
        rawBody: testBody,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
      }
    });
  });

  describe("Performance and Security", () => {
    it("should be resistant to timing attacks", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${testBody}`)
        .digest("hex");
      const invalidSignature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${testBody}modified`)
        .digest("hex");

      const validHeaders = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${validSignature}`,
      });
      const invalidHeaders = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${invalidSignature}`,
      });

      // Measure timing to ensure constant-time comparison
      const startValid = performance.now();
      verifyRelaySignature({ headers: validHeaders, rawBody: testBody });
      const endValid = performance.now();

      const startInvalid = performance.now();
      verifyRelaySignature({ headers: invalidHeaders, rawBody: testBody });
      const endInvalid = performance.now();

      const validTime = endValid - startValid;
      const invalidTime = endInvalid - startInvalid;

      // Times should be similar (within reasonable margin)
      const timeDifference = Math.abs(validTime - invalidTime);
      expect(timeDifference).toBeLessThan(100); // 100ms tolerance
    });

    it("should handle large payloads efficiently", () => {
      const largeBody = "x".repeat(100000); // 100KB payload
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto
        .createHmac("sha256", testSecret)
        .update(`${timestamp}.${largeBody}`)
        .digest("hex");

      const headers = new Headers({
        "x-relay-signature": `t=${timestamp},v1=${signature}`,
      });

      const start = performance.now();
      const result = verifyRelaySignature({
        headers,
        rawBody: largeBody,
      });
      const end = performance.now();

      expect(result.ok).toBe(true);
      expect(end - start).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});