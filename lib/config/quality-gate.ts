/**
 * Quality Gate Configuration
 * 
 * Central configuration for quality control systems that prevent
 * issues like SCS0051638 where compliance and HR requirements
 * were bypassed.
 */

import { z } from "zod";

export const QualityGateConfigSchema = z.object({
  enabled: z.boolean().default(true).describe("Enable quality gate validation"),
  
  strictMode: z.object({
    hrRequiredCategories: z.array(z.string()).default([
      'Access Management', 
      'Account Access', 
      'Identity Management',
      'HR Services',
      'New Hire Request',
      'Employee Onboarding'
    ]).describe("Categories that require HR approval"),
    
    blockWithoutApproval: z.boolean().default(true).describe("Block cases that require HR approval without proper approval"),
    
    requireAccountValidation: z.boolean().default(true).describe("Require account existence validation for access requests"),
    
    blockHighPrivilege: z.boolean().default(true).describe("Block high privilege access without additional approval"),
    
    enforceCompliance: z.boolean().default(true).describe("Strictly enforce compliance-related requirements")
  }).default({}),

  thresholds: z.object({
    classificationConfidence: z.number().min(0).max(1).default(0.7).describe("Minimum classification confidence score"),
    
    businessIntelligenceScore: z.number().min(0).max(1).default(0.6).describe("Minimum business intelligence confidence"),
    
    escalationBiScore: z.number().min(0).max(100).default(80).describe("Business intelligence score that triggers escalation"),
    
    resolutionQualityScore: z.number().min(0).max(100).default(80).describe("Minimum resolution quality score for KB generation"),
    
    sessionTimeoutMinutes: z.number().min(15).max(480).default(60).describe("Clarification session timeout in minutes")
  }).default({}),

  patterns: z.object({
    newEmployee: z.array(z.string()).default([
      'new employee', 'new hire', 'does not have login', 'no account',
      'need access', 'first day', 'temp password', 'temporary password',
      'new user', 'provision user', 'create account', 'setup account',
      'onboarding', 'offboarding', 'account creation'
    ]).describe("Keywords that indicate new employee requests"),
    
    highPrivilege: z.array(z.string()).default([
      'admin', 'privileges', 'elevated', 'sudo', 'root', 'administrator',
      'domain admin', 'local admin', 'system admin', 'privileged access',
      'elevated rights', 'admin rights', 'super user'
    ]).describe("Keywords that indicate high privilege access requests"),
    
    accountAccess: z.array(z.string()).default([
      'account locked', 'password reset', 'cannot login', 'access denied',
      'login issue', 'sign in', 'authentication', 'credentials',
      'forgot password', 'account unlock', 'access problem'
    ]).describe("Keywords that indicate account access issues"),
    
    compliance: z.array(z.string()).default([
      'hipaa', 'phi', 'patient data', 'protected health information',
      'pci', 'credit card', 'financial', 'regulatory',
      'gdpr', 'personal data', 'sensitive information',
      'compliance', 'audit', 'privacy'
    ]).describe("Keywords that indicate compliance implications")
  }).default({}),

  exemptions: z.object({
    emergencyCategories: z.array(z.string()).default([
      'Outage', 'Critical', 'Emergency', 'Major Incident',
      'Service Down', 'System Unavailable', 'Production Issue'
    ]).describe("Categories exempt from quality gates"),
    
    overrideUsers: z.array(z.string()).default([
      'admin', 'escalation_manager', 'system', 'service_account',
      'emergency_user', 'break_glass'
    ]).describe("Users exempt from quality gates"),
    
    bypassKeywords: z.array(z.string()).default([
      'emergency', 'critical', 'outage', 'production down',
      'security incident', 'data breach', 'immediate threat'
    ]).describe("Keywords that bypass quality gates in emergencies")
  }).default({}),

  interactive: z.object({
    enabled: z.boolean().default(true).describe("Enable interactive clarification system"),
    
    autoAssignToGroup: z.boolean().default(true).describe("Auto-assign clarification sessions to assignment group"),
    
    requireManagerApproval: z.boolean().default(false).describe("Require manager approval for high-risk clarifications"),
    
    escalationThreshold: z.number().min(1).max(10).default(3).describe("Number of failed clarifications before escalation"),
    
    responseFormat: z.enum(['structured', 'freeform']).default('structured').describe("Expected response format for clarifications")
  }).default({}),

  notifications: z.object({
    enabled: z.boolean().default(true).describe("Enable quality gate notifications"),
    
    channels: z.object({
      slack: z.boolean().default(true).describe("Send notifications to Slack"),
      email: z.boolean().default(false).describe("Send notifications via email"),
      servicenow: z.boolean().default(true).describe("Add notifications as work notes")
    }).default({}),
    
    recipients: z.object({
      securityTeam: z.array(z.string()).default([]).describe("Security team notification recipients"),
      complianceTeam: z.array(z.string()).default([]).describe("Compliance team notification recipients"),
      managers: z.array(z.string()).default([]).describe("Manager notification recipients")
    }).default({}),
    
    events: z.object({
      qualityGateBlocked: z.boolean().default(true).describe("Notify when quality gate blocks processing"),
      clarificationRequired: z.boolean().default(true).describe("Notify when clarification is required"),
      sessionExpired: z.boolean().default(true).describe("Notify when clarification session expires"),
      escalationBlocked: z.boolean().default(true).describe("Notify when escalation is blocked")
    }).default({})
  }).default({}),

  reporting: z.object({
    enabled: z.boolean().default(true).describe("Enable quality gate reporting"),
    
    retentionDays: z.number().min(7).max(365).default(90).describe("Days to retain quality gate records"),
    
    metrics: z.object({
      trackBlockReasons: z.boolean().default(true).describe("Track reasons for quality gate blocks"),
      trackResponseTimes: z.boolean().default(true).describe("Track clarification response times"),
      trackEscalations: z.boolean().default(true).describe("Track quality-related escalations"),
      trackCompliance: z.boolean().default(true).describe("Track compliance-related events")
    }).default({})
  }).default({})
});

