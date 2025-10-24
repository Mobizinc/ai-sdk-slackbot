/**
 * Vercel Cron Job: Sync ServiceNow Categories
 * Runs every 12 hours to keep category cache fresh
 *
 * Schedule: 0 0,12 * * * (midnight and noon UTC)
 *
 * This prevents "Categories are STALE" warnings by ensuring:
 * - Case categories are synced
 * - Incident categories are synced (required for dual categorization)
 * - Problem categories are synced
 * - Change categories are synced
 */

import { getCategorySyncService } from '../../lib/services/servicenow-category-sync';

type JsonBody =
  | { status: 'ok'; message: string; stats: any }
  | { status: 'error'; message: string };

function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

async function runSync(): Promise<Response> {
  const startTime = Date.now();

  try {
    console.log('[Cron] Starting ServiceNow category sync for all ITSM tables...');

    const syncService = getCategorySyncService();
    const result = await syncService.syncAllITSMTables();

    // Calculate totals
    const totalAdded =
      result.cases.categories.choicesAdded +
      result.cases.subcategories.choicesAdded +
      result.incidents.categories.choicesAdded +
      result.incidents.subcategories.choicesAdded +
      result.problems.categories.choicesAdded +
      result.problems.subcategories.choicesAdded +
      result.changes.categories.choicesAdded +
      result.changes.subcategories.choicesAdded;

    const totalUpdated =
      result.cases.categories.choicesUpdated +
      result.cases.subcategories.choicesUpdated +
      result.incidents.categories.choicesUpdated +
      result.incidents.subcategories.choicesUpdated +
      result.problems.categories.choicesUpdated +
      result.problems.subcategories.choicesUpdated +
      result.changes.categories.choicesUpdated +
      result.changes.subcategories.choicesUpdated;

    const duration = Date.now() - startTime;

    console.log(
      `[Cron] Category sync completed: ${totalAdded} added, ${totalUpdated} updated in ${duration}ms`
    );

    return jsonResponse({
      status: 'ok',
      message: 'Category sync completed successfully',
      stats: {
        totalAdded,
        totalUpdated,
        durationMs: duration,
        tables: {
          cases: {
            categories: result.cases.categories.choicesFetched,
            subcategories: result.cases.subcategories.choicesFetched,
          },
          incidents: {
            categories: result.incidents.categories.choicesFetched,
            subcategories: result.incidents.subcategories.choicesFetched,
          },
          problems: {
            categories: result.problems.categories.choicesFetched,
            subcategories: result.problems.subcategories.choicesFetched,
          },
          changes: {
            categories: result.changes.categories.choicesFetched,
            subcategories: result.changes.subcategories.choicesFetched,
          },
        },
      },
    });
  } catch (error) {
    console.error('[Cron] Category sync failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ status: 'error', message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runSync();
}

export async function POST(): Promise<Response> {
  return runSync();
}
