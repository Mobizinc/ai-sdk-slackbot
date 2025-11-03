/**
 * Case Triage Constants
 *
 * Configuration values, magic numbers, and default settings for the case triage system.
 *
 * **Categories:**
 * - **Timing:** Idempotency windows, cache TTLs, staleness thresholds
 * - **Limits:** Service counts, entity value lengths
 * - **Costs:** Token pricing for cost calculation
 * - **Statistics:** Default values for metrics
 * - **Mappings:** Entity type translations
 *
 * **Usage:**
 * - Import specific constants as needed
 * - Use getClassificationConfig() for runtime configuration
 * - All timing values are well-tested in production
 *
 * @module case-triage/constants
 *
 * @example
 * ```typescript
 * import {
 *   IDEMPOTENCY_WINDOW_MINUTES,
 *   ENTITY_TYPE_MAPPING,
 *   getClassificationConfig
 * } from './constants';
 *
 * // Check if within idempotency window
 * if (ageMinutes < IDEMPOTENCY_WINDOW_MINUTES) {
 *   return cachedResult;
 * }
 *
 * // Map entity types
 * const dbType = ENTITY_TYPE_MAPPING['ip_addresses']; // "IP_ADDRESS"
 *
 * // Get full config
 * const config = getClassificationConfig(options, globalConfig);
 * ```
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
 * Entity type mapping for technical entities discovered by LLM
 *
 * Maps from classification field names to database enum values.
 */
export const ENTITY_TYPE_MAPPING: Record<string, string> = {
  ip_addresses: "IP_ADDRESS",
  systems: "SYSTEM",
  users: "USER",
  software: "SOFTWARE",
  error_codes: "ERROR_CODE",
  network_devices: "NETWORK_DEVICE",
};

/**
 * Maximum length for entity values (DB column limit)
 */
export const ENTITY_VALUE_MAX_LENGTH = 500;

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
 *
 * Merges user-provided options with global configuration defaults to create
 * a complete ClassificationConfig with all feature flags resolved.
 *
 * **Default Behavior:**
 * - Most features enabled by default (caching, similar cases, KB articles, etc.)
 * - writeToServiceNow defaults to FALSE (explicit opt-in)
 * - Catalog redirect and CMDB reconciliation use global config defaults
 *
 * @param options - Partial options from caller (API, webhook, agent)
 * @param globalConfig - Global application configuration
 * @returns Complete configuration with all flags resolved
 *
 * @example
 * ```typescript
 * // API call with custom options
 * const config = getClassificationConfig({
 *   writeToServiceNow: true,
 *   maxRetries: 5
 * }, globalConfig);
 *
 * // config.enableCaching = true (default)
 * // config.writeToServiceNow = true (override)
 * // config.maxRetries = 5 (override)
 * ```
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
