/**
 * Find all catalog items by catalog ID
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/find-catalog-by-id.ts <catalog_sys_id>
 *
 * Example:
 *   npx tsx --env-file=.env.local scripts/find-catalog-by-id.ts c6743ad047de3d10d9ad2efd046d43be
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findCatalogById() {
  const catalogSysId = process.argv[2] || 'c6743ad047de3d10d9ad2efd046d43be'; // Default to Flex SC catalog

  console.log('🔍 Finding all catalog items in catalog');
  console.log(`   Catalog Sys ID: ${catalogSysId}`);
  console.log('');

  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const encoded = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    // First, get catalog details
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📚 CATALOG DETAILS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const catalogResponse = await fetch(
      `${instanceUrl}/api/now/table/sc_catalog/${catalogSysId}?sysparm_display_value=all`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (catalogResponse.ok) {
      const catalogData = await catalogResponse.json();
      const catalog = catalogData.result;

      const title = catalog.title && catalog.title.display_value ? catalog.title.display_value : catalog.title;
      const desc = catalog.description && catalog.description.display_value ? catalog.description.display_value : catalog.description;
      const active = catalog.active && catalog.active.value ? catalog.active.value : catalog.active;

      console.log(`Title:       ${title || '(none)'}`);
      console.log(`Description: ${desc || '(none)'}`);
      console.log(`Active:      ${active === 'true' || active === true ? '✅ Yes' : '❌ No'}`);
      console.log('');
    } else {
      console.error(`❌ Failed to fetch catalog: ${catalogResponse.status}`);
    }

    // Now get all catalog items in this catalog
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 CATALOG ITEMS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const itemsResponse = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=sc_catalogs=${catalogSysId}&sysparm_display_value=all&sysparm_limit=200&sysparm_fields=sys_id,name,short_description,active,category`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!itemsResponse.ok) {
      console.error(`❌ Failed to fetch catalog items: ${itemsResponse.status}`);
      process.exit(1);
    }

    const itemsData = await itemsResponse.json();
    const items = itemsData.result || [];

    console.log(`Found ${items.length} catalog items:`);
    console.log('');

    const activeItems: any[] = [];
    const inactiveItems: any[] = [];

    items.forEach((item: any) => {
      const isActive = item.active && (item.active.value === 'true' || item.active.value === true);
      if (isActive) {
        activeItems.push(item);
      } else {
        inactiveItems.push(item);
      }
    });

    console.log(`✅ Active: ${activeItems.length}`);
    console.log(`❌ Inactive: ${inactiveItems.length}`);
    console.log('');

    if (activeItems.length > 0) {
      console.log('ACTIVE CATALOG ITEMS:');
      console.log('─────────────────────────────────────────────────────');
      activeItems.forEach((item, i) => {
        const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value ? item.name.value : '(no name)';
        const sysId = item.sys_id && item.sys_id.value ? item.sys_id.value : item.sys_id;
        const shortDesc = item.short_description && item.short_description.display_value ? item.short_description.display_value : '(none)';
        const category = item.category && item.category.display_value ? item.category.display_value : '(none)';

        console.log(`${i + 1}. ${name}`);
        console.log(`   Sys ID:      ${sysId}`);
        console.log(`   Description: ${shortDesc}`);
        console.log(`   Category:    ${category}`);
        console.log(`   URL:         ${instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`);
        console.log('');
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 QUERY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('To find all catalog items for this catalog:');
    console.log(`  sc_catalogs=${catalogSysId}^active=true`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

findCatalogById();
