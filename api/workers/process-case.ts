/**
 * QStash Worker: Case Processing
 * Async worker that processes case triage requests from the queue
 *
 * This endpoint is called by QStash after a case is enqueued.
 * It has no Vercel timeout constraints (up to 15min on Pro plan).
 *
 * Flow:
 * 1. Verify QStash signature
 * 2. Process case triage (can take 3-5 minutes)
 * 3. Return success (QStash marks complete) or throw error (QStash retries)
 */

import { getCaseTriageService } from '../../lib/services/case-triage';
import {
  validateServiceNowWebhook,
  type ServiceNowCaseWebhook,
} from '../../lib/schemas/servicenow-webhook';
import { getSigningKeys, isQStashEnabled, verifyQStashSignature } from '../../lib/queue/qstash-client';

// Initialize services
const caseTriageService = getCaseTriageService();

// Configuration
const ENABLE_ASYNC_TRIAGE = process.env.ENABLE_ASYNC_TRIAGE === 'true';

/**
 * Process case triage (async worker)
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Read body once at the start (can only be read once)
    const body = await request.text();

    // Get signature from headers
    const signature = request.headers.get('upstash-signature');

    const qstashEnabled = isQStashEnabled();

    if (qstashEnabled) {
      const isValidSignature = verifyQStashSignature(signature, body);
      if (!isValidSignature) {
        console.warn('[Worker] Invalid QStash signature - rejecting request');
        return Response.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    } else if (!signature) {
      console.warn('[Worker] QStash disabled - processing without signature');
    }

    if (qstashEnabled && !signature) {
      console.error('[Worker] Missing upstash-signature header');
      console.warn('[Worker] Invalid QStash signature - rejecting request');
      return Response.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse webhook data from QStash message
    let messageData: unknown;
    if (!body) {
      console.error('[Worker] Missing request body');
      return Response.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    try {
      messageData = JSON.parse(body);
    } catch (error) {
      console.error('[Worker] Failed to parse JSON body:', error);
      return Response.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // Extract the actual webhook payload
    // QStash wraps the message, so we need to get the body
    const rawWebhook = (messageData as any)?.body ?? messageData;

    if (!rawWebhook) {
      return Response.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const webhookData: ServiceNowCaseWebhook = rawWebhook as ServiceNowCaseWebhook;

    // Validate schema
    const validationResult = validateServiceNowWebhook(webhookData);
    if (!validationResult.success) {
      console.error('[Worker] Invalid webhook schema:', validationResult.errors);
      // Don't retry invalid schemas - return 200 to prevent infinite retries
      return Response.json(
        {
          success: false,
          error: 'Invalid webhook schema',
          details: validationResult.errors,
        },
        { status: 200 } // 200 so QStash doesn't retry
      );
    }

    const caseNumber = webhookData.case_number;
    const messageId = request.headers.get('upstash-message-id') || 'unknown';

    console.info(
      `[Worker] Processing case ${caseNumber} (QStash message: ${messageId})`
    );

    // Execute full triage workflow (no timeout constraints here)
    const triageResult = await caseTriageService.triageCase(webhookData, {
      enableCaching: true,
      enableSimilarCases: true,
      enableKBArticles: true,
      enableBusinessContext: true,
      enableWorkflowRouting: true,
      writeToServiceNow: true,
    });

    const processingTime = Date.now() - startTime;

    if (triageResult) {
      console.info(
        `[Worker] Case ${triageResult.caseNumber} processed successfully in ${processingTime}ms | ` +
        `Classification: ${triageResult.classification.category}` +
        `${triageResult.classification.subcategory ? ` > ${triageResult.classification.subcategory}` : ''}` +
        ` (${Math.round((triageResult.classification.confidence_score || 0) * 100)}% confidence)` +
        `${triageResult.cached ? ' [CACHED]' : ''}` +
        `${triageResult.incidentCreated ? ` | Incident ${triageResult.incidentNumber} created` : ''}`
      );
    } else {
      console.warn('[Worker] Case triage returned no result payload');
    }

    // Return success - QStash will mark message as completed
    return Response.json({
      success: true,
      case_number: triageResult?.caseNumber ?? (webhookData as any)?.case_number ?? null,
      processing_time_ms: processingTime,
      classification: triageResult?.classification ?? null,
      servicenow_updated: triageResult?.servicenowUpdated ?? false,
      cached: triageResult?.cached ?? false,
      incident_created: triageResult?.incidentCreated ?? false,
      incident_number: triageResult?.incidentNumber ?? null,
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[Worker] Processing failed after ${processingTime}ms:`, error);

    // Return 500 error - QStash will automatically retry
    // (with exponential backoff: 1min, 5min, 15min)
    return Response.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: processingTime,
      },
      { status: 500 } // Trigger QStash retry
    );
  }
}

/**
 * Health check for worker
 */
export async function GET() {
  return Response.json({
    status: 'healthy',
    worker: 'process-case',
    async_triage_enabled: ENABLE_ASYNC_TRIAGE,
    qstash_configured: !!(getSigningKeys().current && getSigningKeys().next),
    timestamp: new Date().toISOString(),
  });
}
