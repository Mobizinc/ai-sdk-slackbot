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

import { createHmac } from 'crypto';
import { getCaseTriageService } from '../lib/services/case-triage';
import {
  validateServiceNowWebhook,
  type ServiceNowCaseWebhook,
} from '../lib/schemas/servicenow-webhook';
import { getQStashClient, getWorkerUrl, isQStashEnabled } from '../lib/queue/qstash-client';
import { withLangSmithTrace } from '../lib/observability';
import { parseServiceNowPayload } from '../lib/utils/servicenow-payload';

// Initialize services
const caseTriageService = getCaseTriageService();

// Configuration
const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const ENABLE_CLASSIFICATION = process.env.ENABLE_CASE_CLASSIFICATION === 'true';
// Async triage is ON by default - explicitly set to 'false' to disable
const ENABLE_ASYNC_TRIAGE = process.env.ENABLE_ASYNC_TRIAGE !== 'false';

/**
 * Validate webhook request
 * Supports multiple authentication methods (all using same SERVICENOW_WEBHOOK_SECRET):
 * 1. Simple API key in header (x-api-key) - Azure Functions style
 * 2. Simple API key in query param (?code=xxx) - Azure Functions style
 * 3. HMAC-SHA256 signature (hex or base64) - Advanced security
 */
function validateRequest(request: Request, payload: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] No SERVICENOW_WEBHOOK_SECRET configured, allowing request');
    return true;
  }

  // Method 1: Simple API key in header (x-api-key)
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('x-functions-key');
  if (apiKeyHeader === WEBHOOK_SECRET) {
    console.info('[Webhook] Authenticated via API key (header)');
    return true;
  }

  // Method 2: Simple API key in query param (?code=xxx) - Azure Functions style
  const url = new URL(request.url);
  const apiKeyQuery = url.searchParams.get('code');
  if (apiKeyQuery === WEBHOOK_SECRET) {
    console.info('[Webhook] Authenticated via API key (query param)');
    return true;
  }

  // Method 3: HMAC signature (backward compatibility)
  const signature = request.headers.get('x-servicenow-signature') ||
                   request.headers.get('signature') || '';

  if (signature) {
    // ServiceNow may send signatures in either hex or base64 format
    const hexSignature = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    const base64Signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');

    if (signature === hexSignature || signature === base64Signature) {
      console.info('[Webhook] Authenticated via HMAC signature');
      return true;
    }
  }

  // All authentication methods failed
  return false;
}

/**
 * Main webhook handler
 * Original: api/app/routers/webhooks.py:379-531
 */
