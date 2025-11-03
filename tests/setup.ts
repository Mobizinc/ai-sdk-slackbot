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
