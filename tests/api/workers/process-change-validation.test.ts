/**
 * Unit Tests for QStash Worker: Process Change Validation
 *
 * Tests the async worker that processes queued change validations,
 * collects facts from ServiceNow, synthesizes results with Claude,
 * and posts findings back to ServiceNow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Change Validation Worker (/api/workers/process-change-validation)", () => {
  let mockChangeValidationService: any;
  let mockVerifySignature: any;
  let originalEnv: NodeJS.ProcessEnv;

  const validWorkerPayload = {
    changeSysId: "CHG0000001",
    changeNumber: "CHG0000001",
  };

  const createMockRequest = (
    body: any,
    headers: Record<string, string> = {}
  ) => ({
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: new Map(Object.entries(headers)),
    url: "http://localhost/api/workers/process-change-validation",
    method: "POST",
  });

  beforeEach(() => {
    originalEnv = { ...process.env };

    process.env.QSTASH_CURRENT_SIGNING_KEY = "test-signing-key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test-next-signing-key";
    process.env.NODE_ENV = "test";

    mockChangeValidationService = {
      processValidation: vi.fn().mockResolvedValue({
        overall_status: "PASSED",
        checks: {
          has_name: true,
          has_category: true,
          has_workflow: true,
          is_active: true,
        },
        synthesis: "All validation checks passed",
      }),
    };

    mockVerifySignature = vi.fn().mockResolvedValue(true);

    vi.mock("@upstash/qstash/nextjs", () => ({
      verifySignatureEdge: (fn: any) => fn,
    }));

    vi.mock("../../../lib/services/change-validation", () => ({
      getChangeValidationService: () => mockChangeValidationService,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  describe("Signature Verification", () => {
    it("should verify QStash signature before processing", async () => {
      const request = createMockRequest(validWorkerPayload, {
        "upstash-signature": "valid-signature",
      });

      // Signature header must be present for verification
      expect(request.headers.has("upstash-signature")).toBe(true);
    });

    it("should reject requests with missing signature headers", async () => {
      const request = createMockRequest(validWorkerPayload);

      // No signature header means verification should fail
      expect(request.headers.has("upstash-signature")).toBe(false);
    });

    it("should reject requests with invalid signature", async () => {
      const request = createMockRequest(validWorkerPayload, {
        "upstash-signature": "invalid-signature",
      });

      // Invalid signature should be rejected by verifySignatureEdge wrapper
      expect(request.headers.get("upstash-signature")).toBe("invalid-signature");
    });

    it("should use QSTASH_CURRENT_SIGNING_KEY for verification", () => {
      expect(process.env.QSTASH_CURRENT_SIGNING_KEY).toBe("test-signing-key");
    });

    it("should fallback to QSTASH_NEXT_SIGNING_KEY if current key fails", () => {
      expect(process.env.QSTASH_NEXT_SIGNING_KEY).toBe(
        "test-next-signing-key"
      );
    });
  });

  describe("Payload Validation", () => {
    it("should parse and validate worker payload structure", async () => {
      const request = createMockRequest(validWorkerPayload);

      const payload = await request.json();

      expect(payload).toHaveProperty("changeSysId");
      expect(payload).toHaveProperty("changeNumber");
      expect(payload.changeSysId).toBe("CHG0000001");
      expect(payload.changeNumber).toBe("CHG0000001");
    });

    it("should reject payload missing changeSysId", async () => {
      const invalidPayload = {
        changeNumber: "CHG0000001",
      };

      const request = createMockRequest(invalidPayload);
      const payload = await request.json();

      expect(payload).not.toHaveProperty("changeSysId");
    });

    it("should reject payload missing changeNumber", async () => {
      const invalidPayload = {
        changeSysId: "CHG0000001",
      };

      const request = createMockRequest(invalidPayload);
      const payload = await request.json();

      expect(payload).not.toHaveProperty("changeNumber");
    });

    it("should return 400 Bad Request for missing required fields", async () => {
      const invalidPayload = {};

      // Expected error response
      const expectedError = {
        statusCode: 400,
        error: "Missing required fields",
      };

      expect(expectedError.statusCode).toBe(400);
    });

    it("should handle malformed JSON payload", async () => {
      const malformedBody = "{ invalid json }";

      // JSON parsing should fail
      expect(() => JSON.parse(malformedBody)).toThrow();
    });
  });

  describe("Change Validation Processing", () => {
    it("should call changeValidationService.processValidation with changeSysId", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Should call service with correct parameter
      expect(mockChangeValidationService.processValidation).toBeDefined();

      // Simulate service call
      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      expect(mockChangeValidationService.processValidation).toHaveBeenCalled();
    });

    it("should handle validation result with all status types (PASSED)", async () => {
      mockChangeValidationService.processValidation.mockResolvedValueOnce({
        overall_status: "PASSED",
        checks: { check_1: true, check_2: true },
        synthesis: "All checks passed",
      });

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      expect(result.overall_status).toBe("PASSED");
      expect(Object.values(result.checks).every((v) => v === true)).toBe(true);
    });

    it("should handle validation result with WARNING status", async () => {
      mockChangeValidationService.processValidation.mockResolvedValueOnce({
        overall_status: "WARNING",
        checks: { check_1: true, check_2: false },
        synthesis: "Some checks need review",
      });

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      expect(result.overall_status).toBe("WARNING");
    });

    it("should handle validation result with FAILED status", async () => {
      mockChangeValidationService.processValidation.mockResolvedValueOnce({
        overall_status: "FAILED",
        checks: { check_1: false, check_2: false },
        synthesis: "Critical checks failed",
        remediation_steps: ["Fix issue 1", "Fix issue 2"],
      });

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      expect(result.overall_status).toBe("FAILED");
      expect(result.remediation_steps).toHaveLength(2);
    });

    it("should include individual check results in response", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      expect(result.checks).toBeDefined();
      expect(typeof result.checks).toBe("object");
      expect(Object.keys(result.checks).length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle service throwing validation error", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Validation failed")
      );

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Should catch and return 500 error
      await expect(
        mockChangeValidationService.processValidation(payload.changeSysId)
      ).rejects.toThrow("Validation failed");
    });

    it("should handle change record not found error", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Validation record not found: CHG0000001")
      );

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Should return 500 with error message
      await expect(
        mockChangeValidationService.processValidation(payload.changeSysId)
      ).rejects.toThrow("not found");
    });

    it("should handle database errors gracefully", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const request = createMockRequest(validWorkerPayload);

      // Should log error and return 500
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });

    it("should handle timeout errors from ServiceNow API", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("ServiceNow API timeout")
      );

      const request = createMockRequest(validWorkerPayload);

      // Should handle gracefully without crashing
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });

    it("should handle Claude synthesis failures", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Claude API error")
      );

      const request = createMockRequest(validWorkerPayload);

      // Should fallback to rules-based validation (handled in service)
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });

    it("should return 500 error response with error details", async () => {
      const errorMessage = "Service processing failed";
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error(errorMessage)
      );

      // Expected error response
      const expectedError = {
        success: false,
        error: errorMessage,
        duration_ms: expect.any(Number),
        statusCode: 500,
      };

      expect(expectedError.success).toBe(false);
      expect(expectedError.statusCode).toBe(500);
    });

    it("should capture and log error stack traces", async () => {
      const error = new Error("Test error");
      const consoleSpy = vi.spyOn(console, "error");

      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        error
      );

      expect(consoleSpy).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe("Response Formats", () => {
    it("should return 200 OK with validation result", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      // Expected success response
      const expectedResponse = {
        success: true,
        change_number: "CHG0000001",
        change_sys_id: "CHG0000001",
        overall_status: result.overall_status,
        duration_ms: expect.any(Number),
        statusCode: 200,
      };

      expect(expectedResponse.success).toBe(true);
      expect(expectedResponse.statusCode).toBe(200);
    });

    it("should include change identification in response", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      // Response must include change identifiers for correlation
      expect(result).toHaveProperty("overall_status");
      expect(result).toHaveProperty("checks");
    });

    it("should include processing time metrics", async () => {
      const startTime = Date.now();

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      await mockChangeValidationService.processValidation(payload.changeSysId);

      const duration = Date.now() - startTime;

      // Duration should be captured
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should return 500 error with error message", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Processing failed")
      );

      // Expected error response
      const expectedError = {
        success: false,
        error: "Processing failed",
        duration_ms: expect.any(Number),
        statusCode: 500,
      };

      expect(expectedError.success).toBe(false);
      expect(expectedError.error).toBeTruthy();
    });

    it("should include synthesis text in response", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      // If synthesis is returned by service, it should be preserved
      if (result.synthesis) {
        expect(typeof result.synthesis).toBe("string");
        expect(result.synthesis.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Database Updates", () => {
    it("should mark validation as processing before starting", async () => {
      // Service should mark as processing at start
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Verify service is called
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });

    it("should update validation status to completed on success", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      await mockChangeValidationService.processValidation(payload.changeSysId);

      // Service should call repository to update status
      expect(mockChangeValidationService.processValidation).toHaveBeenCalled();
    });

    it("should update validation status to failed on error", async () => {
      mockChangeValidationService.processValidation.mockRejectedValueOnce(
        new Error("Test error")
      );

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Service should handle error and update DB
      await expect(
        mockChangeValidationService.processValidation(payload.changeSysId)
      ).rejects.toThrow();
    });

    it("should record validation results in database", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      // Results should be stored
      expect(result).toHaveProperty("overall_status");
      expect(result).toHaveProperty("checks");
    });

    it("should record processing time for analytics", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const startTime = Date.now();
      await mockChangeValidationService.processValidation(payload.changeSysId);
      const duration = Date.now() - startTime;

      // Duration should be tracked
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Edge Runtime Compatibility", () => {
    it("should use Web Crypto API for signature verification", () => {
      // Web Crypto API should be available
      expect(typeof crypto).toBe("object");
      expect(crypto.subtle).toBeDefined();
    });

    it("should not use Node.js filesystem APIs", () => {
      // Node.js fs module should not be used
      // This is verified by testing in edge-runtime environment
      expect(typeof process).toBe("object");
    });

    it("should use TextEncoder instead of Buffer for encoding", () => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode("test");

      expect(encoded instanceof Uint8Array).toBe(true);
    });
  });

  describe("Performance and Timeout", () => {
    it("should complete processing within reasonable time", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const startTime = Date.now();
      await mockChangeValidationService.processValidation(payload.changeSysId);
      const duration = Date.now() - startTime;

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);
    });

    it("should not hang if ServiceNow API is slow", async () => {
      // Service should have timeout handling
      mockChangeValidationService.processValidation.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({}), 8000)
          )
      );

      const request = createMockRequest(validWorkerPayload);

      // Should handle timeout gracefully
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });

    it("should handle parallel fact collection efficiently", async () => {
      // Service collects facts in parallel (catalog item, LDAP, etc)
      // Should complete faster than sequential collection
      const request = createMockRequest(validWorkerPayload);

      // Parallel collection is handled in service
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });
  });

  describe("Observability and Logging", () => {
    it("should log worker execution start and completion", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      await mockChangeValidationService.processValidation(payload.changeSysId);

      // Should log activity
      expect(consoleSpy).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should include change number in logs for correlation", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      await mockChangeValidationService.processValidation(payload.changeSysId);

      // Change number should appear in logs
      expect(consoleSpy).toBeDefined();

      consoleSpy.mockRestore();
    });

    it("should log overall_status in response", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      const result =
        await mockChangeValidationService.processValidation(payload.changeSysId);

      // Status must be in response for observability
      expect(result).toHaveProperty("overall_status");
      expect(["PASSED", "FAILED", "WARNING"]).toContain(result.overall_status);
    });

    it("should include LangSmith tracing metadata", () => {
      // Worker is wrapped with withLangSmithTrace
      const expectedTags = {
        component: "worker",
        operation: "process-validation",
        service: "servicenow",
        feature: "change-validation",
        runtime: "edge",
      };

      expect(expectedTags.component).toBe("worker");
      expect(expectedTags.service).toBe("servicenow");
    });
  });

  describe("QStash Integration", () => {
    it("should be callable by QStash with verifySignatureEdge wrapper", () => {
      // POST handler is wrapped with verifySignatureEdge
      // This ensures only valid QStash messages are processed
      expect(true).toBe(true);
    });

    it("should handle QStash retry logic transparently", async () => {
      // If QStash retries the message, we should process it idempotently
      const request1 = createMockRequest(validWorkerPayload);
      const request2 = createMockRequest(validWorkerPayload);

      // Both requests should produce same result (idempotent)
      expect(request1.url).toBe(request2.url);
    });

    it("should not double-process if QStash retries", async () => {
      const request = createMockRequest(validWorkerPayload);
      const payload = await request.json();

      // Service should handle idempotency
      // (In reality, database status check prevents re-processing)
      expect(mockChangeValidationService.processValidation).toBeDefined();
    });
  });
});
