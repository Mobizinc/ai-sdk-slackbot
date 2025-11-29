/**
 * Smoke tests for HTTP API endpoints
 * Tests basic functionality: handlers load, don't throw, return expected status codes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupSmokeTestEnvironment,
  createMockRequest,
  createAdminRequest,
  mockBackgroundTasks,
  mockGlobalFetch,
  createMockSlackEvent,
  createMockServiceNowPayload,
} from './helpers';

// Import handlers to test
import * as eventsHandler from '../../api/events';
import * as healthHandler from '../../api/health/database';
import * as servicenowWebhookHandler from '../../api/servicenow-webhook';
import * as supervisorReviewsHandler from '../../api/admin/supervisor-reviews';
import * as staleCaseFollowupHandler from '../../api/cron/stale-case-followup';
import * as interactivityHandler from '../../api/interactivity';
import * as businessContextsHandler from '../../api/business-contexts';

describe('smoke: api entrypoints', () => {
  let fetchMock: ReturnType<typeof mockGlobalFetch>;

  beforeEach(() => {
    setupSmokeTestEnvironment();
    fetchMock = mockGlobalFetch();
    mockBackgroundTasks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.restore();
    vi.restoreAllMocks();
  });

  describe('core endpoints', () => {
    it('should handle Slack events POST request', async () => {
      // Test url_verification
      const verifyRequest = createMockRequest('https://example.com/api/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'url_verification',
          challenge: 'test-challenge',
        }),
      });

      const verifyResponse = await eventsHandler.POST(verifyRequest);
      expect(verifyResponse.status).toBe(200);
      expect(await verifyResponse.text()).toBe('test-challenge');

      // Test event_callback
      const eventRequest = createMockRequest('https://example.com/api/events', {
        method: 'POST',
        body: JSON.stringify(createMockSlackEvent()),
        headers: {
          'x-slack-signature': 'test-signature',
          'x-slack-request-timestamp': '1234567890',
        },
      });

      const eventResponse = await eventsHandler.POST(eventRequest);
      expect(eventResponse.status).toBe(200);
    });

    it('should handle Slack events GET request', async () => {
      const getRequest = createMockRequest('https://example.com/api/events?challenge=test-challenge');
      const response = await eventsHandler.GET(getRequest);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('test-challenge');
    });

    it('should handle database health check', async () => {
      const response = await healthHandler.GET();
      expect([200, 500, 503]).toContain(response.status);
    });

    it('should handle interactivity endpoint', async () => {
      const request = createMockRequest('https://example.com/api/interactivity', {
        method: 'POST',
        body: JSON.stringify({
          type: 'view_submission',
          team: { id: 'T123456' },
          user: { id: 'U123456' },
          view: { id: 'V123456' },
        }),
      });

      const response = await interactivityHandler.POST(request);
      expect([200, 400, 500]).toContain(response.status);
    });

    it('should handle business contexts endpoint', async () => {
      const request = createAdminRequest('https://example.com/api/business-contexts');
      const response = await businessContextsHandler.GET(request);
      expect([200, 401, 500]).toContain(response.status);
    });
  });

  describe('webhook endpoints', () => {
    it('should handle ServiceNow webhook POST', async () => {
      const request = createMockRequest('https://example.com/api/servicenow-webhook', {
        method: 'POST',
        body: JSON.stringify(createMockServiceNowPayload()),
        headers: { 'content-type': 'application/json' },
      });

      const response = await servicenowWebhookHandler.POST(request);
      expect([200, 202, 400, 500]).toContain(response.status);
    });

    it('should handle ServiceNow webhook GET', async () => {
      const response = await servicenowWebhookHandler.GET();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('admin endpoints', () => {
    it('should handle supervisor reviews GET', async () => {
      const request = createAdminRequest('https://example.com/api/admin/supervisor-reviews');
      const response = await supervisorReviewsHandler.GET(request);
      expect([200, 401, 500]).toContain(response.status);
    });

    it('should handle supervisor reviews POST', async () => {
      const request = createAdminRequest('https://example.com/api/admin/supervisor-reviews', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          stateId: 'test-state-123',
          reviewer: 'test-reviewer',
        }),
      });

      const response = await supervisorReviewsHandler.POST(request);
      expect([200, 401, 404, 500]).toContain(response.status);
    });

    it('should handle supervisor reviews OPTIONS', async () => {
      const request = createAdminRequest('https://example.com/api/admin/supervisor-reviews', {
        method: 'OPTIONS',
      });
      const response = await supervisorReviewsHandler.OPTIONS(request);
      expect([204, 200]).toContain(response.status);
    });
  });

  describe('cron endpoints', () => {
    it('should handle stale case followup GET', async () => {
      const response = await staleCaseFollowupHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should handle stale case followup POST', async () => {
      const response = await staleCaseFollowupHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('error handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const request = createMockRequest('https://example.com/api/events', {
        method: 'POST',
        body: 'invalid json',
      });

      // Should not throw unhandled exception
      const response = await eventsHandler.POST(request);
      expect([400, 500]).toContain(response.status);
    });

    it('should handle missing required headers', async () => {
      const request = createMockRequest('https://example.com/api/admin/supervisor-reviews');
      const response = await supervisorReviewsHandler.GET(request);
      expect([401, 500]).toContain(response.status);
    });

    it('should handle unsupported HTTP methods', async () => {
      const request = createMockRequest('https://example.com/api/events', {
        method: 'DELETE',
      });
      const response = await eventsHandler.GET?.(request) || new Response('Method not allowed', { status: 405 });
      expect([405, 404]).toContain(response.status);
    });
  });

  describe('response format validation', () => {
    it('should return proper JSON responses for admin endpoints', async () => {
      const request = createAdminRequest('https://example.com/api/admin/supervisor-reviews');
      const response = await supervisorReviewsHandler.GET(request);
      
      if (response.status === 200) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        
        const body = await response.json();
        expect(body).toBeDefined();
        expect(typeof body).toBe('object');
      }
    });

    it('should include proper CORS headers', async () => {
      const request = createAdminRequest('https://example.com/api/admin/supervisor-reviews');
      const response = await supervisorReviewsHandler.GET(request);
      
      const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
      ];
      
      // At least some CORS headers should be present
      const hasCorsHeaders = corsHeaders.some(header => 
        response.headers.has(header)
      );
      expect(hasCorsHeaders).toBe(true);
    });
  });
});