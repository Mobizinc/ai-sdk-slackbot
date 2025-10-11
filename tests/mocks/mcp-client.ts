/**
 * Mock utilities for testing MCP client
 */

import { vi } from "vitest";

export interface MockToolResult {
  content: Array<{
    type: string;
    text?: string;
  }>;
}

/**
 * Create a mock MCP Client
 */
export function createMockMCPClient(overrides?: Partial<any>) {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn<any, Promise<MockToolResult>>(),
    ...overrides,
  };
}

/**
 * Create a mock SSE transport
 */
export function createMockSSETransport() {
  return {};
}

/**
 * Mock the @modelcontextprotocol/sdk module
 */
export function mockMCPSDK() {
  vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
    Client: vi.fn().mockImplementation(() => createMockMCPClient()),
  }));

  vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
    SSEClientTransport: vi.fn().mockImplementation(() => createMockSSETransport()),
  }));
}

/**
 * Create mock Microsoft Learn search response
 */
export function createMockSearchResponse(results: Array<{
  title: string;
  url: string;
  content: string;
}>): MockToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results),
      },
    ],
  };
}

/**
 * Create mock code sample response
 */
export function createMockCodeSampleResponse(samples: Array<{
  title: string;
  url: string;
  code: string;
  language?: string;
}>): MockToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(samples),
      },
    ],
  };
}

/**
 * Create mock documentation fetch response
 */
export function createMockDocResponse(doc: {
  title: string;
  content: string;
  fullText: string;
}): MockToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(doc),
      },
    ],
  };
}

/**
 * Create empty response
 */
export function createEmptyResponse(): MockToolResult {
  return {
    content: [],
  };
}

/**
 * Create plain text response (non-JSON)
 */
export function createPlainTextResponse(text: string): MockToolResult {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

/**
 * Create error response
 */
export function createErrorResponse(message: string): Promise<never> {
  return Promise.reject(new Error(message));
}
