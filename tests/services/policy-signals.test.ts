/**
 * Policy Signals Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectPolicySignals,
  formatPolicySignalsForPrompt,
  type PolicySignalsInput,
} from '../../lib/services/policy-signals';
import type { Case, Incident } from '../../lib/infrastructure/servicenow/types/domain-models';
import type { BusinessEntityContext } from '../../lib/services/business-context-service';

// Mock config
vi.mock('../../lib/config', () => ({
  getConfigValue: (key: string) => {
    const config: Record<string, any> = {
      policySignalsMaintenanceWindowEnabled: false,
      policySignalsSLACheckEnabled: true,
      policySignalsHighRiskCustomerEnabled: true,
      policySignalsAfterHoursEnabled: true,
    };
    return config[key];
  },
}));

describe('Policy Signals Service', () => {
  describe('detectPolicySignals', () => {
    it('should detect SLA breach for P1 case opened 5 hours ago', async () => {
      const now = new Date('2025-01-15T14:00:00Z');
      const openedAt = new Date('2025-01-15T09:00:00Z'); // 5 hours ago

      const testCase: Partial<Case> = {
        sysId: 'case123',
        number: 'CS0001234',
        shortDescription: 'Critical outage',
        priority: '1',
        openedAt,
      } as Case;

      const input: PolicySignalsInput = {
        caseOrIncident: testCase as Case,
        currentTime: now,
      };

      const result = await detectPolicySignals(input);

      expect(result.signals).toHaveLength(2); // SLA breach + high priority

      const slaBreach = result.signals.find((s) => s.type === 'sla_breach');
      expect(slaBreach).toBeDefined();
      expect(slaBreach?.severity).toBe('critical');
      expect(slaBreach?.message).toContain('1.0 hours overdue');

      expect(result.hasCriticalSignals).toBe(true);
    });

    it('should detect SLA approaching for P2 case opened 7 hours ago', async () => {
      const now = new Date('2025-01-15T14:00:00Z');
      const openedAt = new Date('2025-01-15T07:00:00Z'); // 7 hours ago (SLA: 8 hours)

      const testCase: Partial<Case> = {
        sysId: 'case123',
        number: 'CS0001234',
        shortDescription: 'High priority issue',
        priority: '2',
        openedAt,
      } as Case;

      const input: PolicySignalsInput = {
        caseOrIncident: testCase as Case,
        currentTime: now,
      };

      const result = await detectPolicySignals(input);

      const slaApproaching = result.signals.find((s) => s.type === 'sla_approaching');
      expect(slaApproaching).toBeDefined();
      expect(slaApproaching?.severity).toBe('warning');
      expect(slaApproaching?.message).toContain('1.0 hours remaining');
    });

    it('should detect VIP customer from business context tags', async () => {
      const businessContext: Partial<BusinessEntityContext> = {
        entityName: 'VIP Corp',
        entityType: 'customer',
        tags: ['vip', 'strategic'],
      } as any;

      const input: PolicySignalsInput = {
        businessContext: businessContext as BusinessEntityContext,
      };

      const result = await detectPolicySignals(input);

      const vipSignal = result.signals.find((s) => s.type === 'vip_customer');
      expect(vipSignal).toBeDefined();
      expect(vipSignal?.severity).toBe('warning');
      expect(vipSignal?.message).toContain('High-value customer');
    });

    it('should detect VIP customer from description notes', async () => {
      const businessContext: Partial<BusinessEntityContext> = {
        entityName: 'Important Corp',
        entityType: 'customer',
        description: 'This is a critical strategic partner',
      };

      const input: PolicySignalsInput = {
        businessContext: businessContext as BusinessEntityContext,
      };

      const result = await detectPolicySignals(input);

      const vipSignal = result.signals.find((s) => s.type === 'vip_customer');
      expect(vipSignal).toBeDefined();
    });

    it('should detect critical service level from serviceDetails', async () => {
      const businessContext: Partial<BusinessEntityContext> = {
        entityName: 'Enterprise Corp',
        entityType: 'customer',
        serviceDetails: '24/7 premium support with platinum SLA',
      };

      const input: PolicySignalsInput = {
        businessContext: businessContext as BusinessEntityContext,
      };

      const result = await detectPolicySignals(input);

      const criticalService = result.signals.find((s) => s.type === 'critical_service');
      expect(criticalService).toBeDefined();
      expect(criticalService?.severity).toBe('info');
    });

    it('should detect high priority for P1 case', async () => {
      const testCase: Partial<Case> = {
        sysId: 'case123',
        number: 'CS0001234',
        shortDescription: 'Critical issue',
        priority: '1',
      } as Case;

      const input: PolicySignalsInput = {
        caseOrIncident: testCase as Case,
      };

      const result = await detectPolicySignals(input);

      const highPriority = result.signals.find((s) => s.type === 'high_priority');
      expect(highPriority).toBeDefined();
      expect(highPriority?.severity).toBe('warning');
    });

    it('should detect weekend activity', async () => {
      const saturday = new Date('2025-01-18T14:00:00Z'); // Saturday

      const input: PolicySignalsInput = {
        currentTime: saturday,
      };

      const result = await detectPolicySignals(input);

      const afterHours = result.signals.find((s) => s.type === 'after_hours');
      expect(afterHours).toBeDefined();
      expect(afterHours?.message).toContain('weekend');
    });

    it('should detect after-hours activity (early morning)', async () => {
      const earlyMorning = new Date('2025-01-15T06:00:00Z'); // 6am UTC (before 8am)

      const input: PolicySignalsInput = {
        currentTime: earlyMorning,
      };

      const result = await detectPolicySignals(input);

      const afterHours = result.signals.find((s) => s.type === 'after_hours');
      expect(afterHours).toBeDefined();
      expect(afterHours?.message).toContain('outside business hours');
    });

    it('should detect after-hours activity (late evening)', async () => {
      const lateEvening = new Date('2025-01-15T20:00:00Z'); // 8pm UTC (after 6pm)

      const input: PolicySignalsInput = {
        currentTime: lateEvening,
      };

      const result = await detectPolicySignals(input);

      const afterHours = result.signals.find((s) => s.type === 'after_hours');
      expect(afterHours).toBeDefined();
    });

    it('should return empty signals when no alerts detected', async () => {
      const normalCase: Partial<Case> = {
        sysId: 'case123',
        number: 'CS0001234',
        shortDescription: 'Low priority question',
        priority: '4',
        openedAt: new Date('2025-01-15T13:00:00Z'),
      } as Case;

      const input: PolicySignalsInput = {
        caseOrIncident: normalCase as Case,
        currentTime: new Date('2025-01-15T14:00:00Z'), // 1 hour later (well within 72h SLA)
      };

      const result = await detectPolicySignals(input);

      expect(result.signals).toHaveLength(0);
      expect(result.hasAnySignals).toBe(false);
      expect(result.hasCriticalSignals).toBe(false);
    });

    it('should sort signals by severity (critical first)', async () => {
      const now = new Date('2025-01-15T14:00:00Z');
      const openedAt = new Date('2025-01-15T09:00:00Z'); // 5 hours ago

      const testCase: Partial<Case> = {
        sysId: 'case123',
        number: 'CS0001234',
        shortDescription: 'Critical issue',
        priority: '1',
        openedAt,
      } as Case;

      const businessContext: Partial<BusinessEntityContext> = {
        entityName: 'VIP Corp',
        entityType: 'customer',
        tags: ['vip'],
        serviceDetails: '24/7 premium support',
      } as any;

      const input: PolicySignalsInput = {
        caseOrIncident: testCase as Case,
        businessContext: businessContext as BusinessEntityContext,
        currentTime: now,
      };

      const result = await detectPolicySignals(input);

      // Should have: sla_breach (critical), high_priority (warning), vip_customer (warning), critical_service (info)
      expect(result.signals.length).toBeGreaterThan(0);

      // First signal should be critical
      expect(result.signals[0].severity).toBe('critical');

      // Verify sorted order
      const severities = result.signals.map((s) => s.severity);
      let lastSeverityRank = -1;
      const severityRank = { critical: 0, warning: 1, info: 2 };

      for (const severity of severities) {
        const rank = severityRank[severity];
        expect(rank).toBeGreaterThanOrEqual(lastSeverityRank);
        lastSeverityRank = rank;
      }
    });
  });

  describe('formatPolicySignalsForPrompt', () => {
    it('should format no signals as "No policy alerts"', () => {
      const result = {
        signals: [],
        hasAnySignals: false,
        hasCriticalSignals: false,
      };

      const formatted = formatPolicySignalsForPrompt(result);
      expect(formatted).toBe('No policy alerts detected.');
    });

    it('should format signals with appropriate icons', () => {
      const result = {
        signals: [
          {
            type: 'sla_breach' as const,
            severity: 'critical' as const,
            message: 'SLA breached by 2 hours',
            detectedAt: new Date().toISOString(),
          },
          {
            type: 'vip_customer' as const,
            severity: 'warning' as const,
            message: 'High-value customer detected',
            detectedAt: new Date().toISOString(),
          },
          {
            type: 'critical_service' as const,
            severity: 'info' as const,
            message: '24/7 service level',
            detectedAt: new Date().toISOString(),
          },
        ],
        hasAnySignals: true,
        hasCriticalSignals: true,
      };

      const formatted = formatPolicySignalsForPrompt(result);

      expect(formatted).toContain('**Policy Alerts:**');
      expect(formatted).toContain('🔴 SLA breached by 2 hours');
      expect(formatted).toContain('⚠️ High-value customer detected');
      expect(formatted).toContain('ℹ️ 24/7 service level');
    });
  });
});
