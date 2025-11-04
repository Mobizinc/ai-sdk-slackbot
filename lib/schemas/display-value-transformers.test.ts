/**
 * Unit tests for ServiceNow display_value transformers.
 */

import { describe, it, expect } from 'vitest';
import { ServiceNowCaseWebhookSchema } from './servicenow-webhook';
import { ServiceNowIncidentWebhookSchema } from './servicenow-incident-webhook';

describe('Display Value Transformers', () => {
  describe('ServiceNowCaseWebhookSchema', () => {
    it('should handle string values for assignment_group', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assignment_group: 'IT Support',
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assignment_group).toBe('IT Support');
    });

    it('should normalize display_value objects for assignment_group', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assignment_group: {
          display_value: 'IT Support',
          value: 'group_sys_id',
          link: 'https://instance.service-now.com/nav_to.do?uri=sys_user_group.do?sys_id=group_sys_id',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assignment_group).toBe('IT Support');
    });

    it('should handle display_value objects without link', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        company: {
          display_value: 'Acme Corp',
          value: 'company_sys_id',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.company).toBe('Acme Corp');
    });

    it('should handle null/undefined optional fields', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assignment_group: null,
        company: undefined,
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assignment_group).toBeUndefined();
      expect(result.company).toBeUndefined();
    });

    it('should fall back to value when display_value is missing', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assigned_to: {
          value: 'user_sys_id',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assigned_to).toBe('user_sys_id');
    });

    it('should handle complex payload with mixed field types', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        category: 'Hardware',
        assignment_group: {
          display_value: 'Network Team',
          value: 'network_group',
          link: 'https://instance.service-now.com/nav_to.do?uri=sys_user_group.do?sys_id=network_group',
        },
        assigned_to: {
          display_value: 'John Doe',
          value: 'john_doe',
        },
        company: {
          display_value: 'Acme Corporation',
          value: 'acme_sys_id',
        },
        contact: null,
        location: undefined,
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.category).toBe('Hardware');
      expect(result.assignment_group).toBe('Network Team');
      expect(result.assigned_to).toBe('John Doe');
      expect(result.company).toBe('Acme Corporation');
      expect(result.contact).toBeUndefined();
      expect(result.location).toBeUndefined();
    });
  });

  describe('ServiceNowIncidentWebhookSchema', () => {
    it('should handle string values for state', () => {
      const input = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
        state: 'In Progress',
      };

      const result = ServiceNowIncidentWebhookSchema.parse(input);
      expect(result.state).toBe('In Progress');
    });

    it('should normalize display_value objects for parent_case_sys_id', () => {
      const input = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
        parent_case_sys_id: {
          display_value: 'CASE001',
          value: 'case_sys123',
          link: 'https://instance.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=case_sys123',
        },
      };

      const result = ServiceNowIncidentWebhookSchema.parse(input);
      expect(result.parent_case_sys_id).toBe('CASE001');
    });

    it('should handle null close_code', () => {
      const input = {
        incident_number: 'INC001',
        incident_sys_id: 'inc_sys123',
        close_code: null,
      };

      const result = ServiceNowIncidentWebhookSchema.parse(input);
      expect(result.close_code).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty display_value', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assignment_group: {
          display_value: '',
          value: 'group_id',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assignment_group).toBe('');
    });

    it('should handle display_value object with only value field', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        assigned_to: {
          value: 'user_id',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.assigned_to).toBe('user_id');
    });

    it('should preserve additional fields with passthrough', () => {
      const input = {
        case_number: 'CASE001',
        sys_id: 'sys123',
        short_description: 'Test case',
        custom_field: 'custom value',
        another_custom: {
          display_value: 'Custom Display',
          value: 'custom_value',
        },
      };

      const result = ServiceNowCaseWebhookSchema.parse(input);
      expect(result.custom_field).toBe('custom value');
      expect((result as any).another_custom).toEqual({
        display_value: 'Custom Display',
        value: 'custom_value',
      });
    });
  });
});