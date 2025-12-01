/**
 * Interactive Clarification System
 * 
 * Provides interactive clarification questions when quality gates detect
 * missing information or potential compliance issues.
 * 
 * This system helps prevent issues like SCS0051638 where agents
 * provided access without proper verification.
 */

import type { ServiceNowCaseWebhook } from "../schemas/servicenow-webhook";
import type { QualityGateResult } from "./case-quality-gate";
import { serviceNowClient } from "../tools/servicenow";
import type { ServiceNowContext } from "../infrastructure/servicenow/repositories";

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: 'choice' | 'text' | 'boolean';
  options?: string[];
  required: boolean;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

export interface ClarificationSession {
  sessionId: string;
  caseNumber: string;
  caseSysId: string;
  questions: ClarificationQuestion[];
  responses: Record<string, any>;
  status: 'pending' | 'in_progress' | 'completed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  assignedTo?: string;
}

export interface ClarificationConfig {
  enabled: boolean;
  sessionTimeoutMinutes: number;
  autoAssignToGroup: boolean;
  requireManagerApproval: boolean;
  escalationThreshold: number;
}

const DEFAULT_CONFIG: ClarificationConfig = {
  enabled: true,
  sessionTimeoutMinutes: 60,
  autoAssignToGroup: true,
  requireManagerApproval: false,
  escalationThreshold: 3
};

/**
 * Generate clarification questions based on quality gate results
 */
export function generateClarificationQuestions(
  webhook: ServiceNowCaseWebhook,
  qualityGate: QualityGateResult
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  // Account validation questions
  if (qualityGate.requiresAccountValidation) {
    questions.push({
      id: 'account_exists',
      question: 'Does the user already have an existing account in the system?',
      type: 'choice',
      options: ['Yes - existing account', 'No - new user', 'Unsure'],
      required: true
    });

    questions.push({
      id: 'last_login',
      question: 'When was the last time the user successfully logged in?',
      type: 'text',
      required: false,
      validation: {
        pattern: '^(\\d{4}-\\d{2}-\\d{2}|unknown|never|unsure)$',
        maxLength: 50
      }
    });
  }

  // HR approval questions
  if (qualityGate.requiresHrApproval) {
    questions.push({
      id: 'hr_approval',
      question: 'Has this request been approved by HR?',
      type: 'choice',
      options: ['Yes - approved by HR', 'No - pending HR approval', 'Not applicable'],
      required: true
    });

    questions.push({
      id: 'employee_type',
      question: 'What type of employee is this?',
      type: 'choice',
      options: [
        'New hire (first day)',
        'Existing employee',
        'Contractor/Temp',
        'PRN/Per-diem',
        'Intern',
        'Other'
      ],
      required: true
    });

    questions.push({
      id: 'start_date',
      question: 'What is the employee\'s official start date?',
      type: 'text',
      required: true,
      validation: {
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        maxLength: 20
      }
    });

    questions.push({
      id: 'manager_approval',
      question: 'Has the direct manager approved this access request?',
      type: 'boolean',
      required: true
    });
  }

  // High privilege access questions
  if (qualityGate.riskLevel === 'high') {
    questions.push({
      id: 'business_justification',
      question: 'What is the business justification for this access level?',
      type: 'text',
      required: true,
      validation: {
        minLength: 10,
        maxLength: 500
      }
    });

    questions.push({
      id: 'training_completed',
      question: 'Has the user completed required security and compliance training?',
      type: 'boolean',
      required: true
    });
  }

  // Compliance-related questions
  const hasComplianceKeywords = [
    webhook.short_description,
    webhook.description
  ].some(text => text?.toLowerCase().includes('hipaa') || 
                     text?.toLowerCase().includes('phi') ||
                     text?.toLowerCase().includes('patient'));

  if (hasComplianceKeywords) {
    questions.push({
      id: 'compliance_team_notified',
      question: 'Has the compliance team been notified about this request?',
      type: 'boolean',
      required: true
    });

    questions.push({
      id: 'reportable_incident',
      question: 'Is this a reportable compliance incident?',
      type: 'choice',
      options: ['Yes - reportable', 'No - not reportable', 'Unsure - needs review'],
      required: true
    });
  }

  return questions;
}

/**
 * Create clarification session and post to ServiceNow
 */
export async function createClarificationSession(
  webhook: ServiceNowCaseWebhook,
  qualityGate: QualityGateResult,
  config: Partial<ClarificationConfig> = {},
  snContext?: ServiceNowContext
): Promise<ClarificationSession> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  if (!fullConfig.enabled) {
    throw new Error('Interactive clarification is disabled');
  }

  const sessionId = `clarify_${webhook.case_number}_${Date.now()}`;
  const questions = generateClarificationQuestions(webhook, qualityGate);
  
  const session: ClarificationSession = {
    sessionId,
    caseNumber: webhook.case_number,
    caseSysId: webhook.sys_id,
    questions,
    responses: {},
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + fullConfig.sessionTimeoutMinutes * 60 * 1000)
  };

  // Generate interactive work note
  const workNote = generateClarificationWorkNote(session, qualityGate);
  
  // Post to ServiceNow
  await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNote, true, snContext);

  console.log(`[Interactive Clarification] Created session ${sessionId} for case ${webhook.case_number}`);
  
  return session;
}

/**
 * Generate work note content for clarification session
 */
