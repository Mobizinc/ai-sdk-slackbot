/**
 * ServiceNow Webhook Endpoint (SIMPLIFIED VERSION)
 * Handles incoming case classification requests from ServiceNow
 *
 * This version removes duplicate database persistence since classifyCaseEnhanced()
 * already handles saving classification results and discovered entities.
 */

import { createHmac } from 'crypto';
import { getCaseClassificationRepository } from '../lib/db/repositories/case-classification-repository';
import { getCaseClassifier } from '../lib/services/case-classifier';
import { serviceNowClient } from '../lib/tools/servicenow';
import { formatWorkNote } from '../lib/services/work-note-formatter';

// Initialize services
const caseClassificationRepository = getCaseClassificationRepository();
const caseClassifier = getCaseClassifier();
const servicenow = serviceNowClient;

// Configuration
const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const ENABLE_CLASSIFICATION = process.env.ENABLE_CASE_CLASSIFICATION === 'true';
const WRITE_WORK_NOTES = process.env.CASE_CLASSIFICATION_WRITE_NOTES === 'true';
const MAX_RETRIES = parseInt(process.env.CASE_CLASSIFICATION_MAX_RETRIES || '3');

// Cache for duplicate detection (simple in-memory cache)
const duplicateCache = new Map<string, { timestamp: number; processed: boolean }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Validate webhook signature
 */
function validateSignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] No webhook secret configured, skipping signature validation');
    return true;
  }

  const expectedSignature = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Check for duplicate requests
 */
function isDuplicate(caseId: string): boolean {
  const cached = duplicateCache.get(caseId);
  if (!cached) return false;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    duplicateCache.delete(caseId);
    return false;
  }

  return cached.processed;
}

/**
 * Mark request as processed
 */
function markAsProcessed(caseId: string): void {
  duplicateCache.set(caseId, {
    timestamp: Date.now(),
    processed: true
  });
}

/**
 * Clean old cache entries
 */
function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of duplicateCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      duplicateCache.delete(key);
    }
  }
}

/**
 * Extract case information from webhook payload
 */
function extractCaseInfo(payload: any) {
  return {
    caseId: payload.sys_id || payload.case_id,
    caseNumber: payload.number || payload.case_number,
    shortDescription: payload.short_description || payload.description || '',
    description: payload.description || payload.comments || '',
    assignmentGroup: payload.assignment_group || '',
    assignedTo: payload.assigned_to || '',
    urgency: payload.urgency || '',
    impact: payload.impact || '',
    configurationItem: payload.configuration_item || payload.cmdb_ci || '',
    caller: payload.caller_id || payload.opened_by || '',
    category: payload.category || '',
    subcategory: payload.subcategory || '',
    businessService: payload.business_service || '',
    contactType: payload.contact_type || '',
    state: payload.state || '',
    priority: payload.priority || ''
  };
}

/**
 * Write work note to ServiceNow
 */
async function writeWorkNote(caseId: string, workNote: string): Promise<boolean> {
  if (!WRITE_WORK_NOTES) {
    console.info('[Webhook] Work note writing disabled, skipping ServiceNow update');
    return true;
  }

  try {
    await servicenow.updateCase(caseId, {
      work_notes: workNote,
      comments: ''
    });

    console.info(`[Webhook] Work note written to case ${caseId}`);
    return true;
  } catch (error) {
    console.error(`[Webhook] Failed to write work note to case ${caseId}:`, error);
    return false;
  }
}

