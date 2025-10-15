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

vi.mock("../lib/services/case-triage", () => ({
  getCaseTriageService: () => triageMock,
}));

vi.mock("../lib/queue/qstash-client", () => qstashModuleMock);

let POST: typeof import("../api/servicenow-webhook").POST;
let GET: typeof import("../api/servicenow-webhook").GET;

async function reloadApiModule() {
  vi.resetModules();
  const mod = await import("../api/servicenow-webhook");
  POST = mod.POST;
  GET = mod.GET;
}

describe("ServiceNow Webhook", () => {
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
    new Request("http://localhost/api/servicenow-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      body:
        typeof body === "string"
          ? body
          : JSON.stringify(body),
      ...init,
    });

  it("returns 503 when classification is disabled", async () => {
    process.env.ENABLE_CASE_CLASSIFICATION = "false";
    await reloadApiModule();

    const response = await POST(
      buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "User cannot access email",
      })
    );
    expect(response.status).toBe(503);
  });

  it("processes a valid webhook synchronously", async () => {
    const response = await POST(
      buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "User cannot access email",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.case_number).toBe("CASE0010001");
    expect(data.classification.category).toBe("Email & Collaboration");
    expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when payload fails validation", async () => {
    const response = await POST(buildRequest({ case_number: "ONLY" }));
    expect(response.status).toBe(422);
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/servicenow-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("parses payload containing control characters", async () => {
    const rawPayload = '{"case_number":"CASE0010001","sys_id":"sys123","short_description":"Hello\u0002World"}';

    const response = await POST(
      buildRequest(rawPayload, { headers: { "Content-Type": "application/json" } })
    );

    expect(response.status).toBe(200);
    expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
  });

  it("parses base64 encoded payloads", async () => {
    const jsonPayload = JSON.stringify({
      case_number: "CASE0010001",
      sys_id: "sys123",
      short_description: "Base64 payload",
    });
    const base64Payload = Buffer.from(jsonPayload, "utf8").toString("base64");

    const response = await POST(
      buildRequest(base64Payload, { headers: { "Content-Type": "text/plain" } })
    );

    expect(response.status).toBe(200);
    expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
  });

  it("parses x-www-form-urlencoded payloads", async () => {
    const params = new URLSearchParams();
    params.set(
      "payload",
      JSON.stringify({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "URLEncoded payload",
      })
    );

    const request = new Request("http://localhost/api/servicenow-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(triageMock.triageCase).toHaveBeenCalledTimes(1);
  });

  it("validates secrets when configured", async () => {
    process.env.SERVICENOW_WEBHOOK_SECRET = "secret";
    await reloadApiModule();

    const response = await POST(
      buildRequest(
        {
          case_number: "CASE0010001",
          sys_id: "sys123",
          short_description: "Test",
        },
        { headers: { "x-api-key": "secret" } }
      )
    );

    expect(response.status).toBe(200);
  });

  it("rejects unauthenticated requests when secret is set", async () => {
    process.env.SERVICENOW_WEBHOOK_SECRET = "secret";
    await reloadApiModule();

    const response = await POST(
      buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "Test",
      })
    );

    expect(response.status).toBe(401);
  });

  it("queues cases when async triage is enabled", async () => {
    process.env.ENABLE_ASYNC_TRIAGE = "true";
    qstashModuleMock.isQStashEnabled.mockReturnValue(true);
    const publish = vi.fn().mockResolvedValue(undefined);
    qstashModuleMock.getQStashClient.mockReturnValue({ publishJSON: publish });
    await reloadApiModule();

    const response = await POST(
      buildRequest({
        case_number: "CASE0010001",
        sys_id: "sys123",
        short_description: "User cannot access email",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.queued).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(triageMock.triageCase).not.toHaveBeenCalled();
  });

  it("reports healthy status from GET endpoint", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("healthy");
    expect(data.connectivity.azure_search).toBe(true);
  });
});
