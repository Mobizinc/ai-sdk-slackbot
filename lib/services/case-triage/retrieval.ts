/**
 * Case Triage Retrieval
 *
 * Data gathering operations for enriching classification context.
 * Fetches categories and application services to improve classification accuracy.
 *
 * **Data Sources:**
 * - ServiceNow categories (from DB cache, refreshed every 13 hours)
 * - Company-specific application services (from ServiceNow API)
 *
 * **Performance Optimization:**
 * - Uses parallel fetching (Promise.all) for concurrent data retrieval
 * - Categories + app services fetched simultaneously
 * - Typical latency: ~100-200ms (vs ~200-300ms sequential)
 *
 * @module case-triage/retrieval
 *
 * @example
 * ```typescript
 * const result = await enrichClassificationContext(
 *   webhook,
 *   categorySyncService,
 *   snContext
 * );
 *
 * // Use retrieved data for classification
 * classifier.setCategories(
 *   result.categories.data.caseCategories,
 *   result.categories.data.incidentCategories,
 *   // ...
 * );
 * classifier.setApplicationServices(result.applicationServices);
 * ```
 */

import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { ServiceNowContext } from "../../infrastructure/servicenow-context";
import type { RetrievalResult } from "./types";
import { CATEGORIES_MAX_AGE_HOURS, APPLICATION_SERVICES_LIMIT } from "./constants";

/**
 * Category sync service interface
 *
 * Provides access to cached ServiceNow categories for case and incident tables.
 * Categories are synced periodically via cron job.
 */
export interface CategorySyncService {
  /**
   * Get categories from database cache
   *
   * @param maxAgeHours - Maximum age for cached categories before considered stale
   * @returns Categories data with staleness indicator
   */
  getCategoriesForClassifier(maxAgeHours: number): Promise<{
    caseCategories: any[];
    incidentCategories: any[];
    caseSubcategories: any[];
    incidentSubcategories: any[];
    tablesCovered: string[];
    isStale: boolean;
  }>;
}

/**
 * Fetch ServiceNow categories from database cache
 *
 * Retrieves categories for both Case and Incident tables to support
 * dual categorization (different categories when creating Incident from Case).
 *
 * **Data Source:** Database cache (synced via cron job)
 * **Default Max Age:** 13 hours
 * **Staleness Warning:** Logged if categories older than max age
 *
 * @param categorySyncService - Category sync service instance
 * @param maxAgeHours - Maximum age for cached categories (default: 13)
 * @returns Categories data with fetch timing in milliseconds
 *
 * @example
 * ```typescript
 * const result = await fetchCategories(categorySyncService);
 *
 * console.log(`Fetched in ${result.fetchTimeMs}ms`);
 * console.log(`Case categories: ${result.data.caseCategories.length}`);
 * console.log(`Incident categories: ${result.data.incidentCategories.length}`);
 *
 * if (result.data.isStale) {
 *   console.warn("Categories are stale - run sync job");
 * }
 * ```
 *
 * **Performance:** Typically 50-100ms (DB query from cache)
 */
export async function fetchCategories(
  categorySyncService: CategorySyncService,
  maxAgeHours: number = CATEGORIES_MAX_AGE_HOURS
): Promise<{ data: any; fetchTimeMs: number }> {
  const start = Date.now();

  const categoriesData = await categorySyncService.getCategoriesForClassifier(maxAgeHours);

  const fetchTimeMs = Date.now() - start;

  if (categoriesData.isStale) {
    console.warn('[Case Triage Retrieval] Categories are stale - consider running sync');
  }

  console.log(
    `[Case Triage Retrieval] Using categories from ${categoriesData.tablesCovered.length}/2 ITSM tables: ` +
    `Cases (${categoriesData.caseCategories.length} categories), ` +
    `Incidents (${categoriesData.incidentCategories.length} categories) (${fetchTimeMs}ms)`
  );

  return {
    data: categoriesData,
    fetchTimeMs,
  };
}

