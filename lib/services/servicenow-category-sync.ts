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
   * Get categories for classifier use (MERGED from all ITSM tables)
   *
   * Returns category labels from Cases, Incidents, Changes, and Problems
   * This ensures the AI has access to ALL valid categories across ITSM
   */
  async getCategoriesForClassifier(
    maxAgeHours: number = 13
  ): Promise<{
    categories: string[];
    subcategories: string[];
    isStale: boolean;
    tablesCovered: string[];
  }> {
    try {
      const tables = ['sn_customerservice_case', 'incident', 'change_request', 'problem'];
      const allCategories = new Set<string>();
      const allSubcategories = new Set<string>();
      let isStale = false;
      const tablesCovered: string[] = [];

      // Merge categories from all 4 ITSM tables
      for (const table of tables) {
        const categoryChoices = await this.repository.getCachedCategories(
          table,
          'category',
          maxAgeHours
        );

        const subcategoryChoices = await this.repository.getCachedCategories(
          table,
          'subcategory',
          maxAgeHours
        );

        // Add to merged set
        categoryChoices.forEach((c) => allCategories.add(c.label));
        subcategoryChoices.forEach((c) => allSubcategories.add(c.label));

        // Track which tables contributed
        if (categoryChoices.length > 0) {
          tablesCovered.push(table);
        }

        // Check staleness
        if (
          categoryChoices.length === 0 ||
          categoryChoices.some((c) => c.isStale) ||
          subcategoryChoices.some((c) => c.isStale)
        ) {
          isStale = true;
        }
      }

      const categories = Array.from(allCategories).sort();
      const subcategories = Array.from(allSubcategories).sort();

      if (isStale) {
        console.warn(
          `[Category Sync] Categories are STALE (last sync > ${maxAgeHours}h ago). Consider running sync.`
        );
      }

      console.log(
        `[Category Sync] Loaded ${categories.length} unique categories, ` +
        `${subcategories.length} unique subcategories from ${tablesCovered.length}/4 ITSM tables`
      );

      return {
        categories,
        subcategories,
        isStale,
        tablesCovered,
      };
    } catch (error) {
      console.error(`[Category Sync] Error getting categories for classifier:`, error);
      return {
        categories: [],
        subcategories: [],
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
