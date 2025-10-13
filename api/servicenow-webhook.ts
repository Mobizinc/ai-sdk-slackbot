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

// Initialize services
const caseTriageService = getCaseTriageService();

// Configuration
const WEBHOOK_SECRET = process.env.SERVICENOW_WEBHOOK_SECRET;
const ENABLE_CLASSIFICATION = process.env.ENABLE_CASE_CLASSIFICATION === 'true';

/**
 * Validate webhook signature
 * Original: api/app/services/batch_processing/auth.py
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
 * Main webhook handler
 * Original: api/app/routers/webhooks.py:379-531
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

    // Parse and validate payload with Zod schema
    let webhookData: ServiceNowCaseWebhook;
    try {
      const parsedPayload = JSON.parse(payload);
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
      console.error('[Webhook] Failed to parse webhook payload:', error);
      return Response.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    console.info(
      `[Webhook] Received webhook for case ${webhookData.case_number} (${webhookData.sys_id})`
    );

    // Execute centralized triage workflow
    const triageResult = await caseTriageService.triageCase(webhookData, {
      enableCaching: true,
      enableSimilarCases: true,
      enableKBArticles: true,
      enableBusinessContext: true,
      enableWorkflowRouting: true,
      writeToServiceNow: true,
    });

    const processingTime = Date.now() - startTime;

    console.info(
      `[Webhook] Case ${triageResult.caseNumber} classified as ${triageResult.classification.category}` +
      `${triageResult.classification.subcategory ? ` > ${triageResult.classification.subcategory}` : ''}` +
      ` (${Math.round((triageResult.classification.confidence_score || 0) * 100)}% confidence)` +
      ` in ${processingTime}ms` +
      `${triageResult.cached ? ' [CACHED]' : ''}` +
      `${triageResult.incidentCreated ? ` | Incident ${triageResult.incidentNumber} created` : ''}`
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
