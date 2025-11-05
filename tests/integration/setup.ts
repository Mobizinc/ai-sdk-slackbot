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
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
}

// For ServiceNow, only set placeholder values if explicitly marked as mock
// Don't set them automatically to avoid interfering with integration test detection
if (process.env.USE_MOCK_SERVICENOW === "true") {
  if (!process.env.SERVICENOW_INSTANCE_URL && !process.env.SERVICENOW_URL) {
    process.env.SERVICENOW_INSTANCE_URL = "https://example.service-now.com";
    process.env.SERVICENOW_USERNAME = "test-user";
    process.env.SERVICENOW_PASSWORD = "test-password";
  }
}

// Mark as integration test to configure MSW properly
process.env.INTEGRATION_TEST = "true";

afterEach(() => {
  vi.clearAllMocks();
});
