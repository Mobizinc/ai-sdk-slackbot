import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";

// Set environment variables at module load time (before other imports)
process.env.NODE_ENV = "test";
process.env.VITEST = "true";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-openai-key";
process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "xoxb-test-token";
process.env.SLACK_SIGNING_SECRET =
  process.env.SLACK_SIGNING_SECRET ?? "test-signing-secret";
process.env.SERVICENOW_INSTANCE_URL =
  process.env.SERVICENOW_INSTANCE_URL ?? "https://example.service-now.com";
process.env.SERVICENOW_USERNAME =
  process.env.SERVICENOW_USERNAME ?? "test-user";
process.env.SERVICENOW_PASSWORD =
  process.env.SERVICENOW_PASSWORD ?? "test-password";
process.env.SERVICENOW_CASE_TABLE =
  process.env.SERVICENOW_CASE_TABLE ?? "sn_customerservice_case";
process.env.SERVICENOW_CASE_JOURNAL_NAME =
  process.env.SERVICENOW_CASE_JOURNAL_NAME ?? "x_mobit_serv_case_service_case";
process.env.RELAY_WEBHOOK_SECRET =
  process.env.RELAY_WEBHOOK_SECRET ?? "test-relay-secret";
process.env.ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? "test-anthropic-key";

vi.mock("../lib/agent/classification/pipeline/stage-categorization", () => ({
  runCategorizationStage: vi.fn(async () => ({
    data: {
      category: "Application Support",
      subcategory: "General Issue",
      incident_category: "Application Support",
      incident_subcategory: "General",
      confidence_score: 0.9,
      reasoning: "Mock categorization for tests",
      keywords: ["mock", "test"],
      technical_entities: {
        ip_addresses: [],
        systems: ["test-system"],
        users: [],
        software: [],
        error_codes: [],
      },
      urgency_level: "Medium",
      record_type_suggestion: {
        type: "Case",
        is_major_incident: false,
        reasoning: "Standard mock",
      },
      service_offering: "Helpdesk and Endpoint - Standard",
      application_service: null,
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
}));

vi.mock("../lib/agent/classification/pipeline/stage-narrative", () => ({
  runNarrativeStage: vi.fn(async () => ({
    data: {
      quick_summary: "Mock summary for tests.",
      immediate_next_steps: [
        "Gather additional context from user",
        "Check related ServiceNow records",
      ],
      tone: "confident",
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
}));

vi.mock("../lib/agent/classification/pipeline/stage-business-intel", () => ({
  runBusinessIntelStage: vi.fn(async () => ({
    data: {
      business_intelligence: {
        project_scope_detected: false,
        outside_service_hours: false,
      },
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  })),
}));

vi.mock("../lib/supervisor/llm-reviewer", () => ({
  runSupervisorLlmReview: vi.fn(async () => null),
}));

// Mock console methods to prevent "unhandled errors" during tests
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

export const server = setupServer();

beforeAll(() => {
  // Use "bypass" for integration tests to allow real HTTP requests
  // Use "error" for unit tests to catch unmocked requests
  const strategy = process.env.INTEGRATION_TEST === "true" ? "bypass" : "error";
  server.listen({ onUnhandledRequest: strategy });
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});
