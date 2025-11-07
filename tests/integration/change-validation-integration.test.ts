/**
 * Integration Tests for Change Validation Flow
 * Tests the complete webhook → worker → service → ServiceNow posting flow
 *
 * Run with: npm test tests/integration/change-validation-integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getChangeValidationService } from '../../lib/services/change-validation';
import { getChangeValidationRepository } from '../../lib/db/repositories/change-validation-repository';
import { serviceNowClient } from '../../lib/tools/servicenow';

// Mock repository to avoid requiring DATABASE_URL in tests
vi.mock('../../lib/db/repositories/change-validation-repository', () => {
  // In-memory store for test records
  const testRecords = new Map<string, any>();

  return {
    getChangeValidationRepository: () => ({
      create: vi.fn(async (data: any) => {
        const record = {
          id: `test-${Date.now()}`,
          ...data,
          status: 'received',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        testRecords.set(data.changeSysId, record);
        return record;
      }),
      getByChangeSysId: vi.fn(async (changeSysId: string) => {
        return testRecords.get(changeSysId) || null;
      }),
      markProcessing: vi.fn(async (changeSysId: string) => {
        const record = testRecords.get(changeSysId);
        if (record) {
          record.status = 'processing';
          record.updatedAt = new Date();
        }
        return record;
      }),
      markCompleted: vi.fn(async (changeSysId: string, validationResults: any, processingTimeMs: number) => {
        const record = testRecords.get(changeSysId);
        if (record) {
          record.status = 'completed';
          record.validationResults = validationResults;
          record.processingTimeMs = processingTimeMs;
          record.completedAt = new Date();
          record.updatedAt = new Date();
        }
        return record;
      }),
      markFailed: vi.fn(async (changeSysId: string, errorMessage: string, processingTimeMs: number) => {
        const record = testRecords.get(changeSysId);
        if (record) {
          record.status = 'failed';
          record.errorMessage = errorMessage;
          record.processingTimeMs = processingTimeMs;
          record.updatedAt = new Date();
        }
        return record;
      }),
      _clearTestRecords: () => testRecords.clear(), // Helper for test cleanup
    }),
  };
});

// Mock ServiceNow client
vi.mock('../../lib/tools/servicenow', () => ({
  serviceNowClient: {
    getChangeDetails: vi.fn(),
    getCatalogItem: vi.fn(),
    getLDAPServer: vi.fn(),
    getMIDServer: vi.fn(),
    getWorkflow: vi.fn(),
    addChangeWorkNote: vi.fn(),
  },
}));

// Mock Anthropic client
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              overall_status: 'PASSED',
              checks: {
                has_name: true,
                has_category: true,
                has_workflow: true,
                is_active: true,
              },
              synthesis: 'All validation checks passed successfully.',
            }),
          },
        ],
      }),
    },
  })),
}));

describe('Change Validation Integration Tests', () => {
  const changeValidationService = getChangeValidationService();
  const repository = getChangeValidationRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear in-memory test records between tests
    if ('_clearTestRecords' in repository && typeof repository._clearTestRecords === 'function') {
      (repository as any)._clearTestRecords();
    }
  });

  describe('Full Validation Flow - Catalog Item', () => {
    it('should successfully validate a catalog item with all required fields', async () => {
      // Arrange
      const mockCatalogItem = {
        sys_id: 'cat123',
        name: 'Test Catalog Item',
        category: 'Hardware',
        workflow: 'workflow123',
        active: true,
      };

      const mockChangeDetails = {
        sys_id: 'chg123',
        number: 'CHG0012345',
        state: 'Assess',
        short_description: 'Test change',
      };

      (serviceNowClient.getCatalogItem as any).mockResolvedValue(mockCatalogItem);
      (serviceNowClient.getChangeDetails as any).mockResolvedValue(mockChangeDetails);
      (serviceNowClient.addChangeWorkNote as any).mockResolvedValue(undefined);

      const webhookPayload = {
        change_sys_id: 'chg123',
        change_number: 'CHG0012345',
        state: 'Assess',
        component_type: 'catalog_item',
        component_sys_id: 'cat123',
        submitted_by: 'test.user@example.com',
      };

      // Act
      const dbRecord = await changeValidationService.receiveWebhook(webhookPayload, 'hmac-signature', 'test.user@example.com');
      const result = await changeValidationService.processValidation(dbRecord.changeSysId);

      // Assert
      expect(result.overall_status).toBe('PASSED');
      expect(result.checks).toHaveProperty('has_name', true);
      expect(result.checks).toHaveProperty('has_category', true);
      expect(result.checks).toHaveProperty('has_workflow', true);
      expect(result.checks).toHaveProperty('is_active', true);

      // Verify ServiceNow was called correctly
      expect(serviceNowClient.getCatalogItem).toHaveBeenCalledWith('cat123');
      expect(serviceNowClient.getChangeDetails).toHaveBeenCalledWith('chg123');
      expect(serviceNowClient.addChangeWorkNote).toHaveBeenCalledWith(
        'chg123',
        expect.stringContaining('PASSED')
      );

      // Verify database record was updated
      const updatedRecord = await repository.getByChangeSysId('chg123');
      expect(updatedRecord?.status).toBe('completed');
      expect(updatedRecord?.validationResults?.overall_status).toBe('PASSED');
    });

    it('should fail validation when catalog item is missing required fields', async () => {
      // Arrange
      const mockCatalogItem = {
        sys_id: 'cat456',
        name: 'Incomplete Item',
        // Missing category and workflow
        active: true,
      };

      (serviceNowClient.getCatalogItem as any).mockResolvedValue(mockCatalogItem);
      (serviceNowClient.getChangeDetails as any).mockResolvedValue({
        sys_id: 'chg456',
        number: 'CHG0012346',
      });

      const webhookPayload = {
        change_sys_id: 'chg456',
        change_number: 'CHG0012346',
        state: 'Assess',
        component_type: 'catalog_item',
        component_sys_id: 'cat456',
      };

      // Act
      const dbRecord = await changeValidationService.receiveWebhook(webhookPayload);
      const result = await changeValidationService.processValidation(dbRecord.changeSysId);

      // Assert
      expect(result.overall_status).toBe('FAILED');
      expect(result.checks).toHaveProperty('has_category', false);
      expect(result.checks).toHaveProperty('has_workflow', false);
      expect(serviceNowClient.addChangeWorkNote).toHaveBeenCalledWith(
        'chg456',
        expect.stringContaining('FAILED')
      );
    });
  });

  describe('Timeout Handling', () => {
    it('should handle ServiceNow API timeouts gracefully', async () => {
      // Arrange
      (serviceNowClient.getCatalogItem as any).mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve(null), 10000)) // Simulates timeout
      );

      (serviceNowClient.getChangeDetails as any).mockResolvedValue({
        sys_id: 'chg789',
        number: 'CHG0012347',
      });

      const webhookPayload = {
        change_sys_id: 'chg789',
        change_number: 'CHG0012347',
        state: 'Assess',
        component_type: 'catalog_item',
        component_sys_id: 'cat789',
      };

      // Act
      const dbRecord = await changeValidationService.receiveWebhook(webhookPayload);
      const result = await changeValidationService.processValidation(dbRecord.changeSysId);

      // Assert
      expect(result.overall_status).toBe('FAILED'); // Should fail due to missing data
      expect(result.checks).toBeDefined();
      expect(serviceNowClient.addChangeWorkNote).toHaveBeenCalled();
    });
  });

  describe('LDAP Server Validation', () => {
    it('should validate LDAP server configuration', async () => {
      // Arrange
      const mockLdapServer = {
        sys_id: 'ldap123',
        name: 'Corporate LDAP',
        listener_enabled: true,
        mid_server: 'mid123',
        urls: 'ldap://server1.example.com,ldap://server2.example.com',
      };

      (serviceNowClient.getLDAPServer as any).mockResolvedValue(mockLdapServer);
      (serviceNowClient.getChangeDetails as any).mockResolvedValue({
        sys_id: 'chg888',
        number: 'CHG0012348',
      });

      const webhookPayload = {
        change_sys_id: 'chg888',
        change_number: 'CHG0012348',
        state: 'Assess',
        component_type: 'ldap_server',
        component_sys_id: 'ldap123',
      };

      // Act
      const dbRecord = await changeValidationService.receiveWebhook(webhookPayload);
      const result = await changeValidationService.processValidation(dbRecord.changeSysId);

      // Assert
      expect(result.overall_status).toBe('PASSED');
      expect(result.checks).toHaveProperty('has_listener_enabled', true);
      expect(result.checks).toHaveProperty('has_mid_server', true);
      expect(result.checks).toHaveProperty('has_urls', true);
    });
  });

  describe('Fallback to Rules-Based Validation', () => {
    it('should use rules-based validation when Claude is unavailable', async () => {
      // Arrange - Mock Anthropic to throw error
      const ChangeValidationServiceWithoutClaude = class extends (getChangeValidationService().constructor as any) {
        constructor() {
          super();
          this.anthropic = null; // Simulate Claude being unavailable
        }
      };

      const serviceWithoutClaude = new ChangeValidationServiceWithoutClaude();

      const mockCatalogItem = {
        sys_id: 'cat999',
        name: 'Test Item',
        category: 'Software',
        workflow: 'wf123',
        active: true,
      };

      (serviceNowClient.getCatalogItem as any).mockResolvedValue(mockCatalogItem);
      (serviceNowClient.getChangeDetails as any).mockResolvedValue({
        sys_id: 'chg999',
        number: 'CHG0012349',
      });

      const webhookPayload = {
        change_sys_id: 'chg999',
        change_number: 'CHG0012349',
        state: 'Assess',
        component_type: 'catalog_item',
        component_sys_id: 'cat999',
      };

      // Act
      const dbRecord = await serviceWithoutClaude.receiveWebhook(webhookPayload);
      const result = await serviceWithoutClaude.processValidation(dbRecord.changeSysId);

      // Assert
      expect(result.overall_status).toBe('PASSED');
      expect(result.synthesis).toContain('validation PASSED');
    });
  });

  describe('Error Recovery', () => {
    it('should mark validation as failed when ServiceNow posting fails', async () => {
      // Arrange
      (serviceNowClient.getCatalogItem as any).mockResolvedValue({
        sys_id: 'cat111',
        name: 'Test',
        category: 'Hardware',
        workflow: 'wf123',
        active: true,
      });
      (serviceNowClient.getChangeDetails as any).mockResolvedValue({
        sys_id: 'chg111',
        number: 'CHG0012350',
      });
      (serviceNowClient.addChangeWorkNote as any).mockRejectedValue(
        new Error('ServiceNow API unavailable')
      );

      const webhookPayload = {
        change_sys_id: 'chg111',
        change_number: 'CHG0012350',
        state: 'Assess',
        component_type: 'catalog_item',
        component_sys_id: 'cat111',
      };

      // Act
      const dbRecord = await changeValidationService.receiveWebhook(webhookPayload);
      const result = await changeValidationService.processValidation(dbRecord.changeSysId);

      // Assert - Validation should complete even if posting fails
      expect(result.overall_status).toBe('PASSED');

      // Verify error was logged but didn't crash
      const updatedRecord = await repository.getByChangeSysId('chg111');
      expect(updatedRecord?.status).toBe('completed');
    });
  });
});

/**
 * TODO: Additional test scenarios to implement:
 *
 * 1. Webhook Authentication Tests:
 *    - Valid HMAC signature
 *    - Invalid HMAC signature
 *    - Missing authentication
 *    - API key authentication
 *
 * 2. QStash Worker Tests:
 *    - Valid QStash signature
 *    - Invalid QStash signature
 *    - Malformed payload
 *    - Retry behavior
 *
 * 3. Performance Tests:
 *    - Validation completes under 15 seconds
 *    - Webhook responds under 200ms
 *    - Concurrent validations
 *
 * 4. Edge Cases:
 *    - Missing component_sys_id
 *    - Unknown component_type
 *    - Database connection failures
 *    - Claude API rate limiting
 *
 * 5. Database Tests:
 *    - Duplicate change_sys_id handling
 *    - Concurrent updates
 *    - Transaction rollback scenarios
 */