function generateClarificationWorkNote(
  session: ClarificationSession,
  qualityGate: QualityGateResult
): string {
  const questionsText = session.questions.map((q, index) => {
    let questionText = `${index + 1}. ${q.question}`;
    
    if (q.type === 'choice' && q.options) {
      questionText += '\n   Options: ' + q.options.map(opt => `• ${opt}`).join('\n   ');
    }
    
    if (q.required) {
      questionText += ' ⚠️ **REQUIRED**';
    }
    
    if (q.validation) {
      const rules = [];
      if (q.validation.pattern) rules.push('Format: ' + q.validation.pattern);
      if (q.validation.minLength) rules.push(`Min length: ${q.validation.minLength}`);
      if (q.validation.maxLength) rules.push(`Max length: ${q.validation.maxLength}`);
      if (rules.length > 0) {
        questionText += '\n   Validation: ' + rules.join(', ');
      }
    }
    
    return questionText;
  }).join('\n\n');

  return `
🔍 INTERACTIVE CLARIFICATION REQUIRED

Session ID: ${session.sessionId}
Expires: ${session.expiresAt.toISOString()}

Quality Gate Issues:
${qualityGate.missingInfo.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Required Clarifications:
${questionsText}

---
**How to Respond:**
Reply to this work note with answers in format:
Q1: [answer to question 1]
Q2: [answer to question 2]
etc.

**Example:**
Q1: Yes - existing account
Q2: 2024-01-15
Q3: Yes - approved by HR

**Important:**
• All required questions must be answered
• Session expires in ${Math.ceil((session.expiresAt.getTime() - Date.now()) / (60 * 1000))} minutes
• Case processing will continue once clarifications are received
• Contact IT Support if you need assistance with this form
  `.trim();
}

/**
 * Process clarification responses
 */
export async function processClarificationResponse(
  sessionId: string,
  responses: Record<string, any>,
  snContext?: ServiceNowContext
): Promise<{
  success: boolean;
  completed: boolean;
  missingRequired: string[];
  validationErrors: string[];
  nextSteps: string[];
}> {
  // In a real implementation, we would:
  // 1. Load the session from database
  // 2. Validate responses
  // 3. Update the session
  // 4. Continue case processing if complete
  
  const missingRequired: string[] = [];
  const validationErrors: string[] = [];
  const nextSteps: string[] = [];

  // Simulate validation (in real implementation, load session from DB)
  if (responses.account_exists === undefined) {
    missingRequired.push('account_exists');
  }

  if (responses.hr_approval === undefined) {
    missingRequired.push('hr_approval');
  }

  const completed = missingRequired.length === 0 && validationErrors.length === 0;

  if (completed) {
    nextSteps.push('✅ All required clarifications received');
    nextSteps.push('🔄 Case processing will continue');
    nextSteps.push('📝 Account access will be validated before creation');
  } else {
    nextSteps.push('❌ Missing required responses');
    if (missingRequired.length > 0) {
      nextSteps.push(`Required: ${missingRequired.join(', ')}`);
    }
    if (validationErrors.length > 0) {
      nextSteps.push(`Validation errors: ${validationErrors.join(', ')}`);
    }
  }

  return {
    success: true,
    completed,
    missingRequired,
    validationErrors,
    nextSteps
  };
}

/**
 * Check if clarification session has expired
 */
export function isSessionExpired(session: ClarificationSession): boolean {
  return Date.now() > session.expiresAt.getTime();
}

/**
 * Generate escalation message for expired sessions
 */
export function generateEscalationMessage(session: ClarificationSession): string {
  return `
⏰ CLARIFICATION SESSION EXPIRED

Session ID: ${session.sessionId}
Case: ${session.caseNumber}
Expired: ${session.expiresAt.toISOString()}

The clarification session has expired without receiving all required responses.
This case requires immediate attention from a supervisor or manager.

**Missing Information:**
${session.questions
  .filter(q => q.required && !session.responses[q.id])
  .map(q => `• ${q.question}`)
  .join('\n')}

**Action Required:**
1. Contact the requestor directly for missing information
2. Verify all compliance requirements are met
3. Document the reason for expiration
4. Proceed with case resolution or escalation as appropriate

This case has been flagged for supervisory review due to expired clarification session.
  `.trim();
}

/**
 * Quality check for clarification responses
 */
export function validateClarificationResponses(
  questions: ClarificationQuestion[],
  responses: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const question of questions) {
    const response = responses[question.id];
    
    // Check required questions
    if (question.required && (response === undefined || response === null || response === '')) {
      errors.push(`Question "${question.question}" is required`);
      continue;
    }

    // Skip validation for empty optional responses
    if (!question.required && (response === undefined || response === null || response === '')) {
      continue;
    }

    // Type-specific validation
    if (question.type === 'choice' && question.options) {
      if (!question.options.includes(response)) {
        errors.push(`Invalid choice for "${question.question}". Must be one of: ${question.options.join(', ')}`);
      }
    }

    if (question.type === 'boolean') {
      if (typeof response !== 'boolean' && response !== 'true' && response !== 'false') {
        errors.push(`Invalid response for "${question.question}". Must be true or false`);
      }
    }

    // Pattern validation
    if (question.validation?.pattern && typeof response === 'string') {
      const regex = new RegExp(question.validation.pattern);
      if (!regex.test(response)) {
        errors.push(`Invalid format for "${question.question}". Expected format: ${question.validation.pattern}`);
      }
    }

    // Length validation
    if (question.validation?.minLength && typeof response === 'string') {
      if (response.length < question.validation.minLength) {
        errors.push(`Response too short for "${question.question}". Minimum length: ${question.validation.minLength}`);
      }
    }

    if (question.validation?.maxLength && typeof response === 'string') {
      if (response.length > question.validation.maxLength) {
        errors.push(`Response too long for "${question.question}". Maximum length: ${question.validation.maxLength}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}