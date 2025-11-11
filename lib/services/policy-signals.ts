/**
 * Policy Signals Service
 *
 * Detects policy-relevant signals for the Discovery Agent:
 * - Maintenance windows
 * - SLA breaches
 * - High-risk customer flags
 *
 * All detection logic is deterministic (no LLM calls).
 */

import type { Case, Incident } from "../infrastructure/servicenow/types/domain-models";
import type { BusinessEntityContext } from "./business-context-service";
import { getConfigValue } from "../config";

/**
 * Policy signal types
 */
export type PolicySignalType =
  | "maintenance_window"
  | "sla_breach"
  | "sla_approaching"
  | "high_risk_customer"
  | "vip_customer"
  | "critical_service"
  | "after_hours"
  | "high_priority";

export interface PolicySignal {
  type: PolicySignalType;
  severity: "info" | "warning" | "critical";
  message: string;
  details?: Record<string, unknown>;
  detectedAt: string;
}

export interface PolicySignalsInput {
  caseOrIncident?: Case | Incident;
  businessContext?: BusinessEntityContext | null;
  channelId?: string;
  currentTime?: Date;
}

export interface PolicySignalsResult {
  signals: PolicySignal[];
  hasAnySignals: boolean;
  hasCriticalSignals: boolean;
}

/**
 * Detect all relevant policy signals for a given context
 */
export async function detectPolicySignals(
  input: PolicySignalsInput
): Promise<PolicySignalsResult> {
  const signals: PolicySignal[] = [];
  const currentTime = input.currentTime ?? new Date();

  // Check maintenance windows
  const maintenanceSignal = await checkMaintenanceWindow(input, currentTime);
  if (maintenanceSignal) {
    signals.push(maintenanceSignal);
  }

  // Check SLA status
  if (input.caseOrIncident) {
    const slaSignals = checkSLAStatus(input.caseOrIncident, currentTime);
    signals.push(...slaSignals);
  }

  // Check high-risk customer flags
  if (input.businessContext) {
    const riskSignals = checkHighRiskCustomer(input.businessContext);
    signals.push(...riskSignals);
  }

  // Check priority/urgency escalations
  if (input.caseOrIncident) {
    const prioritySignal = checkPriorityStatus(input.caseOrIncident);
    if (prioritySignal) {
      signals.push(prioritySignal);
    }
  }

  // Check after-hours operations
  const afterHoursSignal = checkAfterHours(currentTime);
  if (afterHoursSignal) {
    signals.push(afterHoursSignal);
  }

  // Sort by severity: critical > warning > info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    signals,
    hasAnySignals: signals.length > 0,
    hasCriticalSignals: signals.some((s) => s.severity === "critical"),
  };
}

/**
 * Check for active maintenance windows
 * TODO: Integrate with ServiceNow change_request or maintenance schedule
 */
async function checkMaintenanceWindow(
  input: PolicySignalsInput,
  currentTime: Date
): Promise<PolicySignal | null> {
  // Feature flag check
  const enabled = getConfigValue("policySignalsMaintenanceWindowEnabled");
  if (!enabled) {
    return null;
  }

  // TODO: Query ServiceNow change_request table for active maintenance
  // For now, return null (no maintenance detected)
  // Future implementation:
  // - Query change_request where state=in_progress and type=standard
  // - Check if scheduled_start <= currentTime <= scheduled_end
  // - Match company/CI to the maintenance record

  return null;
}

/**
 * Check SLA breach status
 */
function checkSLAStatus(caseOrIncident: Case | Incident, currentTime: Date): PolicySignal[] {
  const signals: PolicySignal[] = [];

  // Feature flag check
  const enabled = getConfigValue("policySignalsSLACheckEnabled");
  if (!enabled) {
    return signals;
  }

  // Priority-based SLA thresholds (in hours)
  const slaThresholds: Record<string, number> = {
    "1": 4, // Critical - 4 hours
    "2": 8, // High - 8 hours
    "3": 24, // Medium - 24 hours
    "4": 72, // Low - 72 hours
  };

  const priority = caseOrIncident.priority ?? "4";
  const slaHours = slaThresholds[priority] ?? 72;

  const openedAt = (caseOrIncident as any).openedAt;
  if (!openedAt || !(openedAt instanceof Date)) {
    return signals;
  }

  const hoursSinceOpen = (currentTime.getTime() - openedAt.getTime()) / (1000 * 60 * 60);
  const slaRemaining = slaHours - hoursSinceOpen;

  // SLA breach detected
  if (slaRemaining <= 0) {
    signals.push({
      type: "sla_breach",
      severity: "critical",
      message: `SLA breached: ${Math.abs(slaRemaining).toFixed(1)} hours overdue (Priority ${priority})`,
      details: {
        priority,
        slaHours,
        hoursSinceOpen: hoursSinceOpen.toFixed(1),
        breachHours: Math.abs(slaRemaining).toFixed(1),
      },
      detectedAt: currentTime.toISOString(),
    });
  }
  // SLA approaching (within 25% of threshold)
  else if (slaRemaining <= slaHours * 0.25) {
    signals.push({
      type: "sla_approaching",
      severity: "warning",
      message: `SLA approaching: ${slaRemaining.toFixed(1)} hours remaining (Priority ${priority})`,
      details: {
        priority,
        slaHours,
        hoursSinceOpen: hoursSinceOpen.toFixed(1),
        hoursRemaining: slaRemaining.toFixed(1),
      },
      detectedAt: currentTime.toISOString(),
    });
  }

  return signals;
}

