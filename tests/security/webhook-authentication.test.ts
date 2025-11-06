/**
 * Webhook Authentication Security Tests
 * 
 * Comprehensive security tests for webhook authentication mechanisms
 * Tests multiple authentication methods and security vulnerabilities
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const triageMock = {
  triageCase: vi.fn(),
  testConnectivity: vi.fn(),
  getTriageStats: vi.fn(),
};

const qstashModuleMock = {
  getQStashClient: vi.fn(),
  getWorkerUrl: vi.fn((path: string) => `https://worker${path}`),
  isQStashEnabled: vi.fn(() => false),
};

vi.mock("../../lib/services/case-triage", () => ({
  getCaseTriageService: () => triageMock,
}));

vi.mock("../../lib/queue/qstash-client", () => qstashModuleMock);

let POST: typeof import("../../api/servicenow-webhook").POST;
let GET: typeof import("../../api/servicenow-webhook").GET;

async function reloadApiModule() {
  vi.resetModules();
  const mod = await import("../../api/servicenow-webhook");
  POST = mod.POST;
  GET = mod.GET;
}

describe("Webhook Authentication Security", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      process.env[key] = value;
    }

    process.env.ENABLE_CASE_CLASSIFICATION = "true";
    process.env.ENABLE_ASYNC_TRIAGE = "false";

    triageMock.triageCase.mockResolvedValue({
      caseNumber: "CASE0010001",
      caseSysId: "sys123",
      workflowId: "default",
      classification: {
        category: "Email & Collaboration",
        subcategory: "Email Access Issue",
        confidence_score: 0.92,
        urgency_level: "High",
        reasoning: "Mock reasoning",
        quick_summary: "Summary",
        immediate_next_steps: ["Step"],
        technical_entities: {},
        business_intelligence: {},
        record_type_suggestion: null,
      },
      similarCases: [],
      kbArticles: [],
      servicenowUpdated: true,
      updateError: undefined,
      processingTimeMs: 123,
      entitiesDiscovered: 2,
      cached: false,
      cacheReason: undefined,
      incidentCreated: false,
      incidentNumber: undefined,
      incidentSysId: undefined,
      incidentUrl: undefined,
      recordTypeSuggestion: undefined,
      catalogRedirected: false,
      catalogRedirectReason: undefined,
      catalogItemsProvided: 0,
    });

    triageMock.testConnectivity.mockResolvedValue({
      azureSearch: true,
      database: true,
      serviceNow: true,
    });

    triageMock.getTriageStats.mockResolvedValue({
      totalCases: 12,
      averageProcessingTime: 1111,
      averageConfidence: 0.87,
      cacheHitRate: 0.4,
      topWorkflows: [],
    });

    qstashModuleMock.getQStashClient.mockReturnValue(null);
    qstashModuleMock.getWorkerUrl.mockImplementation((path: string) => `https://worker${path}`);
    qstashModuleMock.isQStashEnabled.mockReturnValue(false);

    await reloadApiModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildRequest = (body: unknown, init: RequestInit = {}) =>
    new Request("https://example.com/api/servicenow-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    });

  describe("No Secret Configuration", () => {
    beforeEach(() => {
      delete process.env.SERVICENOW_WEBHOOK_SECRET;
    });

    it("should allow requests without authentication when no secret is configured", async () => {
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should document this as a security vulnerability", async () => {
      // This test documents that when no secret is configured, the API allows all requests
      // This is a security vulnerability that should be addressed in production
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Malicious request",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Note: This behavior should be documented as a security risk
    });
  });

  describe("API Key Authentication", () => {
    beforeEach(async () => {
      process.env.SERVICENOW_WEBHOOK_SECRET = "test-webhook-secret";
      await reloadApiModule();
    });

    it("should authenticate with x-api-key header", async () => {
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      }, {
        headers: { "x-api-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should authenticate with x-functions-key header (Azure Functions style)", async () => {
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      }, {
        headers: { "x-functions-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should authenticate with code query parameter (Azure Functions style)", async () => {
      const request = new Request("https://example.com/api/servicenow-webhook?code=test-webhook-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_number: "CASE0010001",
          sys_id: "sys123",
          short_description: "Test case",
        }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should reject requests with incorrect API key in header", async () => {
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      }, {
        headers: { "x-api-key": "wrong-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toContain("Authentication failed");
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });

    it("should reject requests with incorrect API key in query param", async () => {
      const request = new Request("https://example.com/api/servicenow-webhook?code=wrong-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_number: "CASE0010001",
          sys_id: "sys123",
          short_description: "Test case",
        }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });

    it("should reject requests without any authentication", async () => {
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });
  });

  describe("HMAC Signature Authentication", () => {
    beforeEach(async () => {
      process.env.SERVICENOW_WEBHOOK_SECRET = "test-webhook-secret";
      await reloadApiModule();
    });

    it("should authenticate with valid HMAC hex signature", async () => {
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });
      
      const signature = createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const request = buildRequest(payload, {
        headers: { 
          "x-servicenow-signature": signature,
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should authenticate with valid HMAC base64 signature", async () => {
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });
      
      const signature = createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('base64');

      const request = buildRequest(payload, {
        headers: { 
          "x-servicenow-signature": signature,
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should authenticate with generic signature header", async () => {
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });
      
      const signature = createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const request = buildRequest(payload, {
        headers: { 
          "signature": signature,
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should reject requests with invalid HMAC signature", async () => {
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });

      const request = buildRequest(payload, {
        headers: { 
          "x-servicenow-signature": "invalid-signature",
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });

    it("should reject requests with signature for wrong payload", async () => {
      const { createHmac } = await import('crypto');
      const originalPayload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Original case",
      });
      
      const modifiedPayload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Modified case - MALICIOUS",
      });
      
      // Sign original payload but send modified payload
      const signature = createHmac('sha256', 'test-webhook-secret')
        .update(originalPayload)
        .digest('hex');

      const request = buildRequest(modifiedPayload, {
        headers: { 
          "x-servicenow-signature": signature,
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(401);
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });
  });

  describe("Authentication Method Precedence", () => {
    beforeEach(async () => {
      process.env.SERVICENOW_WEBHOOK_SECRET = "test-webhook-secret";
      await reloadApiModule();
    });

    it("should prefer API key over signature when both are present", async () => {
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });
      
      const wrongSignature = createHmac('sha256', 'wrong-secret')
        .update(payload)
        .digest('hex');

      const request = buildRequest(payload, {
        headers: { 
          "x-api-key": "test-webhook-secret", // Correct API key
          "x-servicenow-signature": wrongSignature, // Wrong signature
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });

    it("should prefer header API key over query parameter when both are present", async () => {
      const request = new Request("https://example.com/api/servicenow-webhook?code=wrong-secret", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": "test-webhook-secret", // Correct header key
        },
        body: JSON.stringify({
          case_number: "CASE0010001",
          sys_id: "sys123",
          short_description: "Test case",
        }),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(triageMock.triageCase).toHaveBeenCalled();
    });
  });

  describe("Security Vulnerabilities", () => {
    beforeEach(async () => {
      process.env.SERVICENOW_WEBHOOK_SECRET = "test-webhook-secret";
      await reloadApiModule();
    });

    it("should document lack of rate limiting", async () => {
      // This test documents that the API doesn't implement rate limiting
      // Multiple rapid requests will all be processed if authenticated
      
      // Make multiple requests rapidly with separate request objects
      const responses = await Promise.all([
        POST(buildRequest({
          case_number: "CASE0010001",
          sys_id: "sys123",
          short_description: "Test case 1",
        }, {
          headers: { "x-api-key": "test-webhook-secret" },
        })),
        POST(buildRequest({
          case_number: "CASE0010002",
          sys_id: "sys124",
          short_description: "Test case 2",
        }, {
          headers: { "x-api-key": "test-webhook-secret" },
        })),
        POST(buildRequest({
          case_number: "CASE0010003",
          sys_id: "sys125",
          short_description: "Test case 3",
        }, {
          headers: { "x-api-key": "test-webhook-secret" },
        })),
      ]);

      // All should succeed (documenting lack of rate limiting)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it("should document lack of request size limits", async () => {
      // This test documents that the API doesn't limit request payload size
      const largePayload = {
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "A".repeat(1000000), // 1MB description
        additional_data: "B".repeat(1000000), // Another 1MB
      };

      const request = buildRequest(largePayload, {
        headers: { "x-api-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      // Should succeed, documenting lack of size limits
      expect(response.status).toBe(200);
    });

    it("should document lack of IP whitelisting", async () => {
      // This test documents that the API doesn't implement IP whitelisting
      // Any IP can send requests if they have valid authentication
      const request = buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case from any IP",
      }, {
        headers: { "x-api-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Note: IP whitelisting should be considered for production
    });

    it("should document potential timing attacks in signature verification", async () => {
      // This test documents that string comparison in signature verification
      // might be vulnerable to timing attacks (should use constant-time comparison)
      const { createHmac } = await import('crypto');
      const payload = JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test case",
      });
      
      const correctSignature = createHmac('sha256', 'test-webhook-secret')
        .update(payload)
        .digest('hex');

      const request = buildRequest(payload, {
        headers: { 
          "x-servicenow-signature": correctSignature,
          "Content-Type": "application/json",
        },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Note: Consider using crypto.timingSafeEqual() for signature comparison
    });
  });

  describe("Payload Security", () => {
    beforeEach(async () => {
      process.env.SERVICENOW_WEBHOOK_SECRET = "test-webhook-secret";
      await reloadApiModule();
    });

    it("should handle malicious JSON payloads", async () => {
      const maliciousPayload = {
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "<script>alert('xss')</script>",
        description: "javascript:alert('xss')",
        malicious_field: {
          nested: "evil content",
          __proto__: { polluted: true }, // Prototype pollution attempt
        },
      };

      const request = buildRequest(maliciousPayload, {
        headers: { "x-api-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // Note: This documents that input sanitization should be implemented
    });

    it("should handle control characters in payload", async () => {
      const payloadWithControlChars = {
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test with control chars: \x00\x01\x02",
      };

      const request = buildRequest(payloadWithControlChars, {
        headers: { "x-api-key": "test-webhook-secret" },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      // The API should sanitize control characters
    });

    it("should handle malformed JSON gracefully", async () => {
      const request = new Request("https://example.com/api/servicenow-webhook", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-api-key": "test-webhook-secret",
        },
        body: '{"case_number": "CASE0010001", "invalid": }', // Invalid JSON
      });

      const response = await POST(request);
      
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error).toContain("Invalid webhook payload schema");
    });
  });

  describe("Health Check Security", () => {
    it("should not require authentication for health check", async () => {
      const response = await GET();
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("healthy");
    });

    it("should not expose sensitive information in health check", async () => {
      const response = await GET();
      
      expect(response.status).toBe(200);
      const body = await response.json();
      
      // Should not expose secrets or sensitive configuration
      expect(body).not.toHaveProperty('SERVICENOW_WEBHOOK_SECRET');
      expect(body).not.toHaveProperty('database_connection_string');
      expect(body).not.toHaveProperty('api_keys');
    });
  });
});