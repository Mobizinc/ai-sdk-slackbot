/**
 * Shared mocking utilities for smoke tests
 */

import { vi } from 'vitest';
import type { ChatRequest, ChatResponse } from '../../lib/services/anthropic-chat';

// Environment setup for smoke tests
export function setupSmokeTestEnvironment() {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_INSTANCE_URL ?? "https://example.service-now.com";
  process.env.SERVICENOW_CASE_TABLE = process.env.SERVICENOW_CASE_TABLE ?? "sn_customerservice_case";
  process.env.SERVICENOW_CASE_JOURNAL_NAME = process.env.SERVICENOW_CASE_JOURNAL_NAME ?? "x_mobit_serv_case_service_case";
  process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "xoxb-test-token";
  process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "test-signing-secret";
}

// Create a minimal Next.js Request object
export function createMockRequest(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): Request {
  const { method = 'GET', headers = {}, body } = options;
  
  return new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'smoke-test',
      ...headers,
    },
    body: body ? body : undefined,
  });
}

// Create an authorized admin request
export function createAdminRequest(url: string, options: Omit<Parameters<typeof createMockRequest>[1], 'headers'> = {}): Request {
  return createMockRequest(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer test-admin-token',
    },
  });
}

// Mock Anthropic service
export function mockAnthropicService() {
  const mockResponse: ChatResponse = {
    message: {
      id: 'smoke-test-message',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Smoke test response', citations: [] }],
      usage: { input_tokens: 10, output_tokens: 5 },
    } as any,
    toolCalls: [],
    outputText: 'Smoke test response',
    usage: { input_tokens: 10, output_tokens: 5 } as any,
  };

  const mockService = {
    async send(request: ChatRequest): Promise<ChatResponse> {
      const lastMessage = [...request.messages].reverse().find((msg) => msg.role === 'user');
      const text = lastMessage?.content as string || 'No user message';
      
      return {
        ...mockResponse,
        outputText: `Response to: ${text.substring(0, 50)}...`,
        message: {
          ...mockResponse.message,
          content: [{ type: 'text', text: `Response to: ${text.substring(0, 50)}...`, citations: [] }],
        },
      };
    },
  };

  vi.doMock('../../lib/services/anthropic-chat', () => ({
    AnthropicChatService: {
      getInstance: () => mockService,
    },
  }));

  return mockService;
}

// Mock ServiceNow client
export function mockServiceNowClient() {
  const mockClient = {
    isConfigured: () => true,
    getCase: vi.fn().mockResolvedValue({
      sys_id: 'CASE_SYS_ID',
      number: 'SCS0048402',
      short_description: 'Test Case',
      priority: '4',
      state: '10',
    }),
    getCaseJournal: vi.fn().mockResolvedValue([
      {
        sys_id: 'JOURNAL1',
        element: 'comments',
        element_id: 'CASE_SYS_ID',
        sys_created_on: '2025-10-06 15:49:31',
        sys_created_by: 'agent@example.com',
        value: 'Test journal entry',
      },
    ]),
    addCaseWorkNote: vi.fn().mockResolvedValue(undefined),
  };

  vi.doMock('../../lib/tools/servicenow', () => ({
    serviceNowClient: mockClient,
  }));

  return mockClient;
}

// Mock Slack messaging service
export function mockSlackMessagingService() {
  const mockMessaging = {
    getBotUserId: vi.fn().mockResolvedValue('U1234567890'),
    postToThread: vi.fn().mockResolvedValue(undefined),
    postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456' }),
  };

  vi.doMock('../../lib/services/slack-messaging', () => ({
    getSlackMessagingService: () => mockMessaging,
  }));

  return mockMessaging;
}

// Mock interactive state manager
export function mockInteractiveStateManager() {
  const mockStates = new Map([
    ['test-state-123', {
      id: 'test-state-123',
      type: 'supervisor_review',
      channelId: 'C123456',
      messageTs: '1234567890.123456',
      status: 'pending',
      payload: {
        artifactType: 'slack_message',
        caseNumber: 'SCS0048402',
        reason: 'Test review',
        blockedAt: new Date().toISOString(),
        content: 'Test content',
        channelId: 'C123456',
        threadTs: '1234567890.123456',
        metadata: { sysId: 'CASE_SYS_ID' },
      },
    }],
  ]);

  const mockManager = {
    getStateById: vi.fn().mockImplementation((stateId: string) => {
      return Promise.resolve(mockStates.get(stateId));
    }),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    getPendingStatesByType: vi.fn().mockResolvedValue(Array.from(mockStates.values())),
  };

  vi.doMock('../../lib/services/interactive-state-manager', () => ({
    getInteractiveStateManager: () => mockManager,
  }));

  return mockManager;
}

// Mock background task enqueueing
export function mockBackgroundTasks() {
  const mockEnqueue = vi.fn().mockResolvedValue(undefined);
  
  vi.doMock('../../lib/background-tasks', () => ({
    enqueueBackgroundTask: mockEnqueue,
  }));

  return mockEnqueue;
}

// Mock fetch for external API calls
export function mockGlobalFetch() {
  const originalFetch = globalThis.fetch;
  
  const mockFetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    
    // Mock ServiceNow API responses
    if (url.includes('/api/now/table/sn_customerservice_case')) {
      return new Response(JSON.stringify({
        result: [{
          sys_id: 'CASE_SYS_ID',
          number: 'SCS0048402',
          short_description: 'Test Case',
          priority: '4',
          state: '10',
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/api/now/table/sys_journal_field')) {
      return new Response(JSON.stringify({
        result: [{
          sys_id: 'JOURNAL1',
          element: 'comments',
          element_id: 'CASE_SYS_ID',
          sys_created_on: '2025-10-06 15:49:31',
          sys_created_by: 'agent@example.com',
          value: 'Test journal entry',
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Default 404 for unknown endpoints
    return new Response(JSON.stringify({ result: [] }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  });

  globalThis.fetch = mockFetch;
  
  return {
    mockFetch,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

// Create a mock Slack event payload
export function createMockSlackEvent(overrides: Partial<any> = {}) {
  return {
    type: 'event_callback',
    event: {
      type: 'message',
      channel: 'C123456',
      user: 'U1234567890',
      text: 'Test message',
      ts: '1234567890.123456',
      ...overrides,
    },
  };
}

// Create a mock ServiceNow webhook payload
export function createMockServiceNowPayload(overrides: Partial<any> = {}) {
  return {
    sys_id: 'CASE_SYS_ID',
    number: 'SCS0048402',
    short_description: 'Test Case',
    priority: '4',
    state: '10',
    ...overrides,
  };
}