/**
 * Check high-risk customer flags
 */
function checkHighRiskCustomer(businessContext: BusinessEntityContext): PolicySignal[] {
  const signals: PolicySignal[] = [];

  // Feature flag check
  const enabled = getConfigValue("policySignalsHighRiskCustomerEnabled");
  if (!enabled) {
    return signals;
  }

  // Check for VIP/critical markers in tags or notes
  const tags = (businessContext as any).tags ?? [];
  const notes = businessContext.description?.toLowerCase() ?? "";
  const name = businessContext.entityName.toLowerCase();

  const vipIndicators = ["vip", "critical", "strategic", "executive", "high-value"];
  const hasVipTag = tags.some((tag: string) =>
    vipIndicators.some((indicator) => tag.toLowerCase().includes(indicator))
  );
  const hasVipNote = vipIndicators.some((indicator) => notes.includes(indicator));

  if (hasVipTag || hasVipNote) {
    signals.push({
      type: "vip_customer",
      severity: "warning",
      message: `High-value customer: ${businessContext.entityName}`,
      details: {
        entityName: businessContext.entityName,
        entityType: businessContext.entityType,
        source: hasVipTag ? "tags" : "notes",
      },
      detectedAt: new Date().toISOString(),
    });
  }

  // Check for critical service indicators
  const serviceDetails = businessContext.serviceDetails?.toLowerCase() ?? "";
  const criticalServiceIndicators = [
    "24/7",
    "premium support",
    "platinum",
    "enterprise",
    "mission critical",
  ];
  const hasCriticalService = criticalServiceIndicators.some((indicator) =>
    serviceDetails.includes(indicator)
  );

  if (hasCriticalService) {
    signals.push({
      type: "critical_service",
      severity: "info",
      message: `Critical service level detected for ${businessContext.entityName}`,
      details: {
        entityName: businessContext.entityName,
        serviceDetails: businessContext.serviceDetails,
      },
      detectedAt: new Date().toISOString(),
    });
  }

  return signals;
}

/**
 * Check priority/urgency status
 */
function checkPriorityStatus(caseOrIncident: Case | Incident): PolicySignal | null {
  const priority = caseOrIncident.priority;

  // Only flag P1/Critical
  if (priority === "1" || priority === "Critical") {
    return {
      type: "high_priority",
      severity: "warning",
      message: `Critical priority case: ${caseOrIncident.number}`,
      details: {
        number: caseOrIncident.number,
        priority,
        shortDescription: caseOrIncident.shortDescription,
      },
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Check if current time is after business hours
 */
function checkAfterHours(currentTime: Date): PolicySignal | null {
  // Feature flag check
  const enabled = getConfigValue("policySignalsAfterHoursEnabled");
  if (!enabled) {
    return null;
  }

  const hour = currentTime.getUTCHours();
  const day = currentTime.getUTCDay();

  // Weekend (Saturday = 6, Sunday = 0)
  if (day === 0 || day === 6) {
    return {
      type: "after_hours",
      severity: "info",
      message: "Case activity detected during weekend",
      details: {
        day: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
        hourUTC: hour,
      },
      detectedAt: currentTime.toISOString(),
    };
  }

  // After hours (before 8am UTC or after 6pm UTC)
  if (hour < 8 || hour >= 18) {
    return {
      type: "after_hours",
      severity: "info",
      message: "Case activity detected outside business hours",
      details: {
        hourUTC: hour,
      },
      detectedAt: currentTime.toISOString(),
    };
  }

  return null;
}

/**
 * Format policy signals into human-readable text for prompts
 */
export function formatPolicySignalsForPrompt(result: PolicySignalsResult): string {
  if (!result.hasAnySignals) {
    return "No policy alerts detected.";
  }

  const lines: string[] = ["**Policy Alerts:**"];

  for (const signal of result.signals) {
    const icon =
      signal.severity === "critical" ? "🔴" : signal.severity === "warning" ? "⚠️" : "ℹ️";
    lines.push(`${icon} ${signal.message}`);
  }

  return lines.join("\n");
}
