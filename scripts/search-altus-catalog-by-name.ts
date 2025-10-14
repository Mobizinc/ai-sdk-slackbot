/**
 * Search for catalog items starting with "Altus"
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/search-altus-catalog-by-name.ts
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

async function searchAltusCatalogItems() {
  console.log('🔍 Searching for Altus Catalog Items (name starts with "Altus")');
  console.log('');

  try {
    const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
    const username = process.env.SERVICENOW_USERNAME;
    const password = process.env.SERVICENOW_PASSWORD;

    if (!instanceUrl || !username || !password) {
      console.error('❌ ServiceNow credentials not configured');
      process.exit(1);
    }

    const encoded = Buffer.from(`${username}:${password}`).toString('base64');

    // Query with name starts with "Altus"
    const query = 'nameSTARTSWITHAltus^ORDERBYname';

    const response = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=${encodeURIComponent(query)}&sysparm_display_value=all&sysparm_limit=50`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ Failed to search catalog items: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    const items = data.result || [];

    if (items.length === 0) {
      console.log('❌ No catalog items found starting with "Altus"');
      process.exit(0);
    }

    console.log(`✅ Found ${items.length} catalog items:`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const mappingSuggestions: Record<string, Array<{name: string; sysId: string}>> = {};

    items.forEach((item: any, i: number) => {
      const name = item.name?.display_value || item.name?.value || item.sys_name?.display_value || '(no name)';
      const sysId = item.sys_id?.value || item.sys_id?.display_value;
      const active = item.active?.value === 'true' || item.active?.value === true;
      const category = item.category?.display_value || '(none)';
      const shortDesc = item.short_description?.display_value || item.short_description?.value || '(none)';

      console.log(`${i + 1}. ${name}`);
      console.log(`   Sys ID:             ${sysId}`);
      console.log(`   Short Description:  ${shortDesc}`);
      console.log(`   Category:           ${category}`);
      console.log(`   Active:             ${active ? '✅ Yes' : '❌ No'}`);
      console.log(`   URL:                ${instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`);
      console.log('');

      // Analyze which HR request type this might map to
      const nameLower = name.toLowerCase();

      if (nameLower.includes('onboard') || nameLower.includes('hire') || nameLower.includes('new employee')) {
        if (!mappingSuggestions.onboarding) mappingSuggestions.onboarding = [];
        mappingSuggestions.onboarding.push({ name, sysId });
      }

      if (nameLower.includes('termination') || nameLower.includes('offboard') || nameLower.includes('leaving')) {
        if (!mappingSuggestions.termination) mappingSuggestions.termination = [];
        mappingSuggestions.termination.push({ name, sysId });
      }

      if (nameLower.includes('new account') || nameLower.includes('account creation') || nameLower.includes('provisioning')) {
        if (!mappingSuggestions.new_account) mappingSuggestions.new_account = [];
        mappingSuggestions.new_account.push({ name, sysId });
      }

      if (nameLower.includes('account modification') || nameLower.includes('modify') || nameLower.includes('access change') || nameLower.includes('change request')) {
        if (!mappingSuggestions.account_modification) mappingSuggestions.account_modification = [];
        mappingSuggestions.account_modification.push({ name, sysId });
      }

      if (nameLower.includes('transfer') || nameLower.includes('department change')) {
        if (!mappingSuggestions.transfer) mappingSuggestions.transfer = [];
        mappingSuggestions.transfer.push({ name, sysId });
      }
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 SUGGESTED MAPPINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (Object.keys(mappingSuggestions).length === 0) {
      console.log('⚠️  No obvious HR request type mappings found');
      console.log('   You may need to manually review each catalog item');
    } else {
      for (const [requestType, catalogItems] of Object.entries(mappingSuggestions)) {
        console.log(`${requestType.toUpperCase()}:`);
        catalogItems.forEach(item => {
          console.log(`  - ${item.name}`);
          console.log(`    (${item.sysId})`);
        });
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 CONFIGURATION SQL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('UPDATE client_settings');
    console.log('SET custom_catalog_mappings = \'[');

    const mappingsArray = Object.entries(mappingSuggestions).map(([requestType, catalogItems], i, arr) => {
      const keywords = requestType === 'onboarding'
        ? ['onboarding', 'onboard', 'new hire', 'new employee']
        : requestType === 'termination'
        ? ['termination', 'terminate', 'leaving', 'last day', 'offboard']
        : requestType === 'new_account'
        ? ['new account', 'account creation', 'create account']
        : requestType === 'account_modification'
        ? ['modify account', 'change permissions', 'update access', 'access change']
        : requestType === 'transfer'
        ? ['transfer', 'department change', 'role change']
        : [];

      const catalogNames = catalogItems.map(item => item.name);

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

searchAltusCatalogItems();
