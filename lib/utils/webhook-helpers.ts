/**
 * Webhook Helper Utilities
 * Reusable functions for webhook authentication, payload parsing, and response formatting
 * Used by multiple webhook endpoints to maintain consistent behavior and error handling
 *
 * Responsibilities:
 * - Authentication: API key headers, query params, HMAC signatures
 * - Payload parsing: New and legacy ServiceNow payload parsing
 * - Response formatting: Success responses, queued responses, error responses
 */

import { createHmac } from 'crypto';
import { parseServiceNowPayload } from './servicenow-payload';
import { ServiceNowParser } from './servicenow-parser';
import {
  validateServiceNowWebhook,
  type ServiceNowCaseWebhook,
} from '../schemas/servicenow-webhook';

/**
 * Result type for webhook authentication attempts
 * Includes which method was used for observability logging
 */
export interface AuthResult {
  authenticated: boolean;
  method?: 'api-key-header' | 'api-key-query' | 'hmac-signature' | 'no-secret';
  error?: string;
}

/**
 * Result type for webhook payload parsing
 * Provides both the parsed data and metadata about the parsing attempt
 */
export interface ParseResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  metadata?: {
    strategy?: string;
    warnings?: string[];
    originalLength?: number;
    sanitizedLength?: number;
    processingTimeMs?: number;
  };
}

/**
 * Result type for webhook schema validation
 * Includes the validated data or detailed error information
 */
export interface ValidationResult {
  success: boolean;
  data?: ServiceNowCaseWebhook;
  errors?: string[];
}

/**
 * Standardized webhook error type for consistent error response formatting
 */
export interface WebhookError {
  type: 'authentication_error' | 'parse_error' | 'validation_error' | 'internal_error';
  message: string;
  details?: unknown;
  statusCode: number;
}

/**
 * Authenticate webhook request using multiple methods
 *
 * Supports three authentication approaches:
 * 1. Simple API key in x-api-key or x-functions-key header (matches secret directly)
 * 2. Simple API key in ?code=xxx query parameter (matches secret directly)
 * 3. HMAC-SHA256 signature in x-servicenow-signature or signature header
 *    (can be hex or base64 encoded, computed over raw request body)
 *
 * If no WEBHOOK_SECRET is configured, all requests are allowed (for development)
 *
 * @param request - The incoming HTTP request
 * @param payload - The raw request body (used for HMAC computation)
 * @param secret - The webhook secret (optional, if not provided returns no-secret)
 * @returns AuthResult with authenticated boolean and method used
 *
 * @example
 * const authResult = authenticateWebhookRequest(request, payload, WEBHOOK_SECRET);
 * if (!authResult.authenticated) {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * console.info(`Authenticated via ${authResult.method}`);
 */
export function authenticateWebhookRequest(
  request: Request,
  payload: string,
  secret?: string
): AuthResult {
  // If no secret configured, allow all requests (development mode)
  if (!secret) {
    return {
      authenticated: true,
      method: 'no-secret',
    };
  }

  // Method 1: Simple API key in header (x-api-key or x-functions-key)
  const apiKeyHeader = request.headers.get('x-api-key') ||
                       request.headers.get('x-functions-key');
  if (apiKeyHeader === secret) {
    return {
      authenticated: true,
      method: 'api-key-header',
    };
  }

  // Method 2: Simple API key in query param (?code=xxx)
  try {
    const url = new URL(request.url);
    const apiKeyQuery = url.searchParams.get('code');
    if (apiKeyQuery === secret) {
      return {
        authenticated: true,
        method: 'api-key-query',
      };
    }
  } catch {
    // Invalid URL, continue to next auth method
  }

  // Method 3: HMAC-SHA256 signature verification
  const signatureHeader = request.headers.get('x-servicenow-signature') ||
                         request.headers.get('signature') || '';

  if (signatureHeader) {
    // ServiceNow may send signatures in either hex or base64 format
    const hexSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const base64Signature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    if (signatureHeader === hexSignature || signatureHeader === base64Signature) {
      return {
        authenticated: true,
        method: 'hmac-signature',
      };
    }
  }

  // All authentication methods failed
  return {
    authenticated: false,
    error: 'No valid authentication credentials provided',
  };
}

/**
 * Parse webhook payload using configured parser strategy
 *
 * Attempts to parse the payload using either:
 * - New ServiceNowParser (multi-layer JSON parsing with advanced recovery)
 * - Legacy parseServiceNowPayload (best-effort sanitization and parsing)
 *
 * Both parsers handle common ServiceNow JSON issues like smart quotes,
 * control characters, missing commas, and truncated payloads.
 *
 * @param rawPayload - The raw request body string
 * @param useNewParser - Whether to use the new ServiceNowParser (default true)
 * @returns ParseResult with parsed data and metadata
 *
 * @example
 * const parseResult = parseWebhookPayload(payload, USE_NEW_PARSER);
 * if (!parseResult.success) {
 *   console.error('Parse failed:', parseResult.error);
 *   return buildErrorResponse({
 *     type: 'parse_error',
 *     message: parseResult.error?.message || 'Failed to parse payload',
 *     statusCode: 400
 *   });
 * }
 * const data = parseResult.data;
 */
