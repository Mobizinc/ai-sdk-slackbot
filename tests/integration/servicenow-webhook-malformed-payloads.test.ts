/**
 * Integration tests for ServiceNow webhook endpoints with malformed payloads.
 * Tests the ServiceNowParser's ability to handle various malformed JSON payloads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ORIGINAL_ENV = { ...process.env };

// Mock the case triage service
const triageMock = {
  triageCase: vi.fn(),
  testConnectivity: vi.fn(),
  getTriageStats: vi.fn(),
};

// Mock the QStash client
const qstashModuleMock = {
  getQStashClient: vi.fn(),
  getWorkerUrl: vi.fn((path: string) => `https://worker${path}`),
  isQStashEnabled: vi.fn(() => false),
};

vi.mock("../../lib/services/case-triage", () => ({
  getCaseTriageService: () => triageMock,
}));

vi.mock("../../lib/queue/qstash-client", () => qstashModuleMock);

// Helper to load fixture files
function loadFixture(category: string, filename: string): string {
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'servicenow-payloads', category, filename);
  return readFileSync(fixturePath, 'utf8');
}

let POST: typeof import("../../api/servicenow-webhook").POST;
let GET: typeof import("../../api/servicenow-webhook").GET;

async function reloadApiModule() {
  vi.resetModules();
  const mod = await import("../../api/servicenow-webhook");
  POST = mod.POST;
  GET = mod.GET;
}

describe("ServiceNow Webhook - Malformed Payload Integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset environment
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      process.env[key] = value;
    }

    // Setup default environment
    process.env.ENABLE_CASE_CLASSIFICATION = "true";
    process.env.ENABLE_ASYNC_TRIAGE = "false";

    // Mock successful triage response
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

  describe("ServiceNowParser Integration", () => {
    it("should handle valid payload successfully", async () => {
      const payload = loadFixture('valid', 'complete-case.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.case_number).toBe("CASE0010001");
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
    });

    it("should handle payload with smart quotes", async () => {
      const payload = loadFixture('malformed', 'smart-quotes.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
      
      // Verify the parsed data was passed correctly
      const triageCall = triageMock.triageCase.mock.calls[0][0];
      expect(triageCall.case_number).toBe('CASE001003');
      expect(triageCall.short_description).toBe('Login issues with smart quotes');
    });

    it("should handle payload with trailing commas", async () => {
      const payload = loadFixture('malformed', 'trailing-comma.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
      
      const triageCall = triageMock.triageCase.mock.calls[0][0];
      expect(triageCall.case_number).toBe('CASE001004');
      expect(triageCall.short_description).toBe('Trailing comma issue');
    });

    it("should handle payload with control characters", async () => {
      const payload = loadFixture('malformed', 'control-chars.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
      
      const triageCall = triageMock.triageCase.mock.calls[0][0];
      expect(triageCall.case_number).toBe('CASE001005');
      expect(triageCall.short_description).toBe('Control characters in text');
    });

    it("should handle payload with missing commas", async () => {
      const payload = loadFixture('malformed', 'missing-comma.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
      
      const triageCall = triageMock.triageCase.mock.calls[0][0];
      expect(triageCall.case_number).toBe('CASE001006');
      expect(triageCall.short_description).toBe('Missing comma in JSON');
    });

    it("should handle incomplete payload", async () => {
      const payload = loadFixture('malformed', 'incomplete-payload.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
    });

    it("should recover payloads with invalid unicode escapes", async () => {
      const payload = loadFixture('malformed', 'invalid-unicode.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
      const triageCall = triageMock.triageCase.mock.calls[0][0];
      expect(triageCall.case_number).toBe('CASE001010');
    });

    it("should return error for completely invalid JSON", async () => {
      const invalidPayload = "{ this is not valid json }";
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: invalidPayload,
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain("Failed to parse payload");
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling and Logging", () => {
    it("should log parser metrics", async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = loadFixture('malformed', 'smart-quotes.json');
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      await POST(request);

      // Should have logged parser metrics (from parser)
      // Note: Parser logs metrics via console.log
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ServiceNowParser] Parse metrics:',
        expect.any(Object)
      );

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it("should handle empty payload gracefully", async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Failed to parse payload');
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });

    it("should handle non-JSON content type gracefully", async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toContain('Failed to parse payload');
      expect(triageMock.triageCase).not.toHaveBeenCalled();
    });
  });

  describe("Performance", () => {
    it("should process malformed payloads within acceptable time", async () => {
      const payloads = [
        loadFixture('malformed', 'smart-quotes.json'),
        loadFixture('malformed', 'trailing-comma.json'),
        loadFixture('malformed', 'control-chars.json'),
        loadFixture('malformed', 'missing-comma.json'),
      ];

      for (const payload of payloads) {
        const startTime = Date.now();
        
        const request = new Request('http://localhost:3000/api/servicenow-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        const response = await POST(request);
        const endTime = Date.now();
        
        expect(response.status).toBe(200);
        expect(endTime - startTime).toBeLessThan(100); // Should be well under 100ms including triage
      }
    });
  });
});
