/**
 * Find ServiceNow License catalog item
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/find-servicenow-license-catalog.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function findServiceNowLicenseCatalog() {
  console.log('🔍 Searching for ServiceNow License Catalog Item');
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    process.exit(1);
  }

  try {
    // Search by name
    const item = await serviceNowClient.getCatalogItemByName('ServiceNow License');

    if (!item) {
      console.log('❌ ServiceNow License catalog item not found');
      console.log('');
      console.log('Trying alternate search...');
      console.log('');

      // Try searching all catalog items with "ServiceNow" in the name
      const instanceUrl = process.env.SERVICENOW_URL;
      const username = process.env.SERVICENOW_USERNAME;
      const password = process.env.SERVICENOW_PASSWORD;

      const response = await fetch(
        `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=nameLIKEServiceNow^ORnameLIKEservicenow&sysparm_display_value=all&sysparm_limit=20`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`ServiceNow API error: ${response.statusText}`);
      }

      const data = await response.json();

      console.log(`Found ${data.result.length} catalog items with "ServiceNow" in name:`);
      console.log('');

      data.result.forEach((item: any, i: number) => {
        console.log(`${i + 1}. ${item.name}`);
        console.log(`   Sys ID:      ${item.sys_id}`);
        console.log(`   Description: ${item.short_description || '(none)'}`);
        console.log(`   Active:      ${item.active === 'true' || item.active === true ? '✅ Yes' : '❌ No'}`);
        console.log(`   URL:         https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=${item.sys_id}`);
        console.log('');
      });

      process.exit(0);
    }

    console.log('✅ Found ServiceNow License Catalog Item:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Name:        ${item.name}`);
    console.log(`Sys ID:      ${item.sys_id}`);
    console.log(`Description: ${item.short_description || '(none)'}`);
    console.log(`Category:    ${item.category || '(none)'}`);
    console.log(`Active:      ${item.active ? '✅ Yes' : '❌ No'}`);
    console.log(`URL:         ${item.url}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error searching for catalog item:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

findServiceNowLicenseCatalog();
