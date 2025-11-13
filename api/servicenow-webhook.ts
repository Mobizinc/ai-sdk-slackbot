/**
 * ServiceNow Webhook Endpoint (PRODUCTION VERSION)
 * Handles incoming case classification requests from ServiceNow
 *
 * This version uses the centralized case triage service for full feature parity with
 * the original Python implementation (mobiz-intelligence-analytics).
 *
 * Features:
 * - Schema validation with Zod
 * - Classification caching (prevents duplicate LLM calls)
 * - Workflow routing (different approaches for different case types)
 * - Azure AI Search integration (similar cases with MSP attribution)
 * - Business context enrichment (company-specific intelligence)
 * - Comprehensive error handling with retries
 *
 * Original: api/app/routers/webhooks.py:379-531
 */

import { getCaseTriageService } from '../lib/services/case-triage';
import {
  type ServiceNowCaseWebhook,
} from '../lib/schemas/servicenow-webhook';
import { getQStashClient, getWorkerUrl, isQStashEnabled } from '../lib/queue/qstash-client';
import {
  parseAndValidateWebhookRequest,
  validateWebhook,
  buildTriageSuccessResponse,
  buildQueuedResponse,
  buildErrorResponse,
  type WebhookError,
} from '../lib/utils/webhook-helpers';

// Initialize services
const caseTriageService = getCaseTriageService();

// Configuration
const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const ENABLE_CLASSIFICATION = process.env.ENABLE_CASE_CLASSIFICATION === 'true';
// Async triage is ON by default - explicitly set to 'false' to disable
const ENABLE_ASYNC_TRIAGE = process.env.ENABLE_ASYNC_TRIAGE !== 'false';
// Use new ServiceNowParser with advanced JSON handling (default to true)
const USE_NEW_PARSER = process.env.SERVICENOW_USE_NEW_PARSER !== 'false';

/**
 * Try to enqueue a case for async processing via QStash
 * Returns null if async processing is disabled or fails (falls back to sync)
 */
async function tryEnqueueCase(webhookData: ServiceNowCaseWebhook): Promise<Response | null> {
  if (!ENABLE_ASYNC_TRIAGE || !isQStashEnabled()) {
    return null;
  }

  try {
    const qstashClient = getQStashClient();
    if (!qstashClient) {
      throw new Error('QStash client not initialized');
    }

    const workerUrl = getWorkerUrl('/api/workers/process-case');
    console.info(`[Webhook] Enqueueing case ${webhookData.case_number} to ${workerUrl}`);

    await qstashClient.publishJSON({
      url: workerUrl,
      body: webhookData,
      retries: 3,
      delay: 0,
    });

    console.info(`[Webhook] Case ${webhookData.case_number} queued successfully (async mode)`);
    return buildQueuedResponse(webhookData.case_number);
  } catch (error) {
    console.error('[Webhook] Failed to enqueue to QStash:', error);
    console.warn('[Webhook] Falling back to synchronous processing');
    return null;
  }
}

/**
 * Main webhook handler
 * Original: api/app/routers/webhooks.py:379-531
 */
async function postImpl(request: Request) {
  const startTime = Date.now();

  try {
    // Check if classification is enabled
    if (!ENABLE_CLASSIFICATION) {
      return Response.json(
        { error: 'Case classification is disabled' },
        { status: 503 }
      );
    }

    const parsedRequest = await parseAndValidateWebhookRequest<ServiceNowCaseWebhook>(
      request,
      {
        validator: validateWebhook,
        webhookSecret: WEBHOOK_SECRET,
        useNewParser: USE_NEW_PARSER,
        treatEmptyObjectAsValidationError: true,
        label: "CaseWebhook",
      }
    );

    if (!parsedRequest.ok) {
      return parsedRequest.response;
    }

    const webhookData = parsedRequest.data;

    // Log webhook with company/account info for debugging
    const companyInfo = webhookData.company ? `Company: ${webhookData.company}` : '';
    const accountInfo = webhookData.account_id ? `Account: ${webhookData.account_id}` : '';
    const clientInfo = [companyInfo, accountInfo].filter(Boolean).join(' | ');

    console.info(
      `[Webhook] Received webhook for case ${webhookData.case_number} (${webhookData.sys_id})` +
      (clientInfo ? ` | ${clientInfo}` : '')
    );

    // Try async processing first if enabled
    const queuedResponse = await tryEnqueueCase(webhookData);
    if (queuedResponse) {
      return queuedResponse;
    }

    return handleSyncCase(webhookData, startTime);

  } catch (error) {
    console.error('[Webhook] Processing failed:', error);

    return buildErrorResponse({
      type: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
      statusCode: 500,
    });
  }
}

async function handleSyncCase(
  webhookData: ServiceNowCaseWebhook,
  startTime: number
): Promise<Response> {
  const classificationStage = await caseTriageService.runClassificationStage(webhookData, {
    enableCaching: true,
    enableSimilarCases: true,
    enableKBArticles: true,
    enableBusinessContext: true,
    enableWorkflowRouting: true,
    writeToServiceNow: true,
    enableCatalogRedirect: true,
  });

  const triageResult = await caseTriageService.applyDeterministicActions(classificationStage, {
    enableCatalogRedirect: true,
    writeToServiceNow: true,
  });

  const processingTime = Date.now() - startTime;

  console.info(
    `[Webhook] Case ${triageResult.caseNumber} classified as ${triageResult.classification.category}` +
      `${triageResult.classification.subcategory ? ` > ${triageResult.classification.subcategory}` : ''}` +
      ` (${Math.round((triageResult.classification.confidence_score || 0) * 100)}% confidence)` +
      ` in ${processingTime}ms` +
      `${triageResult.cached ? ' [CACHED]' : ''}` +
      `${triageResult.incidentCreated ? ` | Incident ${triageResult.incidentNumber} created` : ''}` +
      `${triageResult.catalogRedirected ? ` | Redirected to catalog (${triageResult.catalogItemsProvided} items)` : ''}`
  );

  return buildTriageSuccessResponse({
    ...triageResult,
    processingTimeMs: processingTime,
    queueTimeMs: triageResult.queueTimeMs ?? undefined,
  });
}

export const POST = postImpl;

/**
 * Health check endpoint
 * Tests connectivity to all required services
 */
export async function GET() {
  try {
    const connectivity = await caseTriageService.testConnectivity();
    const stats = await caseTriageService.getTriageStats(7);

    return Response.json({
      status: 'healthy',
      classification_enabled: ENABLE_CLASSIFICATION,
      connectivity: {
        azure_search: connectivity.azureSearch,
        database: connectivity.database,
        servicenow: connectivity.serviceNow,
      },
      stats: {
        total_cases_7d: stats.totalCases,
        avg_processing_time_ms: Math.round(stats.averageProcessingTime),
        avg_confidence: Math.round(stats.averageConfidence * 100),
        cache_hit_rate: Math.round(stats.cacheHitRate * 100),
        top_workflows: stats.topWorkflows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Webhook] Health check failed:', error);
    return Response.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
