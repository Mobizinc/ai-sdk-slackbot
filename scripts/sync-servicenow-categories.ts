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

  console.log('🔄 ServiceNow Category Sync');
  console.log('============================\n');

  const syncService = getCategorySyncService();
  const tableName = process.env.SERVICENOW_CASE_TABLE || 'sn_customerservice_case';

  console.log(`Table: ${tableName}`);
  console.log(`Elements: category, subcategory\n`);

  try {
    // Sync both categories and subcategories
    const result = await syncService.syncAllCaseChoices(tableName);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SYNC RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Categories
    console.log('CATEGORIES:');
    console.log(`  Status: ${result.categories.status}`);
    console.log(`  Fetched: ${result.categories.choicesFetched}`);
    console.log(`  Added: ${result.categories.choicesAdded}`);
    console.log(`  Updated: ${result.categories.choicesUpdated}`);
    console.log(`  Removed: ${result.categories.choicesRemoved}`);
    if (result.categories.errorMessage) {
      console.log(`  Error: ${result.categories.errorMessage}`);
    }
    console.log('');

    // Subcategories
    console.log('SUBCATEGORIES:');
    console.log(`  Status: ${result.subcategories.status}`);
    console.log(`  Fetched: ${result.subcategories.choicesFetched}`);
    console.log(`  Added: ${result.subcategories.choicesAdded}`);
    console.log(`  Updated: ${result.subcategories.choicesUpdated}`);
    console.log(`  Removed: ${result.subcategories.choicesRemoved}`);
    if (result.subcategories.errorMessage) {
      console.log(`  Error: ${result.subcategories.errorMessage}`);
    }
    console.log('');

    if (result.categories.status === 'success' && result.subcategories.status === 'success') {
      console.log('✅ Sync completed successfully');
      console.log(`   Total duration: ${Date.now() - startTime}ms`);
      process.exit(0);
    } else {
      console.log('❌ Sync completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Sync failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

syncCategories();
