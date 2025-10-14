/**
 * Find all Altus-specific catalog items
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/find-altus-catalog-items.ts
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function findAltusCatalogItems() {
  console.log('🔍 Searching for Altus Catalog Items');
  console.log('');

  // Check ServiceNow configuration
  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client is not properly configured');
    console.error('   Please check your .env.local file');
    process.exit(1);
  }

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Searching for "Altus" Catalog Items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const catalogItems = await serviceNowClient.getCatalogItems({
      keywords: ['Altus'],
      active: undefined, // Include both active and inactive
      limit: 50,
    });

    if (catalogItems.length === 0) {
      console.log('❌ No catalog items found with "Altus" keyword');
      process.exit(0);
    }

    console.log(`✅ Found ${catalogItems.length} catalog items:`);
    console.log('');

    catalogItems.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name}`);
      console.log(`   Sys ID:             ${item.sys_id}`);
      console.log(`   Short Description:  ${item.short_description || '(none)'}`);
      console.log(`   Category:           ${item.category || '(none)'}`);
      console.log(`   Active:             ${item.active ? '✅ Yes' : '❌ No'}`);
      console.log(`   URL:                ${item.url}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 ANALYSIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Analyze which HR request types these might map to
    const mappingSuggestions: Record<string, string[]> = {};

    catalogItems.forEach(item => {
      const name = item.name.toLowerCase();

      if (name.includes('onboard') || name.includes('hire') || name.includes('new employee')) {
        if (!mappingSuggestions.onboarding) mappingSuggestions.onboarding = [];
        mappingSuggestions.onboarding.push(item.name);
      }

      if (name.includes('termination') || name.includes('offboard') || name.includes('leaving')) {
        if (!mappingSuggestions.termination) mappingSuggestions.termination = [];
        mappingSuggestions.termination.push(item.name);
      }

      if (name.includes('new account') || name.includes('account creation') || name.includes('provisioning')) {
        if (!mappingSuggestions.new_account) mappingSuggestions.new_account = [];
        mappingSuggestions.new_account.push(item.name);
      }

      if (name.includes('account modification') || name.includes('modify account') || name.includes('access change')) {
        if (!mappingSuggestions.account_modification) mappingSuggestions.account_modification = [];
        mappingSuggestions.account_modification.push(item.name);
      }

      if (name.includes('transfer') || name.includes('department change')) {
        if (!mappingSuggestions.transfer) mappingSuggestions.transfer = [];
        mappingSuggestions.transfer.push(item.name);
      }
    });

    console.log('Suggested Mappings for Altus:');
    console.log('─────────────────────────────────────────────────────');
    console.log('');

    if (Object.keys(mappingSuggestions).length === 0) {
      console.log('⚠️  No obvious HR request type mappings found');
      console.log('   You may need to manually review each catalog item');
    } else {
      for (const [requestType, catalogNames] of Object.entries(mappingSuggestions)) {
        console.log(`${requestType}:`);
        catalogNames.forEach(name => {
          console.log(`  - ${name}`);
        });
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 NEXT STEPS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Update Altus configuration with these catalog items:');
    console.log('');
    console.log('UPDATE client_settings');
    console.log('SET custom_catalog_mappings = \'[');

    const mappingsArray = Object.entries(mappingSuggestions).map(([requestType, catalogNames], i, arr) => {
      const keywords = requestType === 'onboarding'
        ? ['onboarding', 'onboard', 'new hire', 'new employee']
        : requestType === 'termination'
        ? ['termination', 'terminate', 'leaving', 'last day', 'offboard']
        : requestType === 'new_account'
        ? ['new account', 'account creation', 'create account']
        : requestType === 'account_modification'
        ? ['modify account', 'change permissions', 'update access']
        : requestType === 'transfer'
        ? ['transfer', 'department change', 'role change']
        : [];

      return `  {
    "requestType": "${requestType}",
    "keywords": ${JSON.stringify(keywords)},
    "catalogItemNames": ${JSON.stringify(catalogNames)},
    "priority": 10
  }${i < arr.length - 1 ? ',' : ''}`;
    });

    console.log(mappingsArray.join('\n'));
    console.log(']\'::jsonb');
    console.log('WHERE client_id = \'c3eec28c931c9a1049d9764efaba10f3\';');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error searching catalog items:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

findAltusCatalogItems();