export type QualityGateConfig = z.infer<typeof QualityGateConfigSchema>;

/**
 * Default quality gate configuration
 */
export const defaultQualityGateConfig: QualityGateConfig = {
  enabled: true,
  strictMode: {
    hrRequiredCategories: [
      'Access Management', 
      'Account Access', 
      'Identity Management',
      'HR Services',
      'New Hire Request',
      'Employee Onboarding'
    ],
    blockWithoutApproval: true,
    requireAccountValidation: true,
    blockHighPrivilege: true,
    enforceCompliance: true
  },
  thresholds: {
    classificationConfidence: 0.7,
    businessIntelligenceScore: 0.6,
    escalationBiScore: 80,
    resolutionQualityScore: 80,
    sessionTimeoutMinutes: 60
  },
  patterns: {
    newEmployee: [
      'new employee', 'new hire', 'does not have login', 'no account',
      'need access', 'first day', 'temp password', 'temporary password',
      'new user', 'provision user', 'create account', 'setup account',
      'onboarding', 'offboarding', 'account creation'
    ],
    highPrivilege: [
      'admin', 'privileges', 'elevated', 'sudo', 'root', 'administrator',
      'domain admin', 'local admin', 'system admin', 'privileged access',
      'elevated rights', 'admin rights', 'super user'
    ],
    accountAccess: [
      'account locked', 'password reset', 'cannot login', 'access denied',
      'login issue', 'sign in', 'authentication', 'credentials',
      'forgot password', 'account unlock', 'access problem'
    ],
    compliance: [
      'hipaa', 'phi', 'patient data', 'protected health information',
      'pci', 'credit card', 'financial', 'regulatory',
      'gdpr', 'personal data', 'sensitive information',
      'compliance', 'audit', 'privacy'
    ]
  },
  exemptions: {
    emergencyCategories: [
      'Outage', 'Critical', 'Emergency', 'Major Incident',
      'Service Down', 'System Unavailable', 'Production Issue'
    ],
    overrideUsers: [
      'admin', 'escalation_manager', 'system', 'service_account',
      'emergency_user', 'break_glass'
    ],
    bypassKeywords: [
      'emergency', 'critical', 'outage', 'production down',
      'security incident', 'data breach', 'immediate threat'
    ]
  },
  interactive: {
    enabled: true,
    autoAssignToGroup: true,
    requireManagerApproval: false,
    escalationThreshold: 3,
    responseFormat: 'structured'
  },
  notifications: {
    enabled: true,
    channels: {
      slack: true,
      email: false,
      servicenow: true
    },
    recipients: {
      securityTeam: [],
      complianceTeam: [],
      managers: []
    },
    events: {
      qualityGateBlocked: true,
      clarificationRequired: true,
      sessionExpired: true,
      escalationBlocked: true
    }
  },
  reporting: {
    enabled: true,
    retentionDays: 90,
    metrics: {
      trackBlockReasons: true,
      trackResponseTimes: true,
      trackEscalations: true,
      trackCompliance: true
    }
  }
};