const postImpl = withLangSmithTrace(async (request: Request) => {
  const startTime = Date.now();

  try {
    // Check if classification is enabled
    if (!ENABLE_CLASSIFICATION) {
      return Response.json(
        { error: 'Case classification is disabled' },
        { status: 503 }
      );
    }

    // Get request body
    const payload = await request.text();

    // Validate authentication (API key or HMAC signature)
    if (!validateRequest(request, payload)) {
      console.warn('[Webhook] Authentication failed');
      return Response.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Parse and validate payload with Zod schema
    let webhookData: ServiceNowCaseWebhook;
    try {
      const parsedPayload = parseServiceNowPayload(payload);

      const validationResult = validateServiceNowWebhook(parsedPayload);

      if (!validationResult.success) {
        console.error('[Webhook] Schema validation failed:', validationResult.errors);
        return Response.json(
          {
            error: 'Invalid webhook payload schema',
            details: validationResult.errors,
          },
          { status: 422 } // Unprocessable Entity
        );
      }

      webhookData = validationResult.data!;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Webhook] Failed to parse webhook payload:', errorMessage);

      // Extract useful error details for the response
      const errorDetails: Record<string, any> = {
        message: errorMessage,
        payloadLength: payload?.length || 0,
      };

      // Check if error message contains position information
      const positionMatch = errorMessage.match(/position (\d+)/);
      if (positionMatch) {
        errorDetails.errorPosition = parseInt(positionMatch[1], 10);
        errorDetails.hint = 'Check the JSON syntax around the specified position';
      }

      return Response.json(
        {
          error: 'Invalid JSON payload',
          details: errorDetails,
        },
        { status: 400 }
      );
    }

    // Log webhook with company/account info for debugging
    const companyInfo = webhookData.company ? `Company: ${webhookData.company}` : '';
    const accountInfo = webhookData.account_id ? `Account: ${webhookData.account_id}` : '';
    const clientInfo = [companyInfo, accountInfo].filter(Boolean).join(' | ');

    console.info(
      `[Webhook] Received webhook for case ${webhookData.case_number} (${webhookData.sys_id})` +
      (clientInfo ? ` | ${clientInfo}` : '')
    );

    // Check if async triage is enabled
    if (ENABLE_ASYNC_TRIAGE && isQStashEnabled()) {
      // Async mode: Enqueue to QStash and return immediately
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

        console.info(
          `[Webhook] Case ${webhookData.case_number} queued successfully (async mode)`
        );

        // Return 202 Accepted - processing will happen asynchronously
        return Response.json({
          success: true,
          queued: true,
          case_number: webhookData.case_number,
          message: 'Case queued for async processing',
        }, { status: 202 });

      } catch (error) {
        console.error('[Webhook] Failed to enqueue to QStash:', error);
        // Fall through to sync processing as fallback
        console.warn('[Webhook] Falling back to synchronous processing');
      }
    }

    // Sync mode: Execute centralized triage workflow immediately
    const triageResult = await caseTriageService.triageCase(webhookData, {
      enableCaching: true,
      enableSimilarCases: true,
      enableKBArticles: true,
      enableBusinessContext: true,
      enableWorkflowRouting: true,
      writeToServiceNow: true,
      enableCatalogRedirect: true,
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

    // Return comprehensive response matching original format
    return Response.json({
      success: true,
      case_number: triageResult.caseNumber,
      classification: {
        category: triageResult.classification.category,
        subcategory: triageResult.classification.subcategory,
        confidence_score: triageResult.classification.confidence_score,
        urgency_level: triageResult.classification.urgency_level,
        reasoning: triageResult.classification.reasoning,
        keywords: (triageResult.classification as any).keywords ||
                 (triageResult.classification as any).keywords_detected || [],
        quick_summary: triageResult.classification.quick_summary,
        immediate_next_steps: triageResult.classification.immediate_next_steps,
        technical_entities: triageResult.classification.technical_entities,
        business_intelligence: triageResult.classification.business_intelligence,
        record_type_suggestion: triageResult.classification.record_type_suggestion,
      },
      similar_cases: triageResult.similarCases,
      kb_articles: triageResult.kbArticles,
      servicenow_updated: triageResult.servicenowUpdated,
      update_error: triageResult.updateError,
      processing_time_ms: triageResult.processingTimeMs,
      entities_discovered: triageResult.entitiesDiscovered,
      workflow_id: triageResult.workflowId,
      cached: triageResult.cached,
      cache_reason: triageResult.cacheReason,
      // ITSM record type fields
      incident_created: triageResult.incidentCreated,
      incident_number: triageResult.incidentNumber,
      incident_sys_id: triageResult.incidentSysId,
      incident_url: triageResult.incidentUrl,
      record_type_suggestion: triageResult.recordTypeSuggestion,
      // Catalog redirect fields
      catalog_redirected: triageResult.catalogRedirected,
      catalog_redirect_reason: triageResult.catalogRedirectReason,
      catalog_items_provided: triageResult.catalogItemsProvided,
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
}, {
  name: "servicenow_webhook_handler",
  runType: "chain",
  tags: {
    component: "api",
    operation: "webhook",
    service: "servicenow",
  },
});

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
