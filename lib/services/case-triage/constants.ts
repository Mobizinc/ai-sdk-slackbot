/**
 * Case Triage Constants
 *
 * Configuration values, magic numbers, and default settings for the case triage system.
 */

import type { CaseTriageOptions } from "./types";

/**
 * Time window (in minutes) for idempotency check
 * Prevents duplicate classification from webhook retries
 */
export const IDEMPOTENCY_WINDOW_MINUTES = 5;

/**
 * Maximum age (in hours) for cached categories before refetch
 */
export const CATEGORIES_MAX_AGE_HOURS = 13;

/**
 * Maximum number of application services to fetch
 */
export const APPLICATION_SERVICES_LIMIT = 100;

/**
 * Cost per 1,000 prompt tokens (in USD)
 */
export const COST_PER_1K_PROMPT_TOKENS = 0.003;

/**
 * Cost per 1,000 completion tokens (in USD)
 */
export const COST_PER_1K_COMPLETION_TOKENS = 0.004;

/**
 * Default cache hit rate for statistics (placeholder)
 */
export const DEFAULT_CACHE_HIT_RATE = 0.15;

/**
 * Default number of days for triage statistics
 */
export const DEFAULT_STATS_DAYS = 7;

/**
 * Full classification configuration derived from options and global config
 */
export interface ClassificationConfig {
  enableCaching: boolean;
  enableSimilarCases: boolean;
  enableKBArticles: boolean;
  enableBusinessContext: boolean;
  enableWorkflowRouting: boolean;
  writeToServiceNow: boolean;
  enableCatalogRedirect: boolean;
  cmdbReconciliationEnabled: boolean;
  maxRetries: number;
}

/**
 * Convert partial options to full config with defaults from global config
 */
export function getClassificationConfig(
  options: CaseTriageOptions = {},
  globalConfig: any
): ClassificationConfig {
  return {
    enableCaching: options.enableCaching ?? true,
    enableSimilarCases: options.enableSimilarCases ?? true,
    enableKBArticles: options.enableKBArticles ?? true,
    enableBusinessContext: options.enableBusinessContext ?? true,
    enableWorkflowRouting: options.enableWorkflowRouting ?? true,
    writeToServiceNow: options.writeToServiceNow ?? false,
    enableCatalogRedirect: options.enableCatalogRedirect ?? globalConfig.catalogRedirectEnabled ?? true,
    cmdbReconciliationEnabled: options.cmdbReconciliationEnabled ?? globalConfig.cmdbReconciliationEnabled ?? false,
    maxRetries: options.maxRetries ?? globalConfig.caseClassificationMaxRetries ?? 3,
  };
}
