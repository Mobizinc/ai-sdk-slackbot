/**
 * Sync ServiceNow Categories Script
 * Fetches categories and subcategories from ServiceNow and caches them in database
 *
 * Run manually: npx tsx scripts/sync-servicenow-categories.ts
 * Or schedule via cron: 0 0,12 * * * (every 12 hours at midnight and noon)
 *
 * Original: api/app/services/servicenow_category_sync.py
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// CRITICAL: Load env vars and set SERVICENOW_INSTANCE_URL BEFORE any imports
config({ path: resolve(process.cwd(), '.env.local') });

if (!process.env.SERVICENOW_INSTANCE_URL && process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

// Now import after env is configured
import { getCategorySyncService } from '../lib/services/servicenow-category-sync';

async function syncCategories() {
  const startTime = Date.now();

  console.log('🔄 ServiceNow Category Sync - ALL ITSM Tables');
  console.log('===============================================\n');
  console.log('Syncing categories for: Cases, Incidents, Problems, Changes');
  console.log('This ensures dual categorization support and prevents stale warnings\n');

  const syncService = getCategorySyncService();

  try {
    // Sync ALL ITSM tables (Cases, Incidents, Problems, Changes)
    // This is required for dual categorization support
    const result = await syncService.syncAllITSMTables();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SYNC RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Helper function to print table results
    const printTableResults = (tableName: string, tableResult: typeof result.cases) => {
      console.log(`${tableName.toUpperCase()}:`);
      console.log(`  Categories:`);
      console.log(`    Status: ${tableResult.categories.status}`);
      console.log(`    Fetched: ${tableResult.categories.choicesFetched}, Added: ${tableResult.categories.choicesAdded}, Updated: ${tableResult.categories.choicesUpdated}`);
      if (tableResult.categories.errorMessage) {
        console.log(`    Error: ${tableResult.categories.errorMessage}`);
      }
      console.log(`  Subcategories:`);
      console.log(`    Status: ${tableResult.subcategories.status}`);
      console.log(`    Fetched: ${tableResult.subcategories.choicesFetched}, Added: ${tableResult.subcategories.choicesAdded}, Updated: ${tableResult.subcategories.choicesUpdated}`);
      if (tableResult.subcategories.errorMessage) {
        console.log(`    Error: ${tableResult.subcategories.errorMessage}`);
      }
      console.log('');
    };

    // Print results for each table
    printTableResults('Cases', result.cases);
    printTableResults('Incidents', result.incidents);
    printTableResults('Problems', result.problems);
    printTableResults('Changes', result.changes);

    // Calculate totals
    const allSuccessful =
      result.cases.categories.status === 'success' &&
      result.cases.subcategories.status === 'success' &&
      result.incidents.categories.status === 'success' &&
      result.incidents.subcategories.status === 'success' &&
      result.problems.categories.status === 'success' &&
      result.problems.subcategories.status === 'success' &&
      result.changes.categories.status === 'success' &&
      result.changes.subcategories.status === 'success';

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

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (allSuccessful) {
      console.log('✅ Sync completed successfully for all ITSM tables');
      console.log(`   Total added: ${totalAdded}, Total updated: ${totalUpdated}`);
      console.log(`   Total duration: ${Date.now() - startTime}ms`);
      process.exit(0);
    } else {
      console.log('⚠️  Sync completed with some errors');
      console.log(`   Total added: ${totalAdded}, Total updated: ${totalUpdated}`);
      console.log(`   Check errors above for details`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

syncCategories();
