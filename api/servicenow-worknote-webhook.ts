/**
 * ServiceNow Work Note Webhook Handler
 *
 * Processes work note updates from ServiceNow to handle
 * clarification responses for quality control system.
 *
 * This webhook is triggered when work notes are added/updated
 * in ServiceNow cases, allowing us to detect when users
 * respond to clarification questions.
 */

import { z } from "zod";
import type { ServiceNowCaseWebhook } from "../lib/schemas/servicenow-webhook";
import { getQualityGateRepository } from "../lib/db/repositories/quality-gate-repository";
import { getClarificationSessionRepository } from "../lib/db/repositories/clarification-session-repository";
import { processClarificationResponse, validateClarificationResponses } from "../lib/services/interactive-clarification";
import { getQualityAuditService } from "../lib/services/quality-audit-service";
import { serviceNowClient } from "../lib/tools/servicenow";
import { getCaseTriageService } from "../lib/services/case-triage";

/**
 * Work Note Webhook Payload Schema
 *
 * Defines the structure of work note update webhooks from ServiceNow
 */
export const WorkNoteWebhookSchema = z.object({
  // Core case identification
  case_number: z.string().describe("Case number"),
  case_sys_id: z.string().describe("Case sys_id"),

  // Work note details
  work_note: z.string().describe("Work note content"),
  work_note_author: z.string().describe("Author of the work note"),
  work_note_sys_id: z.string().optional().describe("Work note author sys_id"),
  work_note_created_at: z.string().optional().describe("Work note creation timestamp"),

  // Case state information
  case_state: z.string().optional().describe("Current case state"),
  case_assigned_to: z.string().optional().describe("Current assignment"),
  case_assignment_group: z.string().optional().describe("Assignment group"),
  short_description: z.string().optional().describe("Case short description"),
  description: z.string().optional().describe("Case description"),
  priority: z.string().optional().describe("Case priority"),
  urgency: z.string().optional().describe("Case urgency"),
  category: z.string().optional().describe("Case category"),
  subcategory: z.string().optional().describe("Case subcategory"),
  company: z.string().optional().describe("Company sys_id"),
  account_id: z.string().optional().describe("Account name"),
  caller_id: z.string().optional().describe("Caller ID"),

  // Metadata
  event_type: z.enum(["work_note_created", "work_note_updated"]).describe("Type of work note event"),
  timestamp: z.string().describe("Webhook timestamp"),
  instance_url: z.string().describe("ServiceNow instance URL"),
});

export type WorkNoteWebhook = z.infer<typeof WorkNoteWebhookSchema>;

/**
 * Clarification Response Pattern
 *
 * Pattern to match clarification responses in work notes
 * Format: Q1: [answer to question 1]
 */
const CLARIFICATION_RESPONSE_PATTERN = /^Q(\d+):\s*(.+)$/gm;

/**
 * Session ID Pattern
 *
 * Pattern to match clarification session IDs in work notes
 * Format: clarify_CASENUMBER_TIMESTAMP
 */
const SESSION_ID_PATTERN = /clarify_[A-Z0-9]+_\d+/;

/**
 * Main webhook handler function
 */
