/**
 * Case Quality Gate
 * 
 * Validates case data before classification to ensure quality standards
 * and prevent issues like SCS0051638 where HR approval and account validation
 * were bypassed.
 */

import type { ServiceNowCaseWebhook } from "../schemas/servicenow-webhook";

export interface QualityGateResult {
  passed: boolean;
  requiresHrApproval: boolean;
  requiresAccountValidation: boolean;
  missingInfo: string[];
  clarifyingQuestions: string[];
  shouldBlock: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface QualityGateConfig {
  enabled: boolean;
  strictMode: {
    hrRequiredCategories: string[];
    blockWithoutApproval: boolean;
    requireAccountValidation: boolean;
  };
  patterns: {
    newEmployee: string[];
    highPrivilege: string[];
    accountAccess: string[];
    compliance: string[];
  };
  exemptions: {
    emergencyCategories: string[];
    overrideUsers: string[];
  };
}

const DEFAULT_CONFIG: QualityGateConfig = {
  enabled: true,
  strictMode: {
    hrRequiredCategories: ['Access Management', 'Account Access', 'Identity Management'],
    blockWithoutApproval: true,
    requireAccountValidation: true
  },
  patterns: {
    newEmployee: [
      'new employee', 'new hire', 'does not have login', 'no account',
      'need access', 'first day', 'temp password', 'temporary password',
      'new user', 'provision user', 'create account', 'setup account'
    ],
    highPrivilege: [
      'admin', 'privileges', 'elevated', 'sudo', 'root', 'administrator',
      'domain admin', 'local admin', 'system admin'
    ],
    accountAccess: [
      'account locked', 'password reset', 'cannot login', 'access denied',
      'login issue', 'sign in', 'authentication', 'credentials'
    ],
    compliance: [
      'hipaa', 'phi', 'patient data', 'protected health information',
      'pci', 'credit card', 'financial', 'regulatory'
    ]
  },
  exemptions: {
    emergencyCategories: ['Outage', 'Critical', 'Emergency'],
    overrideUsers: ['admin', 'escalation_manager', 'system']
  }
};

/**
 * Main quality gate validation function
 */
export async function validateCaseQuality(
  webhook: ServiceNowCaseWebhook,
  config: Partial<QualityGateConfig> = {}
): Promise<QualityGateResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!fullConfig.enabled) {
    return {
      passed: true,
      requiresHrApproval: false,
      requiresAccountValidation: false,
      missingInfo: [],
      clarifyingQuestions: [],
      shouldBlock: false,
      riskLevel: 'low',
      recommendations: []
    };
  }

  const issues: string[] = [];
  const questions: string[] = [];
  const recommendations: string[] = [];
  let requiresHrApproval = false;
  let requiresAccountValidation = false;
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const caseText = [
    webhook.short_description || '',
    webhook.description || ''
  ].join(' ').toLowerCase();

  // Check for emergency exemptions
  const isEmergency = fullConfig.exemptions.emergencyCategories.some(cat =>
    webhook.category?.toLowerCase().includes(cat.toLowerCase()) ||
    webhook.short_description?.toLowerCase().includes('emergency') ||
    webhook.short_description?.toLowerCase().includes('outage') ||
    webhook.short_description?.toLowerCase().includes('critical')
  );

  if (isEmergency) {
    console.log(`[Quality Gate] Emergency case detected - bypassing quality gates for ${webhook.case_number}`);
    return {
      passed: true,
      requiresHrApproval: false,
      requiresAccountValidation: false,
      missingInfo: [],
      clarifyingQuestions: [],
      shouldBlock: false,
      riskLevel: 'low',
      recommendations: ['Emergency case - quality gates bypassed']
    };
  }

  // Check for new employee patterns
  const hasNewEmployeeKeywords = fullConfig.patterns.newEmployee.some(pattern =>
    caseText.includes(pattern)
  );

  if (hasNewEmployeeKeywords) {
    requiresAccountValidation = true;
    requiresHrApproval = true;
    riskLevel = 'high';
    
    questions.push('Does the user already have an existing account?');
    questions.push('Has this employee been officially onboarded through HR?');
    questions.push('What is the employee\'s official start date?');
    questions.push('Is this request coming from an authorized manager?');
    
    issues.push('New employee access request requires HR validation');
    recommendations.push('Verify employee exists in HR system before account creation');
    recommendations.push('Check if this should be routed to onboarding catalog');
  }

  // Check for high privilege access
  const hasHighPrivilegeKeywords = fullConfig.patterns.highPrivilege.some(pattern =>
    caseText.includes(pattern)
  );

  if (hasHighPrivilegeKeywords) {
    requiresHrApproval = true;
    riskLevel = 'high';
    
    questions.push('Has manager approval been obtained for elevated access?');
    questions.push('What is the business justification for elevated privileges?');
    questions.push('Has the user completed required training?');
    
    issues.push('High privilege access request requires additional approval');
    recommendations.push('Verify business justification and manager approval');
  }

  // Check for account access patterns
  const hasAccountAccessKeywords = fullConfig.patterns.accountAccess.some(pattern =>
    caseText.includes(pattern)
  );

  if (hasAccountAccessKeywords && !hasNewEmployeeKeywords) {
    requiresAccountValidation = true;
    riskLevel = 'medium';
    
    questions.push('Has the user had access before?');
    questions.push('When was the last time the user successfully logged in?');
    
    recommendations.push('Verify account existence before password reset');
  }

  // Check for compliance keywords
  const hasComplianceKeywords = fullConfig.patterns.compliance.some(pattern =>
    caseText.includes(pattern)
  );

  if (hasComplianceKeywords) {
    requiresHrApproval = true;
    riskLevel = 'high';
    
    questions.push('Has compliance team been notified?');
    questions.push('Is this incident reportable to regulatory bodies?');
    
    issues.push('Compliance impact detected - requires special handling');
    recommendations.push('Escalate to compliance team immediately');
  }

  // Check category-based requirements
  if (webhook.category) {
    const requiresHrCategory = fullConfig.strictMode.hrRequiredCategories.some(cat =>
      webhook.category?.toLowerCase().includes(cat.toLowerCase())
    );

    if (requiresHrCategory) {
      requiresHrApproval = true;
      if (!issues.some(issue => issue.includes('HR'))) {
        issues.push(`${webhook.category} requires HR approval`);
      }
    }
  }

  const shouldBlock = fullConfig.strictMode.blockWithoutApproval && 
                     (requiresHrApproval || requiresAccountValidation) && 
                     issues.length > 0;

  return {
    passed: issues.length === 0,
    requiresHrApproval,
    requiresAccountValidation,
    missingInfo: issues,
    clarifyingQuestions: questions,
    shouldBlock,
    riskLevel,
    recommendations
  };
}

/**
 * Check if user is exempt from quality gates
 */
export function isUserExempt(userId: string, config: QualityGateConfig): boolean {
  return config.exemptions.overrideUsers.some(exemptUser =>
    userId.toLowerCase().includes(exemptUser.toLowerCase())
  );
}

/**
 * Generate quality gate summary for logging
 */
export function generateQualityGateSummary(result: QualityGateResult): string {
  if (result.passed) {
    return `✅ Quality gate passed (Risk: ${result.riskLevel})`;
  }

  const blocks = [];
  if (result.shouldBlock) blocks.push('BLOCKED');
  if (result.requiresHrApproval) blocks.push('HR_REQUIRED');
  if (result.requiresAccountValidation) blocks.push('ACCOUNT_VALIDATION');

  return `❌ Quality gate failed: ${blocks.join(' | ')} (Risk: ${result.riskLevel})`;
}