/**
 * Fetch company-specific application services for classification
 *
 * Retrieves the list of applications managed by a company to improve
 * application-specific issue classification.
 *
 * **Data Source:** ServiceNow Application Service table (live API call)
 * **Scope:** Parent "Application Administration" services only
 * **Limit:** 100 services per company (configurable)
 *
 * **Fallback Behavior:**
 * - No company sys_id → Returns empty array (uses generic prompt)
 * - API error → Returns empty array (classification continues)
 * - No services found → Returns empty array with warning log
 *
 * @param webhook - ServiceNow case webhook with company information
 * @param snContext - ServiceNow context for API authentication/routing
 * @returns Application services array with fetch timing
 *
 * @example
 * ```typescript
 * const result = await fetchApplicationServices(webhook, snContext);
 *
 * if (result.services.length > 0) {
 *   console.log(`Found ${result.services.length} apps in ${result.fetchTimeMs}ms`);
 *   classifier.setApplicationServices(result.services);
 * } else {
 *   console.log("Using generic application list");
 * }
 * ```
 *
 * **Performance:** Typically 100-200ms (ServiceNow API call)
 */
export async function fetchApplicationServices(
  webhook: ServiceNowCaseWebhook,
  snContext: ServiceNowContext
): Promise<{ services: any[]; fetchTimeMs: number }> {
  if (!webhook.company) {
    console.log(
      `[Case Triage Retrieval] No company sys_id available - using generic application list`
    );
    return { services: [], fetchTimeMs: 0 };
  }

  try {
    const { serviceNowClient } = await import("../../tools/servicenow");
    const start = Date.now();

    const companyApplications = await serviceNowClient.getApplicationServicesForCompany(
      {
        companySysId: webhook.company,
        parentServiceOffering: "Application Administration",
        limit: APPLICATION_SERVICES_LIMIT,
      },
      snContext,
    );

    const fetchTimeMs = Date.now() - start;

    if (companyApplications.length > 0) {
      console.log(
        `[Case Triage Retrieval] Loaded ${companyApplications.length} application services ` +
        `for company ${webhook.account_id || webhook.company} (${fetchTimeMs}ms)`
      );
    } else {
      console.log(
        `[Case Triage Retrieval] No application services found for company ${webhook.account_id || webhook.company} ` +
        `- using generic application list in prompt`
      );
    }

    return {
      services: companyApplications,
      fetchTimeMs,
    };
  } catch (error) {
    console.warn(
      `[Case Triage Retrieval] Failed to fetch application services for company ${webhook.company}:`,
      error
    );
    // Continue with classification - classifier will use generic fallback
    return { services: [], fetchTimeMs: 0 };
  }
}

/**
 * Enrich classification context by fetching all necessary data
 *
 * Unified wrapper that fetches both categories and application services
 * for classification enrichment.
 *
 * **What It Fetches:**
 * 1. ServiceNow categories (Case + Incident tables)
 * 2. Company-specific application services (if company sys_id present)
 *
 * **Implementation:** Parallel fetching with Promise.all()
 * **Optimization:** Both operations run concurrently for 40-50% faster retrieval
 *
 * @param webhook - ServiceNow case webhook with company and routing info
 * @param categorySyncService - Service for accessing category cache
 * @param snContext - ServiceNow context for API calls
 * @returns Complete retrieval result with timing metrics
 *
 * @example
 * ```typescript
 * const enrichment = await enrichClassificationContext(
 *   webhook,
 *   categorySyncService,
 *   snContext
 * );
 *
 * console.log(`Categories fetched in ${enrichment.categories.fetchTimeMs}ms`);
 * console.log(`Applications fetched in ${enrichment.applicationsFetchTimeMs}ms`);
 * console.log(`Total applications: ${enrichment.applicationServices.length}`);
 * ```
 *
 * **Performance:**
 * - Current (sequential): ~150-300ms
 * - Optimized (parallel): ~100-200ms (if both succeed)
 */
export async function enrichClassificationContext(
  webhook: ServiceNowCaseWebhook,
  categorySyncService: CategorySyncService,
  snContext: ServiceNowContext
): Promise<RetrievalResult> {
  // Parallel fetching optimization - fetch categories and app services concurrently
  const [categoriesResult, applicationsResult] = await Promise.all([
    fetchCategories(categorySyncService),
    fetchApplicationServices(webhook, snContext),
  ]);

  return {
    categories: {
      data: categoriesResult.data,
      fetchTimeMs: categoriesResult.fetchTimeMs,
    },
    applicationServices: applicationsResult.services,
    applicationsFetchTimeMs: applicationsResult.fetchTimeMs,
  };
}
