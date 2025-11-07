/**
 * Fix Catalog Item Scripts
 *
 * Updates the scripts for the new catalog items to properly set
 * category, subcategory, account, priority, and work_notes on the created case.
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

// Script that sets category, subcategory, account, priority, and work_notes
const CATALOG_ITEM_SCRIPT = `// Set values from producer variables to case fields
var impact = producer.impact;
var urgency = producer.urgency;
var account = producer.account;
var category = producer.category;
var subcategory = producer.subcategory;

// Set work notes with contact info
current.work_notes = 'Preferred Communication Channel: ' + producer.contact_type_.getDisplayValue() + '\\n Phone Number: ' + producer.phone_number;

// Set account
current.setValue('account', account);

// Set category
current.setValue('category', category);

// Set subcategory (NEW!)
if (subcategory) {
  current.setValue('subcategory', subcategory);
}

// Calculate and set priority based on impact and urgency
var grDlUPriority = new GlideRecord('sn_customerservice_priority_data_lookup');
grDlUPriority.addEncodedQuery('active=true^u_impact=' + impact + '^u_urgency=' + urgency);
grDlUPriority.query();
if (grDlUPriority.next()) {
  current.setValue('priority', grDlUPriority.u_priority);
}`;

async function updateCatalogItemScript(catalogItemSysId: string, itemName: string) {
  console.log(`\n📝 Updating script for ${itemName}...`);

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
          script: CATALOG_ITEM_SCRIPT,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update: ${response.status} - ${error}`);
    }

    console.log(`✅ Script updated successfully`);
    console.log(`   - Sets category from producer.category`);
    console.log(`   - Sets subcategory from producer.subcategory`);
    console.log(`   - Sets account, priority, and work_notes`);

    return true;
  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

async function main() {
  console.log('🔧 Fixing Catalog Item Scripts');
  console.log('='.repeat(60));

  // Find Report a Problem
  console.log(`\n📥 Finding "Report a Problem" catalog item...`);
  let reportResponse = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer?sysparm_query=name=Report a Problem&sysparm_fields=sys_id,name`,
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
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer?sysparm_query=name=Request Something&sysparm_fields=sys_id,name`,
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

  // Fix both scripts
  await updateCatalogItemScript(reportSysId, 'Report a Problem');
  await updateCatalogItemScript(requestSysId, 'Request Something');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Scripts updated successfully!');
  console.log('\nBoth catalog items will now:');
  console.log('  1. Set category on the created case');
  console.log('  2. Set subcategory on the created case');
  console.log('  3. Set account, priority, and work_notes');
  console.log('\nThe catalog items should now work properly in the Service Portal.');
}

main();
