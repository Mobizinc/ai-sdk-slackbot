/**
 * Case Triage Retrieval
 *
 * Data gathering operations for enriching classification context.
 */

import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { ServiceNowContext } from "../../infrastructure/servicenow-context";
import type { RetrievalResult } from "./types";
import { CATEGORIES_MAX_AGE_HOURS, APPLICATION_SERVICES_LIMIT } from "./constants";

export interface CategorySyncService {
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
 * @param categorySyncService - Category sync service instance
 * @param maxAgeHours - Maximum age for cached categories
 * @returns Categories data with fetch timing
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
 * @param webhook - ServiceNow case webhook
 * @param snContext - ServiceNow context for API calls
 * @returns Application services with fetch timing
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
 * @param webhook - ServiceNow case webhook
 * @param categorySyncService - Category sync service
 * @param snContext - ServiceNow context
 * @returns Complete retrieval result with categories and application services
 */
export async function enrichClassificationContext(
  webhook: ServiceNowCaseWebhook,
  categorySyncService: CategorySyncService,
  snContext: ServiceNowContext
): Promise<RetrievalResult> {
  const categoriesResult = await fetchCategories(categorySyncService);
  const applicationsResult = await fetchApplicationServices(webhook, snContext);

  return {
    categories: {
      data: categoriesResult.data,
      fetchTimeMs: categoriesResult.fetchTimeMs,
    },
    applicationServices: applicationsResult.services,
    applicationsFetchTimeMs: applicationsResult.fetchTimeMs,
  };
}
