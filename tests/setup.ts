import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";

export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-openai-key";
  process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "xoxb-test-token";
  process.env.SLACK_SIGNING_SECRET =
    process.env.SLACK_SIGNING_SECRET ?? "test-signing-secret";
  process.env.SERVICENOW_INSTANCE_URL =
    process.env.SERVICENOW_INSTANCE_URL ?? "https://example.service-now.com";
  process.env.SERVICENOW_CASE_TABLE =
    process.env.SERVICENOW_CASE_TABLE ?? "sn_customerservice_case";
  process.env.SERVICENOW_CASE_JOURNAL_NAME =
    process.env.SERVICENOW_CASE_JOURNAL_NAME ?? "x_mobit_serv_case_service_case";
});

afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});