/**
 * Get quality gate configuration from environment or defaults
 */
export function getQualityGateConfig(): QualityGateConfig {
  // In a real implementation, this would load from:
  // - Database configuration
  // - Environment variables  
  // - Feature flags
  // - Client-specific overrides
  
  return defaultQualityGateConfig;
}

/**
 * Validate quality gate configuration
 */
export function validateQualityGateConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const result = QualityGateConfigSchema.safeParse(config);
  
  if (result.success) {
    return { valid: true, errors: [] };
  } else {
    return {
      valid: false,
      errors: result.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      )
    };
  }
}

/**
 * Configuration for specific quality scenarios
 */
export const qualityScenarios = {
  newEmployeeOnboarding: {
    requiredQuestions: ['account_exists', 'hr_approval', 'employee_type', 'start_date'],
    riskLevel: 'high' as const,
    autoRouteToCatalog: true,
    catalogItems: ['Employee Onboarding', 'New Hire Request', 'Account Creation']
  },
  
  highPrivilegeAccess: {
    requiredQuestions: ['business_justification', 'manager_approval', 'training_completed'],
    riskLevel: 'high' as const,
    requireDocumentation: true,
    approvalLevels: ['manager', 'security', 'compliance']
  },
  
  complianceIncident: {
    requiredQuestions: ['compliance_team_notified', 'reportable_incident'],
    riskLevel: 'high' as const,
    autoEscalate: true,
    notifyTeams: ['security', 'compliance', 'legal'],
    documentationRequired: true
  },
  
  accountAccess: {
    requiredQuestions: ['account_exists', 'last_login'],
    riskLevel: 'medium' as const,
    verificationSteps: ['check_account_exists', 'verify_identity', 'confirm_authorization'],
    allowSelfService: false
  }
};

/**
 * Quality gate metrics for monitoring
 */
export interface QualityGateMetrics {
  totalCases: number;
  blockedCases: number;
  clarificationsRequested: number;
  clarificationsCompleted: number;
  escalationsBlocked: number;
  averageResponseTime: number;
  blockReasons: Record<string, number>;
  complianceViolations: number;
  riskDistribution: Record<string, number>;
}

/**
 * Generate quality gate summary for reporting
 */
export function generateQualityGateReport(metrics: QualityGateMetrics): string {
  const blockRate = metrics.totalCases > 0 ? (metrics.blockedCases / metrics.totalCases * 100).toFixed(1) : '0.0';
  const clarificationCompletionRate = metrics.clarificationsRequested > 0 ? 
    (metrics.clarificationsCompleted / metrics.clarificationsRequested * 100).toFixed(1) : '0.0';

  return `
📊 QUALITY GATE PERFORMANCE REPORT

Summary:
• Total Cases Processed: ${metrics.totalCases}
• Cases Blocked: ${metrics.blockedCases} (${blockRate}%)
• Clarifications Requested: ${metrics.clarificationsRequested}
• Clarifications Completed: ${metrics.clarificationsCompleted} (${clarificationCompletionRate}%)
• Escalations Blocked: ${metrics.escalationsBlocked}
• Average Response Time: ${metrics.averageResponseTime.toFixed(1)} minutes
• Compliance Violations: ${metrics.complianceViolations}

Block Reasons:
${Object.entries(metrics.blockReasons)
  .sort(([,a], [,b]) => b - a)
  .map(([reason, count]) => `• ${reason}: ${count}`)
  .join('\n')}

Risk Level Distribution:
${Object.entries(metrics.riskDistribution)
  .sort(([,a], [,b]) => b - a)
  .map(([risk, count]) => `• ${risk}: ${count}`)
  .join('\n')}

Recommendations:
${metrics.blockedCases / metrics.totalCases > 0.1 ? '• High block rate - review quality gate thresholds' : '• Block rate within acceptable range'}
${parseFloat(clarificationCompletionRate) < 80 ? '• Low clarification completion - improve user experience' : '• Clarification completion rate is good'}
${metrics.complianceViolations > 0 ? '• Compliance violations detected - review training' : '• No compliance violations detected'}
  `.trim();
}