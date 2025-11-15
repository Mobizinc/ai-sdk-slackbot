/**
 * Smoke tests for Supervisor Actions
 * Tests lib/supervisor/actions approve/reject functionality with mocked interactive states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  approveSupervisorState,
  rejectSupervisorState,
  executeSupervisorState,
  SupervisorStateNotFoundError,
} from '../../lib/supervisor/actions';
import {
  setupSmokeTestEnvironment,
  mockInteractiveStateManager,
  mockSlackMessagingService,
  mockServiceNowClient,
  mockGlobalFetch,
} from './helpers';

describe('smoke: supervisor actions', () => {
  let fetchMock: ReturnType<typeof mockGlobalFetch>;

  beforeEach(() => {
    setupSmokeTestEnvironment();
    fetchMock = mockGlobalFetch();
    mockInteractiveStateManager();
    mockSlackMessagingService();
    mockServiceNowClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.restore();
    vi.restoreAllMocks();
  });

  describe('approveSupervisorState', () => {
    it('should approve existing supervisor state', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'test-reviewer';

      const result = await approveSupervisorState(stateId, reviewer);

      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
      expect(result.id).toBe(stateId);
    });

    it('should throw error for non-existent state', async () => {
      const stateId = 'non-existent-state';
      const reviewer = 'test-reviewer';

      await expect(approveSupervisorState(stateId, reviewer))
        .rejects
        .toThrow(SupervisorStateNotFoundError);
    });

    it('should handle reviewer parameter correctly', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'admin-user';

      const result = await approveSupervisorState(stateId, reviewer);

      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
    });
  });

  describe('rejectSupervisorState', () => {
    it('should reject existing supervisor state', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'test-reviewer';

      const result = await rejectSupervisorState(stateId, reviewer);

      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
      expect(result.id).toBe(stateId);
    });

    it('should throw error for non-existent state', async () => {
      const stateId = 'non-existent-state';
      const reviewer = 'test-reviewer';

      await expect(rejectSupervisorState(stateId, reviewer))
        .rejects
        .toThrow(SupervisorStateNotFoundError);
    });

    it('should handle reviewer parameter correctly', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'admin-user';

      const result = await rejectSupervisorState(stateId, reviewer);

      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
    });
  });

  describe('executeSupervisorState', () => {
    describe('slack message artifacts', () => {
      it('should execute slack message artifact successfully', async () => {
        const payload = {
          artifactType: 'slack_message' as const,
          channelId: 'C123456',
          threadTs: '1234567890.123456',
          content: 'Test slack message content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
        };

        await expect(executeSupervisorState(payload)).resolves.not.toThrow();
      });

      it('should throw error for missing channelId', async () => {
        const payload = {
          artifactType: 'slack_message' as const,
          threadTs: '1234567890.123456',
          content: 'Test slack message content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
        };

        await expect(executeSupervisorState(payload))
          .rejects
          .toThrow('Missing channelId on supervisor payload');
      });

      it('should throw error for missing threadTs', async () => {
        const payload = {
          artifactType: 'slack_message' as const,
          channelId: 'C123456',
          content: 'Test slack message content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
        };

        await expect(executeSupervisorState(payload))
          .rejects
          .toThrow('Missing thread timestamp for Slack artifact');
      });

      it('should handle empty content gracefully', async () => {
        const payload = {
          artifactType: 'slack_message' as const,
          channelId: 'C123456',
          threadTs: '1234567890.123456',
          content: '',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
        };

        await expect(executeSupervisorState(payload)).resolves.not.toThrow();
      });
    });

    describe('ServiceNow work note artifacts', () => {
      it('should execute ServiceNow work note artifact successfully', async () => {
        const payload = {
          artifactType: 'servicenow_work_note' as const,
          caseNumber: 'SCS0048402',
          content: 'Test work note content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
          metadata: {
            sysId: 'CASE_SYS_ID',
          },
        };

        await expect(executeSupervisorState(payload)).resolves.not.toThrow();
      });

      it('should throw error for missing caseNumber', async () => {
        const payload = {
          artifactType: 'servicenow_work_note' as const,
          content: 'Test work note content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
          metadata: {
            sysId: 'CASE_SYS_ID',
          },
        };

        await expect(executeSupervisorState(payload))
          .rejects
          .toThrow('Missing case number for ServiceNow artifact');
      });

      it('should throw error for missing sysId in metadata', async () => {
        const payload = {
          artifactType: 'servicenow_work_note' as const,
          caseNumber: 'SCS0048402',
          content: 'Test work note content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
          metadata: {},
        };

        await expect(executeSupervisorState(payload))
          .rejects
          .toThrow('Missing sys_id in supervisor metadata');
      });

      it('should throw error when ServiceNow client not configured', async () => {
        // Mock ServiceNow client as not configured
        const mockClient = {
          isConfigured: () => false,
        };
        vi.doMock('../../lib/tools/servicenow', () => ({
          serviceNowClient: mockClient,
        }));

        const payload = {
          artifactType: 'servicenow_work_note' as const,
          caseNumber: 'SCS0048402',
          content: 'Test work note content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
          metadata: {
            sysId: 'CASE_SYS_ID',
          },
        };

        await expect(executeSupervisorState(payload))
          .rejects
          .toThrow('ServiceNow client not configured');
      });
    });

    describe('unknown artifact types', () => {
      it('should handle unknown artifact types gracefully', async () => {
        const payload = {
          artifactType: 'unknown_type' as any,
          content: 'Test content',
          reason: 'Test review',
          blockedAt: new Date().toISOString(),
        };

        // Should not throw but may not execute anything
        await expect(executeSupervisorState(payload)).resolves.not.toThrow();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should complete full approve workflow', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'test-reviewer';

      // First approve the state
      const result = await approveSupervisorState(stateId, reviewer);
      
      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
      expect(result.payload.artifactType).toBe('slack_message');
    });

    it('should complete full reject workflow', async () => {
      const stateId = 'test-state-123';
      const reviewer = 'test-reviewer';

      // First reject the state
      const result = await rejectSupervisorState(stateId, reviewer);
      
      expect(result).toBeDefined();
      expect(result.type).toBe('supervisor_review');
      expect(result.payload.artifactType).toBe('slack_message');
    });

    it('should handle ServiceNow artifact execution after approval', async () => {
      const payload = {
        artifactType: 'servicenow_work_note' as const,
        caseNumber: 'SCS0048402',
        content: 'Test work note for approved state',
        reason: 'Test review',
        blockedAt: new Date().toISOString(),
        metadata: {
          sysId: 'CASE_SYS_ID',
        },
      };

      await expect(executeSupervisorState(payload)).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle malformed state data gracefully', async () => {
      // Test with corrupted state manager
      const mockManager = {
        getStateById: vi.fn().mockRejectedValue(new Error('Database error')),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };
      vi.doMock('../../lib/services/interactive-state-manager', () => ({
        getInteractiveStateManager: () => mockManager,
      }));

      const stateId = 'test-state-123';
      const reviewer = 'test-reviewer';

      await expect(approveSupervisorState(stateId, reviewer))
        .rejects
        .toThrow('Database error');
    });

    it('should handle Slack messaging errors gracefully', async () => {
      // Mock Slack service to throw error
      const mockMessaging = {
        getBotUserId: vi.fn().mockResolvedValue('U1234567890'),
        postToThread: vi.fn().mockRejectedValue(new Error('Slack API error')),
        postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.123456' }),
      };
      vi.doMock('../../lib/services/slack-messaging', () => ({
        getSlackMessagingService: () => mockMessaging,
      }));

      const payload = {
        artifactType: 'slack_message' as const,
        channelId: 'C123456',
        threadTs: '1234567890.123456',
        content: 'Test message that will fail',
        reason: 'Test review',
        blockedAt: new Date().toISOString(),
      };

      await expect(executeSupervisorState(payload))
        .rejects
        .toThrow('Slack API error');
    });

    it('should handle ServiceNow API errors gracefully', async () => {
      // Mock ServiceNow client to throw error
      const mockClient = {
        isConfigured: () => true,
        addCaseWorkNote: vi.fn().mockRejectedValue(new Error('ServiceNow API error')),
      };
      vi.doMock('../../lib/tools/servicenow', () => ({
        serviceNowClient: mockClient,
      }));

      const payload = {
        artifactType: 'servicenow_work_note' as const,
        caseNumber: 'SCS0048402',
        content: 'Test work note that will fail',
        reason: 'Test review',
        blockedAt: new Date().toISOString(),
        metadata: {
          sysId: 'CASE_SYS_ID',
        },
      };

      await expect(executeSupervisorState(payload))
        .rejects
        .toThrow('ServiceNow API error');
    });
  });
});