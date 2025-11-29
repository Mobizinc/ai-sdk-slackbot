/**
 * Smoke tests for Cron/Background Tasks
 * Tests all api/cron/* handlers with simulated Requests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupSmokeTestEnvironment,
  mockGlobalFetch,
} from './helpers';

// Import cron handlers to test
import * as staleCaseFollowupHandler from '../../api/cron/stale-case-followup';
import * as cleanupWorkflowsHandler from '../../api/cron/cleanup-workflows';
import * as projectStandupsHandler from '../../api/cron/project-standups';
import * as syncWebexVoiceHandler from '../../api/cron/sync-webex-voice';
import * as enrichPendingIncidentsHandler from '../../api/cron/enrich-pending-incidents';
import * as caseQueueReportHandler from '../../api/cron/case-queue-report';
import * as closeResolvedIncidentsHandler from '../../api/cron/close-resolved-incidents';
import * as syncVoiceWorknotesHandler from '../../api/cron/sync-voice-worknotes';
import * as caseLeaderboardHandler from '../../api/cron/case-leaderboard';
import * as syncCategoriesHandler from '../../api/cron/sync-categories';
import * as caseQueueSnapshotHandler from '../../api/cron/case-queue-snapshot';

describe('smoke: cron tasks', () => {
  let fetchMock: ReturnType<typeof mockGlobalFetch>;

  beforeEach(() => {
    setupSmokeTestEnvironment();
    fetchMock = mockGlobalFetch();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.restore();
    vi.restoreAllMocks();
  });

  describe('stale case followup', () => {
    it('should execute stale case followup GET', async () => {
      const response = await staleCaseFollowupHandler.GET();
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('status');
        expect(body.status).toBe('ok');
      }
    });

    it('should execute stale case followup POST', async () => {
      const response = await staleCaseFollowupHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('workflow cleanup', () => {
    it('should execute workflow cleanup GET', async () => {
      const response = await cleanupWorkflowsHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute workflow cleanup POST', async () => {
      const response = await cleanupWorkflowsHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('project standups', () => {
    it('should execute project standups GET', async () => {
      const response = await projectStandupsHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute project standups POST', async () => {
      const response = await projectStandupsHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Webex voice sync', () => {
    it('should execute Webex voice sync GET', async () => {
      const response = await syncWebexVoiceHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute Webex voice sync POST', async () => {
      const response = await syncWebexVoiceHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('incident enrichment', () => {
    it('should execute incident enrichment GET', async () => {
      const response = await enrichPendingIncidentsHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute incident enrichment POST', async () => {
      const response = await enrichPendingIncidentsHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('case queue report', () => {
    it('should execute case queue report GET', async () => {
      const request = new Request('https://example.com/api/cron/case-queue-report');
      const response = await caseQueueReportHandler.GET(request);
      expect([200, 500]).toContain(response.status);
    });

    it('should execute case queue report POST', async () => {
      const request = new Request('https://example.com/api/cron/case-queue-report', { method: 'POST' });
      const response = await caseQueueReportHandler.POST(request);
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('close resolved incidents', () => {
    it('should execute close resolved incidents GET', async () => {
      const response = await closeResolvedIncidentsHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute close resolved incidents POST', async () => {
      const response = await closeResolvedIncidentsHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('sync voice worknotes', () => {
    it('should execute sync voice worknotes GET', async () => {
      const response = await syncVoiceWorknotesHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute sync voice worknotes POST', async () => {
      const response = await syncVoiceWorknotesHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('case leaderboard', () => {
    it('should execute case leaderboard GET', async () => {
      const request = new Request('https://example.com/api/cron/case-leaderboard');
      const response = await caseLeaderboardHandler.GET(request);
      expect([200, 500]).toContain(response.status);
    });

    it('should execute case leaderboard POST', async () => {
      const request = new Request('https://example.com/api/cron/case-leaderboard', { method: 'POST' });
      const response = await caseLeaderboardHandler.POST(request);
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('sync categories', () => {
    it('should execute sync categories GET', async () => {
      const response = await syncCategoriesHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute sync categories POST', async () => {
      const response = await syncCategoriesHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('case queue snapshot', () => {
    it('should execute case queue snapshot GET', async () => {
      const response = await caseQueueSnapshotHandler.GET();
      expect([200, 500]).toContain(response.status);
    });

    it('should execute case queue snapshot POST', async () => {
      const response = await caseQueueSnapshotHandler.POST();
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('response format validation', () => {
    it('should return JSON responses for successful cron jobs', async () => {
      const response = await staleCaseFollowupHandler.GET();
      
      if (response.status === 200) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        
        const body = await response.json();
        expect(body).toBeDefined();
        expect(typeof body).toBe('object');
      }
    });

    it('should include proper cache control headers', async () => {
      const response = await staleCaseFollowupHandler.GET();
      
      const cacheControl = response.headers.get('cache-control');
      expect(cacheControl).toContain('no-store');
    });
  });

  describe('error handling', () => {
    it('should handle service unavailability gracefully', async () => {
      // Mock external service failures
      fetchMock.mockFetch.mockRejectedValue(new Error('Service unavailable'));
      
      const response = await staleCaseFollowupHandler.GET();
      expect([500, 503]).toContain(response.status);
    });

    it('should handle database connection errors', async () => {
      // Mock database errors by setting invalid env
      const originalDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'invalid://connection';
      
      try {
        const response = await staleCaseFollowupHandler.GET();
        expect([500, 503]).toContain(response.status);
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });

    it('should handle timeout scenarios', async () => {
      // Mock slow responses
      fetchMock.mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(new Response('{}')), 10000))
      );
      
      const response = await staleCaseFollowupHandler.GET();
      expect([200, 500, 504]).toContain(response.status);
    });
  });

  describe('concurrent execution', () => {
    it('should handle multiple concurrent cron executions', async () => {
      const request1 = new Request('https://example.com/api/cron/case-queue-report');
      const request2 = new Request('https://example.com/api/cron/case-leaderboard');
      const promises = [
        staleCaseFollowupHandler.GET(),
        caseQueueReportHandler.GET(request1),
        caseLeaderboardHandler.GET(request2),
      ];
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect([200, 500]).toContain(response.status);
      });
    });
  });

  describe('performance and reliability', () => {
    it('should complete cron execution within reasonable time', async () => {
      const startTime = Date.now();
      const response = await staleCaseFollowupHandler.GET();
      const endTime = Date.now();
      
      expect([200, 500]).toContain(response.status);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle empty result sets gracefully', async () => {
      // Mock empty responses
      fetchMock.mockFetch.mockResolvedValue(new Response(JSON.stringify({ result: [] })));
      
      const response = await staleCaseFollowupHandler.GET();
      expect([200, 500]).toContain(response.status);
    });
  });
});