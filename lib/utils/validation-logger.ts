/**
 * Validation Logging and Monitoring Utilities
 *
 * Provides structured logging for response validation results
 * with support for alerting when validation issues occur.
 */

import type { ValidationResult } from "./response-validator";

export interface ValidationLogEntry {
  timestamp: string;
  sessionId?: string;
  channelId?: string;
  threadTs?: string;
  validationResult: ValidationResult;
  responsePreview: string;
  toolCallCount: number;
  environment?: string;
  responseType?: 'field_query' | 'overview' | 'unknown';
  responseLength?: number;
}

/**
 * Logs validation results with structured metadata for monitoring
 *
 * @param result - Validation result from response validator
 * @param context - Additional context about the request/response
 */
export function logValidationResult(
  result: ValidationResult,
  context: {
    response: string;
    toolCalls: Array<{ toolName: string; result: any }>;
    sessionId?: string;
    channelId?: string;
    threadTs?: string;
  }
): void {
  const entry: ValidationLogEntry = {
    timestamp: new Date().toISOString(),
    sessionId: context.sessionId,
    channelId: context.channelId,
    threadTs: context.threadTs,
    validationResult: result,
    responsePreview: context.response.substring(0, 200),
    toolCallCount: context.toolCalls.length,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    responseType: result.responseType,
    responseLength: result.responseLength,
  };

  // Log with appropriate level based on validation status
  if (!result.valid) {
    // Don't warn for field queries - they're expected to skip sections
    if (result.responseType === 'field_query') {
      console.log("[Validation Info - Field Query]", JSON.stringify(entry, null, 2));
    } else {
      console.warn("[Validation Warning]", JSON.stringify(entry, null, 2));
    }
  } else {
    console.log("[Validation Success]", JSON.stringify(entry, null, 2));
  }

  // In staging/production, we could send alerts for repeated failures
  if (!result.valid && shouldAlert(result)) {
    logValidationAlert(entry);
  }
}

/**
 * Determines if a validation failure warrants an alert
 * Currently alerts when multiple sections are missing or multiple tools have unused summaries
 *
 * Don't alert for field query responses - they're expected to be different
 */
function shouldAlert(result: ValidationResult): boolean {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV;

  // Only alert in staging/production
  if (!["preview", "production"].includes(environment || "")) {
    return false;
  }

  // Don't alert for field queries - they're expected to skip sections
  if (result.responseType === 'field_query') {
    return false;
  }

  // Alert if multiple critical issues
  const criticalIssues =
    result.missingElements.length + result.toolsWithUnusedSummaries.length;

  return criticalIssues >= 2;
}

/**
 * Logs a validation alert that could trigger external monitoring
 * In a production setup, this could post to Slack, send to monitoring service, etc.
 */
function logValidationAlert(entry: ValidationLogEntry): void {
  const { validationResult } = entry;

  const alertMessage = {
    level: "warning",
    title: "Response Validation Failure",
    environment: entry.environment,
    channel: entry.channelId,
    thread: entry.threadTs,
    missingElements: validationResult.missingElements,
    unusedSummaries: validationResult.toolsWithUnusedSummaries,
    warnings: validationResult.warnings,
    responsePreview: entry.responsePreview,
    timestamp: entry.timestamp,
  };

  // Log alert in a format that monitoring tools can pick up
  console.error("[VALIDATION_ALERT]", JSON.stringify(alertMessage));

  // Future: Post to Slack webhook, send to monitoring service, etc.
  // Example:
  // if (process.env.SLACK_MONITORING_WEBHOOK) {
  //   await fetch(process.env.SLACK_MONITORING_WEBHOOK, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       text: `⚠️ Validation Alert: ${validationResult.warnings.join(', ')}`,
  //       attachments: [{ text: JSON.stringify(alertMessage, null, 2) }]
  //     })
  //   });
  // }
}

/**
 * Aggregates validation metrics for monitoring dashboards
 * Returns summary statistics over a given time window
 */
export interface ValidationMetrics {
  totalValidations: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  commonMissingElements: Record<string, number>;
  commonUnusedTools: Record<string, number>;
  responseTypeBreakdown: {
    field_query: number;
    overview: number;
    unknown: number;
  };
  successRateByType: {
    field_query: number;
    overview: number;
    unknown: number;
  };
}

/**
 * In-memory storage for validation events (for development/testing)
 * In production, this would be replaced with a proper metrics store
 */
const validationEvents: ValidationLogEntry[] = [];

/**
 * Records a validation event for metrics aggregation
 * This is a simple in-memory implementation; production would use a metrics service
 */
export function recordValidationEvent(entry: ValidationLogEntry): void {
  validationEvents.push(entry);

  // Keep only last 1000 events in memory
  if (validationEvents.length > 1000) {
    validationEvents.shift();
  }
}

/**
 * Gets aggregated validation metrics
 * Useful for monitoring dashboards and health checks
 */
export function getValidationMetrics(): ValidationMetrics {
  const totalValidations = validationEvents.length;

  if (totalValidations === 0) {
    return {
      totalValidations: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      commonMissingElements: {},
      commonUnusedTools: {},
      responseTypeBreakdown: { field_query: 0, overview: 0, unknown: 0 },
      successRateByType: { field_query: 0, overview: 0, unknown: 0 },
    };
  }

  const successCount = validationEvents.filter((e) => e.validationResult.valid).length;
  const failureCount = totalValidations - successCount;

  const commonMissingElements: Record<string, number> = {};
  const commonUnusedTools: Record<string, number> = {};

  // Track response types
  const typeBreakdown = { field_query: 0, overview: 0, unknown: 0 };
  const typeSuccess = { field_query: 0, overview: 0, unknown: 0 };
  const typeTotal = { field_query: 0, overview: 0, unknown: 0 };

  for (const event of validationEvents) {
    // Count missing elements
    for (const element of event.validationResult.missingElements) {
      commonMissingElements[element] = (commonMissingElements[element] || 0) + 1;
    }

    // Count unused tools
    for (const tool of event.validationResult.toolsWithUnusedSummaries) {
      commonUnusedTools[tool] = (commonUnusedTools[tool] || 0) + 1;
    }

    // Track by response type
    const type = event.validationResult.responseType || 'unknown';
    typeBreakdown[type]++;
    typeTotal[type]++;
    if (event.validationResult.valid) {
      typeSuccess[type]++;
    }
  }

  return {
    totalValidations,
    successCount,
    failureCount,
    successRate: (successCount / totalValidations) * 100,
    commonMissingElements,
    commonUnusedTools,
    responseTypeBreakdown: typeBreakdown,
    successRateByType: {
      field_query: typeTotal.field_query > 0
        ? (typeSuccess.field_query / typeTotal.field_query) * 100
        : 0,
      overview: typeTotal.overview > 0
        ? (typeSuccess.overview / typeTotal.overview) * 100
        : 0,
      unknown: typeTotal.unknown > 0
        ? (typeSuccess.unknown / typeTotal.unknown) * 100
        : 0,
    },
  };
}

/**
 * Clears validation metrics (useful for testing)
 */
export function clearValidationMetrics(): void {
  validationEvents.length = 0;
}
