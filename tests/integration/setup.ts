/**
 * Integration Test Setup
 *
 * This setup file is used for integration tests that need to connect
 * to real external services (ServiceNow, databases, APIs).
 *
 * Unlike the main test setup, this does NOT mock HTTP requests with MSW.
 */

import { afterEach, vi } from "vitest";

// Set test environment variables if not already set
// Integration tests may override these with real credentials
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}
if (!process.env.SLACK_BOT_TOKEN) {
  process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
}
if (!process.env.SLACK_SIGNING_SECRET) {
  process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
}

// For ServiceNow, use placeholder values that will be overridden by real credentials
// if the developer has them configured
if (!process.env.SERVICENOW_INSTANCE_URL && !process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = "https://example.service-now.com";
  process.env.SERVICENOW_USERNAME = "test-user";
  process.env.SERVICENOW_PASSWORD = "test-password";
}

afterEach(() => {
  vi.clearAllMocks();
});