export function parseWebhookPayload(
  rawPayload: string,
  useNewParser: boolean = true
): ParseResult {
  try {
    if (useNewParser) {
      // Use new ServiceNowParser with advanced JSON handling
      const parser = new ServiceNowParser();
      const parseResult = parser.parse(rawPayload);

      return {
        success: parseResult.success,
        data: parseResult.data,
        error: parseResult.error,
        metadata: {
          strategy: parseResult.strategy,
          warnings: parseResult.warnings,
          originalLength: parseResult.metadata.originalLength,
          sanitizedLength: parseResult.metadata.sanitizedLength,
          processingTimeMs: parseResult.metadata.processingTimeMs,
        },
      };
    } else {
      // Use legacy parser
      const parsedData = parseServiceNowPayload(rawPayload);
      return {
        success: true,
        data: parsedData,
        metadata: {
          strategy: 'legacy-parser',
          originalLength: rawPayload.length,
        },
      };
    }
  } catch (error) {
    const err = error as Error;
    const errorDetails: Record<string, any> = {
      message: err.message,
      payloadLength: rawPayload.length,
    };

    // Extract position information from error message if available
    const positionMatch = err.message.match(/position (\d+)/);
    if (positionMatch) {
      errorDetails.errorPosition = parseInt(positionMatch[1], 10);
      errorDetails.hint = 'Check the JSON syntax around the specified position';
    }

    return {
      success: false,
      error: err,
      metadata: {
        strategy: useNewParser ? 'new-parser' : 'legacy-parser',
        originalLength: rawPayload.length,
      },
    };
  }
}

/**
 * Validate webhook payload against ServiceNow case webhook schema
 *
 * Uses Zod schema validation to ensure the parsed data matches the
 * expected ServiceNow webhook structure. This validation step ensures
 * the data is safe for downstream processing.
 *
 * @param data - The parsed webhook data to validate
 * @returns ValidationResult with validated data or detailed errors
 *
 * @example
 * const validationResult = validateServiceNowWebhook(data);
 * if (!validationResult.success) {
 *   return buildErrorResponse({
 *     type: 'validation_error',
 *     message: 'Invalid webhook payload schema',
 *     details: validationResult.errors,
 *     statusCode: 422
 *   });
 * }
 * const webhookData: ServiceNowCaseWebhook = validationResult.data!;
 */
export function validateWebhook(data: unknown): ValidationResult {
  const result = validateServiceNowWebhook(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.errors?.map(e => e.message) || ['Validation failed'],
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Build a success response for synchronously processed cases
 *
 * Formats the triage result into the expected webhook response structure,
 * including classification details, similar cases, KB articles, and any
 * ITSM record creation/catalog redirect information.
 *
 * @param triageResult - The case triage result from the triage service
 * @returns Response object with 200 status and formatted JSON body
 *
 * @example
 * const triageResult = await caseTriageService.triageCase(webhookData, options);
 * return buildTriageSuccessResponse(triageResult);
 */
export function buildTriageSuccessResponse(triageResult: any): Response {
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
}

/**
 * Build a 202 Accepted response for asynchronously queued cases
 *
 * Returns immediately when a case is successfully enqueued to QStash
 * for async processing. The case will be processed by the worker endpoint
 * and results will be written back to ServiceNow.
 *
 * @param caseNumber - The ServiceNow case number that was queued
 * @returns Response object with 202 status indicating accepted for processing
 *
 * @example
 * await qstashClient.publishJSON({ url: workerUrl, body: webhookData });
 * return buildQueuedResponse(webhookData.case_number);
 */
export function buildQueuedResponse(caseNumber: string): Response {
  return Response.json({
    success: true,
    queued: true,
    case_number: caseNumber,
    message: 'Case queued for async processing',
  }, { status: 202 });
}

/**
 * Build a standardized error response for webhook failures
 *
 * Formats error responses with appropriate HTTP status codes and detailed
 * error information for debugging. Supports different error types:
 * - parse_error: JSON parsing failed (400 Bad Request)
 * - validation_error: Schema validation failed (422 Unprocessable Entity)
 * - authentication_error: Authentication failed (401 Unauthorized)
 * - internal_error: Unexpected server error (500 Internal Server Error)
 *
 * @param error - WebhookError object with type, message, and optional details
 * @returns Response object with error details and appropriate status code
 *
 * @example
 * return buildErrorResponse({
 *   type: 'parse_error',
 *   message: 'Invalid JSON payload',
 *   details: { errorPosition: 125, hint: 'Check position 125' },
 *   statusCode: 400
 * });
 */
export function buildErrorResponse(error: WebhookError): Response {
  const statusCode = error.statusCode || 500;

  return Response.json(
    {
      error: error.message,
      type: error.type,
      ...(error.details && { details: error.details }),
    },
    { status: statusCode }
  );
}
