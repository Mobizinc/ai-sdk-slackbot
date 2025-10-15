/**
 * Trace ServiceNow Request Item (RITM) to discover catalog item
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/trace-request-item.ts RITM0045949
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function traceRequestItem() {
  const ritmNumber = process.argv[2];

  if (!ritmNumber) {
    console.error('❌ Error: RITM number is required');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx --env-file=.env.local scripts/trace-request-item.ts RITM0045949');
    process.exit(1);
  }

  console.log('🔍 Tracing ServiceNow Request Item');
  console.log('');

  // Check ServiceNow configuration
  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client is not properly configured');
    console.error('   Please check your .env.local file');
    process.exit(1);
  }

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 STEP 1: Query Request Item ${ritmNumber}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const requestItem = await serviceNowClient.getRequestItem(ritmNumber);

    if (!requestItem) {
      console.error(`❌ Request Item ${ritmNumber} not found`);
      console.error('');
      console.error('Please verify:');
      console.error('1. The RITM number is correct');
      console.error('2. You have access to this request item');
      console.error('3. ServiceNow credentials are valid');
      process.exit(1);
    }

    console.log('✅ Request Item Found');
    console.log('');
    console.log('Request Item Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Number:             ${requestItem.number}`);
    console.log(`Sys ID:             ${requestItem.sys_id}`);
    console.log(`Short Description:  ${requestItem.short_description || '(none)'}`);
    console.log(`State:              ${requestItem.state || '(unknown)'}`);
    console.log(`Opened At:          ${requestItem.opened_at || '(unknown)'}`);
    console.log(`Parent Request:     ${requestItem.request_number || '(none)'}`);
    console.log(`URL:                ${requestItem.url}`);
    console.log('');

    if (!requestItem.cat_item) {
      console.error('⚠️  WARNING: No catalog item associated with this request item');
      console.error('   This request item may not have been created from a catalog item');
      process.exit(1);
    }

    console.log('Catalog Item Reference:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Sys ID:             ${requestItem.cat_item}`);
    console.log(`Name (from RITM):   ${requestItem.cat_item_name || '(none)'}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 STEP 2: Fetch Full Catalog Item Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Query the catalog item by sys_id
    const catalogItems = await serviceNowClient.getCatalogItems({
      keywords: [],
      active: undefined,
      limit: 100,
    });

    const catalogItem = catalogItems.find(item => item.sys_id === requestItem.cat_item);

    if (!catalogItem) {
      console.error(`⚠️  WARNING: Could not fetch catalog item ${requestItem.cat_item}`);
      console.error('   The catalog item may be inactive or you may not have access');
      console.log('');
      console.log('However, we know from the RITM that the catalog item name is:');
      console.log(`  "${requestItem.cat_item_name}"`);
      console.log('');
      process.exit(0);
    }

    console.log('✅ Catalog Item Found');
    console.log('');
    console.log('Catalog Item Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Name:               ${catalogItem.name}`);
    console.log(`Sys ID:             ${catalogItem.sys_id}`);
    console.log(`Short Description:  ${catalogItem.short_description || '(none)'}`);
    console.log(`Category:           ${catalogItem.category || '(none)'}`);
    console.log(`Active:             ${catalogItem.active ? '✅ Yes' : '❌ No'}`);
    console.log(`URL:                ${catalogItem.url}`);
    console.log('');

    if (catalogItem.description) {
      console.log('Full Description:');
      console.log('─────────────────────────────────────────────────────');
      console.log(catalogItem.description);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 RECOMMENDATIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log(`The catalog item "${catalogItem.name}" is being used for this request.`);
    console.log('');

    console.log('To configure this catalog item for Altus Community Healthcare:');
    console.log('');
    console.log('1. Determine which HR request type this maps to:');
    console.log('   - onboarding');
    console.log('   - termination');
    console.log('   - offboarding');
    console.log('   - new_account');
    console.log('   - account_modification');
    console.log('   - transfer');
    console.log('');
    console.log('2. Update the client settings in the database with custom mappings:');
    console.log('');
    console.log('   UPDATE client_settings');
    console.log('   SET custom_catalog_mappings = \'[{');
    console.log(`     "requestType": "onboarding",  -- or appropriate type`);
    console.log(`     "keywords": ["onboarding", "new hire", "new employee"],`);
    console.log(`     "catalogItemNames": ["${catalogItem.name}"],`);
    console.log(`     "priority": 10`);
    console.log('   }]\'::jsonb');
    console.log('   WHERE client_id = \'c3eec28c931c9a1049d9764efaba10f3\';');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error tracing request item:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

traceRequestItem();
