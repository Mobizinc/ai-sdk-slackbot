/**
 * Get catalog item by sys_id directly
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/get-catalog-item-by-sysid.ts e03f7ec0c30f6ed01302560fb001319d
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

async function getCatalogItemBySysId() {
  const sysId = process.argv[2];

  if (!sysId) {
    console.error('❌ Error: sys_id is required');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx --env-file=.env.local scripts/get-catalog-item-by-sysid.ts <sys_id>');
    process.exit(1);
  }

  console.log(`🔍 Fetching catalog item ${sysId}`);
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

    const response = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item/${sysId}?sysparm_display_value=all`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ Failed to fetch catalog item: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    const item = data.result;

    if (!item) {
      console.error('❌ Catalog item not found');
      process.exit(1);
    }

    console.log('✅ Catalog Item Found');
    console.log('');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Name:               ${item.name || '(none)'}`);
    console.log(`Sys ID:             ${item.sys_id}`);
    console.log(`Short Description:  ${item.short_description || '(none)'}`);
    console.log(`Category:           ${item.category?.display_value || '(none)'}`);
    console.log(`Active:             ${item.active === 'true' || item.active === true ? '✅ Yes' : '❌ No'}`);
    console.log(`Order:              ${item.order || '(none)'}`);
    console.log(`URL:                ${instanceUrl}/sp?id=sc_cat_item&sys_id=${item.sys_id}`);
    console.log('');

    if (item.description) {
      console.log('Description:');
      console.log('─────────────────────────────────────────────────────');
      console.log(item.description);
      console.log('');
    }

    console.log('Raw JSON:');
    console.log('─────────────────────────────────────────────────────');
    console.log(JSON.stringify(item, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fetching catalog item:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

getCatalogItemBySysId();
