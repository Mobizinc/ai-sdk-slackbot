/**
 * Unit tests for ServiceNow partial validation utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  validateServiceNowCasePartial,
  validateServiceNowIncidentPartial,
  validateServiceNowPayloadPartial,
  isProcessablePayload,
  getValidationStats,
} from './servicenow-validation';

describe('ServiceNow Partial Validation', () => {
  describe('validateServiceNowCasePartial', () => {
    it('should validate complete case payload successfully', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        description: 'Detailed description',
        priority: '2',
        assignment_group: 'IT Support',
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
      expect(result.strategy).toBe('full');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle partial case payload with missing optional fields', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        // Missing optional fields
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.case_number).toBe('CASE001');
      expect(result.data?.sys_id).toBe('sys123');
      expect(result.data?.short_description).toBe('Test case');
      expect(result.strategy).toBe('full');
    });

    it('should extract valid fields from malformed case payload', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        description: 'Detailed description',
        priority: 123, // Wrong type
        assignment_group: null, // Null value
        invalid_field: 'should be ignored',
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.case_number).toBe('CASE001');
      expect(result.data?.sys_id).toBe('sys123');
      expect(result.data?.short_description).toBe('Test case');
      expect(result.data?.description).toBe('Detailed description');
      expect(result.strategy).toBe('partial');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should fail case payload missing required fields', () => {
      const payload = {
        description: 'Only description, missing required fields',
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('Missing required field'))).toBe(true);
      expect(result.strategy).toBe('minimal');
    });

    it('should create minimal case payload when possible', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        priority: 123, // Wrong type - should be string
        assignment_group: null, // Null value - should be filtered out
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.case_number).toBe('CASE001');
      expect(result.data?.sys_id).toBe('sys123');
      expect(result.data?.short_description).toBe('Test case');
      expect(result.strategy).toBe('partial');
      expect(result.warnings.some(w => w.includes('partially validated'))).toBe(true);
    });
  });

  describe('validateServiceNowIncidentPartial', () => {
    it('should validate complete incident payload successfully', () => {
      const payload = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
        state: 'In Progress',
        work_notes: 'Latest work note',
      };

      const result = validateServiceNowIncidentPartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
      expect(result.strategy).toBe('full');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle partial incident payload', () => {
      const payload = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
        // Missing optional fields
      };

      const result = validateServiceNowIncidentPartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.incident_number).toBe('INC001');
      expect(result.data?.incident_sys_id).toBe('inc_sys123');
      expect(result.strategy).toBe('full');
    });

    it('should fail incident payload missing required fields', () => {
      const payload = {
        state: 'In Progress',
        // Missing incident_number and incident_sys_id
      };

      const result = validateServiceNowIncidentPartial(payload);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.strategy).toBe('minimal');
    });
  });

  describe('validateServiceNowPayloadPartial', () => {
    it('should detect and validate case payload', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
      };

      const result = validateServiceNowPayloadPartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect('case_number' in (result.data as any)).toBe(true);
    });

    it('should detect and validate incident payload', () => {
      const payload = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
      };

      const result = validateServiceNowPayloadPartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect('incident_number' in (result.data as any)).toBe(true);
    });

    it('should handle ambiguous payload type', () => {
      const payload = {
        case_number: 'CASE001',
        incident_number: 'INC001', // Both present - unusual but possible
        sys_id: 'sys123',
        short_description: 'Test case',
      };

      const result = validateServiceNowPayloadPartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.includes('Ambiguous payload type'))).toBe(true);
    });

    it('should handle completely unknown payload type', () => {
      const payload = {
        unknown_field: 'unknown',
        another_field: 'value',
      };

      const result = validateServiceNowPayloadPartial(payload);
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unable to determine payload type'))).toBe(true);
    });
  });

  describe('isProcessablePayload', () => {
    it('should return true for fully validated payload', () => {
      const result = {
        success: true,
        data: { case_number: 'CASE001' },
        errors: [],
        warnings: [],
        strategy: 'full' as const,
      };

      expect(isProcessablePayload(result)).toBe(true);
    });

    it('should return true for partially validated payload', () => {
      const result = {
        success: true,
        data: { case_number: 'CASE001' },
        errors: [],
        warnings: ['Some warning'],
        strategy: 'partial' as const,
      };

      expect(isProcessablePayload(result)).toBe(true);
    });

    it('should return true for minimal validated payload with data', () => {
      const result = {
        success: true,
        data: { case_number: 'CASE001' },
        errors: [],
        warnings: ['Minimal validation'],
        strategy: 'minimal' as const,
      };

      expect(isProcessablePayload(result)).toBe(true);
    });

    it('should return false for failed validation', () => {
      const result = {
        success: false,
        errors: ['Missing required fields'],
        warnings: [],
        strategy: 'minimal' as const,
      };

      expect(isProcessablePayload(result)).toBe(false);
    });

    it('should return false for minimal validation with no data', () => {
      const result = {
        success: true,
        data: {},
        errors: [],
        warnings: ['Minimal validation'],
        strategy: 'minimal' as const,
      };

      expect(isProcessablePayload(result)).toBe(false);
    });
  });

  describe('getValidationStats', () => {
    it('should calculate validation statistics correctly', () => {
      const results = [
        { strategy: 'full' as const, success: true, errors: [], warnings: [] },
        { strategy: 'partial' as const, success: true, errors: [], warnings: [] },
        { strategy: 'minimal' as const, success: true, errors: [], warnings: [] },
        { strategy: 'minimal' as const, success: false, errors: [], warnings: [] },
      ];

      const stats = getValidationStats(results);
      
      expect(stats.total).toBe(4);
      expect(stats.full).toBe(1);
      expect(stats.partial).toBe(1);
      expect(stats.minimal).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(0.75); // 3/4
    });

    it('should handle empty results array', () => {
      const stats = getValidationStats([]);
      
      expect(stats.total).toBe(0);
      expect(stats.full).toBe(0);
      expect(stats.partial).toBe(0);
      expect(stats.minimal).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values gracefully', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123', // Valid required field
        short_description: 'Valid short description', // Valid required field
        description: 'Valid description',
        priority: null, // Should be filtered out (optional field)
        assignment_group: undefined, // Should be filtered out (optional field)
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.case_number).toBe('CASE001');
      expect(result.data?.sys_id).toBe('sys123');
      expect(result.data?.short_description).toBe('Valid short description');
      expect(result.data?.description).toBe('Valid description');
      expect('priority' in (result.data as any)).toBe(false);
      expect('assignment_group' in (result.data as any)).toBe(false);
    });

    it('should handle display_value objects in partial validation', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assignment_group: {
          display_value: 'IT Support',
          value: 'group_id',
        },
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.data?.assignment_group).toBeDefined();
    });

    it('should preserve additional fields in partial data', () => {
      const payload = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        custom_field: 'custom value',
        another_custom: {
          display_value: 'Custom Display',
          value: 'custom_value',
        },
      };

      const result = validateServiceNowCasePartial(payload);
      
      expect(result.success).toBe(true);
      expect(result.partialData?.custom_field).toBe('custom value');
      expect(result.partialData?.another_custom).toEqual({
        display_value: 'Custom Display',
        value: 'custom_value',
      });
    });
  });
});