export async function POST(request: Request) {
  try {
    console.log("[Work Note Webhook] Received work note webhook");

    const payload = WorkNoteWebhookSchema.parse(await request.json());
    console.log(`[Work Note Webhook] Processing work note for case ${payload.case_number}`);

    // Check if this is a clarification response
    const clarificationResult = await parseClarificationResponse(payload);

    if (clarificationResult.isClarificationResponse) {
      console.log(`[Work Note Webhook] Detected clarification response for session ${clarificationResult.sessionId}`);

      // Load session from database
      const sessionRepo = getClarificationSessionRepository();
      const session = await sessionRepo.getBySessionId(clarificationResult.sessionId!);

      if (!session) {
        console.warn(`[Work Note Webhook] Session ${clarificationResult.sessionId} not found`);
        return Response.json({
          success: false,
          error: "Session not found",
          session_id: clarificationResult.sessionId
        }, { status: 404 });
      }

      if (session.status === 'EXPIRED') {
        console.warn(`[Work Note Webhook] Session ${clarificationResult.sessionId} has expired`);
        return Response.json({
          success: false,
          error: "Session expired",
          session_id: clarificationResult.sessionId
        }, { status: 410 });
      }

      // Validate responses against session questions
      const questions = session.questions as Array<any>;
      const validation = validateClarificationResponses(questions, clarificationResult.responses);

      if (!validation.valid) {
        console.log(`[Work Note Webhook] Validation failed for session ${clarificationResult.sessionId}`);

        // Add follow-up work note
        await addFollowUpWorkNote(
          payload.case_sys_id,
          clarificationResult.sessionId!,
          [],
          validation.errors
        );

        return Response.json({
          success: true,
          completed: false,
          validation_errors: validation.errors
        });
      }

      // Mark session as responded
      await sessionRepo.markAsResponded(session.id, clarificationResult.responses);

      // Log the response
      const auditService = getQualityAuditService();
      await auditService.logClarificationResponse(
        session.id,
        clarificationResult.responses,
        clarificationResult.confidence,
        payload.work_note_author || 'unknown'
      );

      // Determine next steps based on responses
      const nextSteps = generateNextSteps(clarificationResult.responses, questions);

      // Mark session as completed
      await sessionRepo.markAsCompleted(session.id);

      // Add completion work note
      await addCompletionWorkNote(
        payload.case_sys_id,
        clarificationResult.sessionId!,
        nextSteps
      );

      // Log completion
      await auditService.logClarificationCompletion(
        session.id,
        nextSteps,
        payload.work_note_author || 'system'
      );

      // Update quality gate record
      const qualityGateRepo = getQualityGateRepository();
      if (session.qualityGateId) {
        await qualityGateRepo.update(session.qualityGateId, {
          status: 'APPROVED',
          blocked: false,
          reviewedAt: new Date(),
          reviewerId: payload.work_note_author || 'user',
          reviewReason: 'Clarification completed successfully'
        });
      }

      // Trigger case processing resume
      await triggerCaseProcessingResume(
        payload.case_number,
        clarificationResult.sessionId!,
        payload
      );

      console.log(`[Work Note Webhook] Clarification session ${clarificationResult.sessionId} completed successfully`);

      return Response.json({
        success: true,
        completed: true,
        case_number: payload.case_number,
        session_id: clarificationResult.sessionId,
        next_steps: nextSteps
      });

    } else {
      console.log(`[Work Note Webhook] Not a clarification response, ignoring`);
    }

    return Response.json({
      success: true,
      case_number: payload.case_number,
      processed: clarificationResult.isClarificationResponse
    });

  } catch (error) {
    console.error("[Work Note Webhook] Error processing webhook:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * Generate next steps based on clarification responses
 */
function generateNextSteps(
  responses: Record<string, any>,
  questions: Array<any>
): string[] {
  const nextSteps: string[] = [];

  nextSteps.push('✅ All required clarifications received');
  nextSteps.push('🔄 Resuming case triage processing');

  // Add specific next steps based on responses
  if (responses['account_exists'] === 'No - new user') {
    nextSteps.push('📝 New user account creation will be processed');
  }

  if (responses['hr_approval'] === 'Yes - approved by HR') {
    nextSteps.push('✅ HR approval verified');
  }

  if (responses['manager_approval'] === true || responses['manager_approval'] === 'true') {
    nextSteps.push('✅ Manager approval verified');
  }

  nextSteps.push('📊 Quality gate requirements satisfied');

  return nextSteps;
}

/**
 * Parse clarification response from work note
 */
async function parseClarificationResponse(payload: WorkNoteWebhook): Promise<{
  isClarificationResponse: boolean;
  sessionId?: string;
  responses: Record<string, any>;
  confidence: number;
}> {
  const workNoteContent = payload.work_note;

  // Check for session ID pattern
  const sessionMatch = workNoteContent.match(SESSION_ID_PATTERN);
  if (!sessionMatch) {
    return {
      isClarificationResponse: false,
      responses: {},
      confidence: 0
    };
  }

  const sessionId = sessionMatch[0];

  // Extract structured responses
  const responses: Record<string, any> = {};
  const responseMatches = workNoteContent.matchAll(CLARIFICATION_RESPONSE_PATTERN);

  let responseCount = 0;
  for (const match of responseMatches) {
    const questionNum = match[1];
    const answer = match[2]?.trim();

    if (questionNum && answer) {
      responses[`Q${questionNum}`] = answer;
      responseCount += 1;
    }
  }

  // Calculate confidence based on response completeness
  const expectedQuestions = await getExpectedQuestions(sessionId);
  let confidence = 0;
  if (expectedQuestions > 0) {
    confidence = (responseCount / expectedQuestions) * 100;
  }

  console.log(`[Work Note Webhook] Parsed ${responseCount} responses for session ${sessionId} (${confidence.toFixed(1)}% complete)`);

  return {
    isClarificationResponse: responseCount > 0,
    sessionId,
    responses,
    confidence
  };
}

/**
 * Get expected questions for a clarification session
 */
async function getExpectedQuestions(sessionId: string): Promise<number> {
  try {
    const sessionRepo = getClarificationSessionRepository();
    const session = await sessionRepo.getBySessionId(sessionId);

    if (!session) {
      console.warn(`[Work Note Webhook] Session ${sessionId} not found`);
      return 0;
    }

    const questions = session.questions as Array<any>;
    return questions.filter(q => q.required).length;

  } catch (error) {
    console.error("[Work Note Webhook] Error getting expected questions:", error);
    return 0;
  }
}

/**
 * Add completion work note to case
 */
async function addCompletionWorkNote(
  caseSysId: string,
  sessionId: string,
  nextSteps: string[]
): Promise<void> {
  const completionNote = `
✅ CLARIFICATION COMPLETED

Session ID: ${sessionId}

All required clarifications have been received and validated.

Next Steps:
${nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Case processing will resume automatically.
Quality gate requirements have been satisfied.

---
*This is an automated system message*
  `.trim();

  await serviceNowClient.addCaseWorkNote(caseSysId, completionNote, true);
}

/**
 * Add follow-up work note for incomplete responses
 */
async function addFollowUpWorkNote(
  caseSysId: string,
  sessionId: string,
  missingRequired: string[],
  validationErrors: string[]
): Promise<void> {
  const followUpNote = `
⚠️ CLARIFICATION INCOMPLETE

Session ID: ${sessionId}

${missingRequired.length > 0 ? `
Missing Required Information:
${missingRequired.map((item, i) => `${i + 1}. ${item}`).join('\n')}
` : ''}

${validationErrors.length > 0 ? `
Validation Errors:
${validationErrors.map((error, i) => `${i + 1}. ${error}`).join('\n')}
` : ''}

Please provide the missing information to continue case processing.
Response format: Q1: [answer], Q2: [answer], etc.

---
*This is an automated system message*
  `.trim();

  await serviceNowClient.addCaseWorkNote(caseSysId, followUpNote, true);
}

/**
 * Trigger case processing resume
 *
 * Re-calls triageCase with skipQualityGate flag to prevent infinite loop
 */
async function triggerCaseProcessingResume(
  caseNumber: string,
  sessionId: string,
  payload: WorkNoteWebhook
): Promise<void> {
  try {
    const auditService = getQualityAuditService();

    // Log resume action
    await auditService.logResumeAction(
      sessionId,
      caseNumber,
      'system'
    );

    console.log(`[Work Note Webhook] Triggering case resume for ${caseNumber}`);

    // Build webhook payload for triage service
    const triageWebhook: ServiceNowCaseWebhook = {
      case_number: caseNumber,
      sys_id: payload.case_sys_id,
      short_description: payload.short_description || '',
      description: payload.description || '',
      assignment_group: payload.case_assignment_group || '',
      assigned_to: payload.case_assigned_to || '',
      priority: payload.priority || '3',
      urgency: payload.urgency || '3',
      category: payload.category || '',
      subcategory: payload.subcategory || '',
      state: payload.case_state || 'new',
      company: payload.company || '',
      account_id: payload.account_id || '',
      caller_id: payload.caller_id || '',
      account: '',
      contact_id: '',
    };

    // Call triage service with skipQualityGate flag
    const triageService = getCaseTriageService();
    const result = await triageService.triageCase(triageWebhook, {
      skipQualityGate: true, // Skip quality gate since clarification was already completed
      writeToServiceNow: true,
      enableCaching: false, // Force fresh classification
    });

    console.log(`[Work Note Webhook] Case ${caseNumber} resume completed:`, {
      success: !result.blocked,
      incidentCreated: result.incidentCreated,
      incidentNumber: result.incidentNumber,
      processingTimeMs: result.processingTimeMs,
    });

    // Add resume summary work note
    const resumeNote = `
🔄 CASE PROCESSING RESUMED

Session ID: ${sessionId}
Clarification Status: ✅ Complete

Processing Result:
• Classification: ${result.classification?.category || 'N/A'} > ${result.classification?.subcategory || 'N/A'}
• Confidence: ${Math.round((result.classification?.confidence_score || 0) * 100)}%
${result.incidentCreated ? `• Incident Created: ${result.incidentNumber}` : ''}
${result.problemCreated ? `• Problem Created: ${result.problemNumber}` : ''}
• Processing Time: ${result.processingTimeMs}ms

---
*This is an automated system message*
    `.trim();

    await serviceNowClient.addCaseWorkNote(payload.case_sys_id, resumeNote, true);

  } catch (error) {
    console.error(`[Work Note Webhook] Error resuming case ${caseNumber}:`, error);

    // Add error work note
    const errorNote = `
❌ CASE RESUME FAILED

Session ID: ${sessionId}
Error: ${error instanceof Error ? error.message : 'Unknown error'}

Manual intervention may be required.
Please contact IT support if this issue persists.

---
*This is an automated system message*
    `.trim();

    try {
      await serviceNowClient.addCaseWorkNote(payload.case_sys_id, errorNote, true);
    } catch (noteError) {
      console.error(`[Work Note Webhook] Failed to add error work note:`, noteError);
    }
  }
}

/**
 * Webhook configuration validation
 */
export function validateWorkNoteWebhookConfig(): {
  configured: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check if ServiceNow client is configured
  if (!serviceNowClient.isConfigured()) {
    issues.push("ServiceNow client is not configured");
  }

  // Check if required repositories are available
  try {
    getQualityGateRepository();
    getClarificationSessionRepository();
  } catch (error) {
    issues.push("Required repositories are not available");
  }

  return {
    configured: issues.length === 0,
    issues
  };
}