/**
 * Main webhook handler
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Check if classification is enabled
    if (!ENABLE_CLASSIFICATION) {
      return Response.json(
        { error: 'Case classification is disabled' },
        { status: 503 }
      );
    }

    // Get request body and signature
    const payload = await request.text();
    const signature = request.headers.get('x-servicenow-signature') ||
                     request.headers.get('signature') || '';

    // Validate signature
    if (!validateSignature(payload, signature)) {
      console.warn('[Webhook] Invalid webhook signature received');
      return Response.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse payload
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
    } catch (error) {
      console.error('[Webhook] Failed to parse webhook payload:', error);
      return Response.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Extract case information
    const caseInfo = extractCaseInfo(webhookData);

    if (!caseInfo.caseId) {
      console.error('[Webhook] No case ID found in webhook payload');
      return Response.json(
        { error: 'Missing case ID' },
        { status: 400 }
      );
    }

    // Check for duplicates
    if (isDuplicate(caseInfo.caseId)) {
      console.info(`[Webhook] Duplicate request for case ${caseInfo.caseId}, skipping`);
      return Response.json(
        { message: 'Duplicate request ignored' },
        { status: 200 }
      );
    }

    // Clean old cache entries
    cleanCache();

    // Record inbound payload (for webhook tracking)
    await caseClassificationRepository.saveInboundPayload({
      caseNumber: caseInfo.caseNumber,
      caseSysId: caseInfo.caseId,
      rawPayload: webhookData,
      routingContext: {
        assignmentGroup: caseInfo.assignmentGroup,
        assignedTo: caseInfo.assignedTo,
        category: caseInfo.category,
        subcategory: caseInfo.subcategory,
        priority: caseInfo.priority,
        state: caseInfo.state
      }
    });

    console.info(`[Webhook] Processing case ${caseInfo.caseNumber} (${caseInfo.caseId})`);

    // Perform classification with retry logic
    let classificationResult = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Use enhanced classifier - handles classification, entity extraction,
        // business intelligence, similar cases, KB articles, AND database persistence
        classificationResult = await caseClassifier.classifyCaseEnhanced({
          case_number: caseInfo.caseNumber,
          sys_id: caseInfo.caseId,
          short_description: caseInfo.shortDescription,
          description: caseInfo.description,
          assignment_group: caseInfo.assignmentGroup,
          urgency: caseInfo.urgency,
          current_category: caseInfo.category,
          priority: caseInfo.priority,
          state: caseInfo.state
        });

        if (classificationResult) {
          break;
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`[Webhook] Classification attempt ${attempt} failed for case ${caseInfo.caseId}:`, error);

        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    if (!classificationResult) {
      console.error(`[Webhook] All classification attempts failed for case ${caseInfo.caseId}:`, lastError);

      // Mark inbound payload as failed
      const inboundRecord = await caseClassificationRepository.getUnprocessedPayload(caseInfo.caseNumber);
      if (inboundRecord) {
        await caseClassificationRepository.markPayloadAsProcessed(
          inboundRecord.id,
          undefined,
          lastError?.message || 'Classification failed'
        );
      }

      return Response.json(
        { error: 'Classification failed after retries' },
        { status: 500 }
      );
    }

    // Format and write work note to ServiceNow
    const workNote = formatWorkNote(classificationResult as any);
    const workNoteWritten = await writeWorkNote(caseInfo.caseId, workNote);

    // Mark inbound payload as processed
    const inboundRecord = await caseClassificationRepository.getUnprocessedPayload(caseInfo.caseNumber);
    if (inboundRecord) {
      await caseClassificationRepository.markPayloadAsProcessed(
        inboundRecord.id,
        classificationResult.workflowId
      );
    }

    // Mark as processed in cache to prevent duplicates
    markAsProcessed(caseInfo.caseId);

    const processingTime = Date.now() - startTime;

    console.info(
      `[Webhook] Case ${caseInfo.caseNumber} classified as ${classificationResult.category}` +
      `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ''}` +
      ` (${classificationResult.confidence_score ? Math.round(classificationResult.confidence_score * 100) : 0}% confidence)` +
      ` in ${processingTime}ms`
    );

    return Response.json({
      success: true,
      caseId: caseInfo.caseId,
      caseNumber: caseInfo.caseNumber,
      workflowId: classificationResult.workflowId,
      classification: {
        category: classificationResult.category,
        subcategory: classificationResult.subcategory,
        confidenceScore: classificationResult.confidence_score,
        urgencyLevel: classificationResult.urgency_level
      },
      entitiesDiscovered: classificationResult.discoveredEntities?.length || 0,
      processingTimeMs: processingTime,
      workNoteWritten
    });

  } catch (error) {
    console.error('[Webhook] Processing failed:', error);

    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return Response.json({
    status: 'healthy',
    classificationEnabled: ENABLE_CLASSIFICATION,
    workNoteWritingEnabled: WRITE_WORK_NOTES,
    maxRetries: MAX_RETRIES,
    timestamp: new Date().toISOString()
  });
}
