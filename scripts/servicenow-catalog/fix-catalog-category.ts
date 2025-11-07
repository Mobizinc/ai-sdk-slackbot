/**
 * Fix Catalog Item Category Assignment
 *
 * Updates the category field for the new catalog items to match the original
 * "Request Support" category (General IT Services)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const isDevMode = process.argv.includes('--dev');

const SERVICENOW_URL = isDevMode ? process.env.DEV_SERVICENOW_URL : process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = isDevMode ? process.env.DEV_SERVICENOW_USERNAME : process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = isDevMode ? process.env.DEV_SERVICENOW_PASSWORD : process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('❌ Missing ServiceNow credentials');
  process.exit(1);
}

console.log(`🔧 Mode: ${isDevMode ? 'DEV (mobizdev)' : 'PROD (mobiz)'}`);
console.log(`🔗 URL: ${SERVICENOW_URL}\n`);

const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

// Category from original Request Support item (General IT Services)
const CATEGORY_SYS_ID = '00860b1847127d10d9ad2efd046d4355';

async function fixCatalogItemCategory(catalogItemSysId: string, itemName: string) {
  console.log(`\n📝 Updating category for ${itemName}...`);

  try {
    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer/${catalogItemSysId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          category: CATEGORY_SYS_ID,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Category updated to: General IT Services (${CATEGORY_SYS_ID})`);

    return data.result;
  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

async function main() {
  console.log('🔧 Fixing Catalog Item Categories');
  console.log('='.repeat(60));

  // Find Report a Problem
  console.log(`\n📥 Finding "Report a Problem" catalog item...`);
  let reportResponse = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer?sysparm_query=name=Report a Problem&sysparm_fields=sys_id,name,category`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!reportResponse.ok) {
    throw new Error('Failed to find Report a Problem');
  }

  const reportData = await reportResponse.json();
  if (reportData.result.length === 0) {
    throw new Error('Report a Problem catalog item not found');
  }

  const reportSysId = reportData.result[0].sys_id;
  console.log(`✅ Found: ${reportSysId}`);

  // Find Request Something
  console.log(`\n📥 Finding "Request Something" catalog item...`);
  let requestResponse = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer?sysparm_query=name=Request Something&sysparm_fields=sys_id,name,category`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!requestResponse.ok) {
    throw new Error('Failed to find Request Something');
  }

  const requestData = await requestResponse.json();
  if (requestData.result.length === 0) {
    throw new Error('Request Something catalog item not found');
  }

  const requestSysId = requestData.result[0].sys_id;
  console.log(`✅ Found: ${requestSysId}`);

  // Fix both categories
  await fixCatalogItemCategory(reportSysId, 'Report a Problem');
  await fixCatalogItemCategory(requestSysId, 'Request Something');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Category assignments fixed!');
  console.log('\nBoth catalog items are now in "General IT Services" category.');
  console.log('They should now be accessible in the Employee Service Center.');
}

main();
