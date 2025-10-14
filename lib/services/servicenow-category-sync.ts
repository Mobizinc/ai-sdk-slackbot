/**
 * ServiceNow Category Synchronization Service
 * Syncs category and subcategory choice lists from ServiceNow to local database cache
 *
 * Original: api/app/services/servicenow_category_sync.py
 *
 * Purpose:
 * - Eliminates real-time API calls during classification (faster, more reliable)
 * - Keeps category list up-to-date with ServiceNow (syncs every 12 hours)
 * - Maps ServiceNow values (12, 15) to labels ("Hardware issue", "Networking")
 * - Provides fallback if ServiceNow API is unavailable
 */

import { getCategoryCacheRepository, type CachedChoice } from "../db/repositories/category-cache-repository";

export interface CategorySyncResult {
  status: "success" | "failed";
  syncId: number;
  tableName: string;
  element: string;
  choicesFetched: number;
  choicesAdded: number;
  choicesUpdated: number;
  choicesRemoved: number;
  startedAt: Date;
  completedAt: Date;
  errorMessage?: string;
}

export class ServiceNowCategorySyncService {
  private repository = getCategoryCacheRepository();

  /**
   * Sync categories or subcategories from ServiceNow to database
   *
   * Original: api/app/services/servicenow_category_sync.py:25-289
   */
  async syncCategories(
    tableName: string = "sn_customerservice_case",
    element: string = "category"
  ): Promise<CategorySyncResult> {
    const startedAt = new Date();
    let syncId = 0;

    try {
      // Create sync log entry
      syncId = await this.repository.createSyncLog({
        tableName,
        element,
        startedAtUtc: startedAt,
        status: "running",
      });

      console.log(`[Category Sync] Starting sync for ${tableName}.${element} (sync_id: ${syncId})`);

      // Import ServiceNow client dynamically to ensure env vars are loaded
      const { serviceNowClient } = await import("../tools/servicenow");

      // Fetch choices from ServiceNow
      const choices = await serviceNowClient.getChoiceList({
        table: tableName,
        element,
        includeInactive: false,
      });

      const choicesFetched = choices.length;
      console.log(`[Category Sync] Fetched ${choicesFetched} choices from ServiceNow`);

      // Get existing choices from database
      const existing = await this.repository.getCachedCategories(tableName, element, 999999); // Get all, ignore staleness

      const existingMap = new Map<string, CachedChoice>();
      existing.forEach((choice) => {
        const key = `${choice.value}:${choice.dependentValue || ""}`;
        existingMap.set(key, choice);
      });

      let choicesAdded = 0;
      let choicesUpdated = 0;
      const processedKeys = new Set<string>();

      // Process each choice from ServiceNow
      for (const choice of choices) {
        const key = `${choice.value}:${choice.dependent_value || ""}`;
        processedKeys.add(key);

        const existingChoice = existingMap.get(key);

        if (existingChoice) {
          // Check if update needed
          if (
            existingChoice.label !== choice.label ||
            existingChoice.sequence !== choice.sequence
          ) {
            await this.repository.upsertChoice({
              tableName,
              element,
              value: choice.value,
              label: choice.label,
              sequence: choice.sequence,
              dependentValue: choice.dependent_value || null,
            });
            choicesUpdated++;
            console.log(
              `[Category Sync] Updated: ${choice.value} -> ${choice.label}`
            );
          } else {
            // Just update sync timestamp
            await this.repository.upsertChoice({
              tableName,
              element,
              value: choice.value,
              label: choice.label,
              sequence: choice.sequence,
              dependentValue: choice.dependent_value || null,
            });
          }
        } else {
          // Insert new choice
          await this.repository.upsertChoice({
            tableName,
            element,
            value: choice.value,
            label: choice.label,
            sequence: choice.sequence,
            dependentValue: choice.dependent_value || null,
          });
          choicesAdded++;
          console.log(`[Category Sync] Added: ${choice.value} -> ${choice.label}`);
        }
      }

      // Mark choices as inactive if they're in database but not in ServiceNow
      let choicesRemoved = 0;
      for (const [key, existingChoice] of existingMap.entries()) {
        if (!processedKeys.has(key)) {
          // This choice was removed from ServiceNow
          // We'll handle this by staleness for now
          // Full implementation would mark as inactive
          choicesRemoved++;
        }
      }

      const completedAt = new Date();

      // Update sync log with success
      await this.repository.updateSyncLog(syncId, {
        completedAtUtc: completedAt,
        status: "success",
        choicesFetched,
        choicesAdded,
        choicesUpdated,
        choicesRemoved,
      });

      console.log(
        `[Category Sync] Completed: ${choicesAdded} added, ${choicesUpdated} updated, ${choicesRemoved} removed`
      );

      return {
        status: "success",
        syncId,
        tableName,
        element,
        choicesFetched,
        choicesAdded,
        choicesUpdated,
        choicesRemoved,
        startedAt,
        completedAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Category Sync] Failed for ${tableName}.${element}:`, error);

      // Update sync log with failure
      if (syncId) {
        await this.repository.updateSyncLog(syncId, {
          completedAtUtc: new Date(),
          status: "failed",
          errorMessage,
        });
      }

      return {
        status: "failed",
        syncId,
        tableName,
        element,
        choicesFetched: 0,
        choicesAdded: 0,
        choicesUpdated: 0,
        choicesRemoved: 0,
        startedAt,
        completedAt: new Date(),
        errorMessage,
      };
    }
  }

  /**
   * Sync both categories and subcategories for cases
   *
   * Original: api/app/services/servicenow_category_sync.py:290-316
   */
  async syncAllCaseChoices(tableName: string = "sn_customerservice_case"): Promise<{
    categories: CategorySyncResult;
    subcategories: CategorySyncResult;
  }> {
    console.log(`[Category Sync] Starting full case choice sync for ${tableName}...`);

    // Sync categories
    const categoryResult = await this.syncCategories(tableName, "category");

    // Sync subcategories
    const subcategoryResult = await this.syncCategories(tableName, "subcategory");

    console.log(`[Category Sync] Full case choice sync completed`);

    return {
      categories: categoryResult,
      subcategories: subcategoryResult,
    };
  }

  /**
   * Sync all ITSM record types (Cases, Incidents, Changes, Problems)
   * Ensures consistent categories across all ServiceNow ITSM tables
   */
  async syncAllITSMTables(): Promise<{
    cases: { categories: CategorySyncResult; subcategories: CategorySyncResult };
    incidents: { categories: CategorySyncResult; subcategories: CategorySyncResult };
    changes: { categories: CategorySyncResult; subcategories: CategorySyncResult };
    problems: { categories: CategorySyncResult; subcategories: CategorySyncResult };
  }> {
    console.log('[Category Sync] Starting full ITSM category sync (Cases, Incidents, Changes, Problems)...');

    const results = {
      cases: await this.syncAllCaseChoices('sn_customerservice_case'),
      incidents: await this.syncAllCaseChoices('incident'),
      changes: await this.syncAllCaseChoices('change_request'),
      problems: await this.syncAllCaseChoices('problem'),
    };

    const totalAdded =
      results.cases.categories.choicesAdded +
      results.cases.subcategories.choicesAdded +
      results.incidents.categories.choicesAdded +
      results.incidents.subcategories.choicesAdded +
      results.changes.categories.choicesAdded +
      results.changes.subcategories.choicesAdded +
      results.problems.categories.choicesAdded +
      results.problems.subcategories.choicesAdded;

    const totalUpdated =
      results.cases.categories.choicesUpdated +
      results.cases.subcategories.choicesUpdated +
      results.incidents.categories.choicesUpdated +
      results.incidents.subcategories.choicesUpdated +
      results.changes.categories.choicesUpdated +
      results.changes.subcategories.choicesUpdated +
      results.problems.categories.choicesUpdated +
      results.problems.subcategories.choicesUpdated;

    console.log(
      `[Category Sync] Full ITSM sync completed: ${totalAdded} added, ${totalUpdated} updated`
    );

    return results;
  }

  /**
   * Get categories for classifier use (TABLE-SPECIFIC for dual categorization)
   *
   * Returns separate category lists for Cases and Incidents
   * This allows AI to suggest correct categories for each record type
   */
  async getCategoriesForClassifier(
    maxAgeHours: number = 13
  ): Promise<{
    caseCategories: string[];
    caseSubcategories: string[];
    incidentCategories: string[];
    incidentSubcategories: string[];
    isStale: boolean;
    tablesCovered: string[];
  }> {
    try {
      const caseTable = 'sn_customerservice_case';
      const incidentTable = 'incident';

      // Fetch Case categories
      const caseCategoryChoices = await this.repository.getCachedCategories(
        caseTable,
        'category',
        maxAgeHours
      );
      const caseSubcategoryChoices = await this.repository.getCachedCategories(
        caseTable,
        'subcategory',
        maxAgeHours
      );

      // Fetch Incident categories
      const incidentCategoryChoices = await this.repository.getCachedCategories(
        incidentTable,
        'category',
        maxAgeHours
      );
      const incidentSubcategoryChoices = await this.repository.getCachedCategories(
        incidentTable,
        'subcategory',
        maxAgeHours
      );

      const caseCategories = caseCategoryChoices.map(c => c.label).sort();
      const caseSubcategories = caseSubcategoryChoices.map(c => c.label).sort();
      const incidentCategories = incidentCategoryChoices.map(c => c.label).sort();
      const incidentSubcategories = incidentSubcategoryChoices.map(c => c.label).sort();

      // Check staleness
      const isStale =
        caseCategoryChoices.length === 0 ||
        incidentCategoryChoices.length === 0 ||
        caseCategoryChoices.some((c) => c.isStale) ||
        caseSubcategoryChoices.some((c) => c.isStale) ||
        incidentCategoryChoices.some((c) => c.isStale) ||
        incidentSubcategoryChoices.some((c) => c.isStale);

      const tablesCovered: string[] = [];
      if (caseCategoryChoices.length > 0) tablesCovered.push(caseTable);
      if (incidentCategoryChoices.length > 0) tablesCovered.push(incidentTable);

      if (isStale) {
        console.warn(
          `[Category Sync] Categories are STALE (last sync > ${maxAgeHours}h ago). Consider running sync.`
        );
      }

      console.log(
        `[Category Sync] Loaded categories: ` +
        `Cases (${caseCategories.length} categories, ${caseSubcategories.length} subcategories), ` +
        `Incidents (${incidentCategories.length} categories, ${incidentSubcategories.length} subcategories)`
      );

      return {
        caseCategories,
        caseSubcategories,
        incidentCategories,
        incidentSubcategories,
        isStale,
        tablesCovered,
      };
    } catch (error) {
      console.error(`[Category Sync] Error getting categories for classifier:`, error);
      return {
        caseCategories: [],
        caseSubcategories: [],
        incidentCategories: [],
        incidentSubcategories: [],
        isStale: true,
        tablesCovered: [],
      };
    }
  }
}

// Singleton
let service: ServiceNowCategorySyncService | null = null;

export function getCategorySyncService(): ServiceNowCategorySyncService {
  if (!service) {
    service = new ServiceNowCategorySyncService();
  }
  return service;
}
