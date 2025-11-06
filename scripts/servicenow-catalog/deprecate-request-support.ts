/**
 * Deprecate "Request Support" Catalog Item
 *
 * Sets the original "Request Support" catalog item to inactive and
 * updates its description to redirect users to the new catalog items.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

// Check for --dev flag
const isDevMode = process.argv.includes('--dev');

const SERVICENOW_URL = isDevMode ? process.env.DEV_SERVICENOW_URL : process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = isDevMode ? process.env.DEV_SERVICENOW_USERNAME : process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = isDevMode ? process.env.DEV_SERVICENOW_PASSWORD : process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('❌ Missing ServiceNow credentials');
  console.error(`Mode: ${isDevMode ? 'DEV' : 'PROD'}`);
  process.exit(1);
}

console.log(`🔧 Mode: ${isDevMode ? 'DEV (mobizdev)' : 'PROD (mobiz)'}`);
console.log(`🔗 URL: ${SERVICENOW_URL}\n`);

const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

// Original Request Support sys_id
const ORIGINAL_ITEM_SYS_ID = '0ad4666883a9261068537cdfeeaad303';

async function deprecateCatalogItem() {
  console.log('🔧 Deprecating "Request Support" Catalog Item');
  console.log('='.repeat(60));
  console.log(`\nTarget sys_id: ${ORIGINAL_ITEM_SYS_ID}`);

  const updateData = {
    active: false,
    name: 'Request Support (DEPRECATED)',
    short_description: 'DEPRECATED - Use "Report a Problem" or "Request Something" instead',
    description: '<div style="background-color: #fff3cd; border: 2px solid #ffc107; padding: 15px; margin: 10px 0; border-radius: 5px;"><h3 style="color: #856404; margin-top: 0;">⚠️ This Catalog Item is Deprecated</h3><p>This form has been replaced with two new, more specific catalog items:</p><ul><li><strong>Report a Problem:</strong> Use this when something is broken or not working (hardware failures, software errors, network issues, etc.)</li><li><strong>Request Something:</strong> Use this when you need access, new hardware, software installation, or account changes</li></ul><p>Please use one of the new forms above. This form will be removed on [DATE].</p></div>',
  };

  try {
    console.log(`\n📝 Updating catalog item...`);

    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer/${ORIGINAL_ITEM_SYS_ID}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update catalog item: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Successfully deprecated catalog item`);
    console.log(`\nUpdated fields:`);
    console.log(`  • active: ${data.result.active}`);
    console.log(`  • name: ${data.result.name}`);
    console.log(`  • short_description: ${data.result.short_description}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Deprecation Complete!');
    console.log('\nThe "Request Support" catalog item is now inactive.');
    console.log('Users will be automatically directed to use the new items.');
    console.log('\nNext Steps:');
    console.log('1. Monitor usage of new catalog items');
    console.log('2. Track subcategory adoption rate (target: >70%)');
    console.log('3. After 30 days, fully delete the deprecated item if desired');
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

deprecateCatalogItem();
