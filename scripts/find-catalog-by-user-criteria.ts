/**
 * Find catalog items by company using User Criteria (Method 2)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/find-catalog-by-user-criteria.ts <company_sys_id>
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findCatalogByUserCriteria() {
  const companySysId = process.argv[2] || 'c3eec28c931c9a1049d9764efaba10f3'; // Altus

  console.log('🔍 Finding Catalog Items via User Criteria (Method 2)');
  console.log(`   Company Sys ID: ${companySysId}`);
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Find User Criteria for Company');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`Query: company=${companySysId}^ORaccount=${companySysId}`);
    console.log('');

    // Step 1: Find all user criteria for this company
    const criteriaResponse = await fetch(
      `${instanceUrl}/api/now/table/user_criteria?sysparm_query=company=${companySysId}^ORaccount=${companySysId}&sysparm_display_value=all&sysparm_fields=sys_id,name,company,account,active`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!criteriaResponse.ok) {
      console.error(`❌ Failed to fetch user criteria: ${criteriaResponse.status}`);
      process.exit(1);
    }

    const criteriaData = await criteriaResponse.json();
    const userCriteria = criteriaData.result || [];

    if (userCriteria.length === 0) {
      console.log('❌ No user criteria found for this company');
      console.log('   This company may not have any catalog item restrictions');
      process.exit(0);
    }

    console.log(`✅ Found ${userCriteria.length} user criteria:`);
    console.log('');

    const criteriaSysIds: string[] = [];

    userCriteria.forEach((crit: any, i: number) => {
      const sysId = crit.sys_id && crit.sys_id.value ? crit.sys_id.value : crit.sys_id;
      const name = crit.name && crit.name.display_value ? crit.name.display_value : crit.name && crit.name.value;
      const company = crit.company && crit.company.display_value ? crit.company.display_value : '(none)';
      const active = crit.active && crit.active.value === 'true' ? '✅ Yes' : '❌ No';

      criteriaSysIds.push(sysId);

      console.log(`${i + 1}. ${name || sysId}`);
      console.log(`   Sys ID:  ${sysId}`);
      console.log(`   Company: ${company}`);
      console.log(`   Active:  ${active}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 STEP 2: Find Catalog Items Using These Criteria');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Step 2: Find all catalog items that use any of these user criteria
    const catalogItemSysIds = new Set<string>();
    const catalogItemDetails = new Map<string, any>();

    for (const critSysId of criteriaSysIds) {
      console.log(`Querying items for criteria: ${critSysId}...`);

      const mappingResponse = await fetch(
        `${instanceUrl}/api/now/table/sc_cat_item_user_criteria_mtom?sysparm_query=user_criteria=${critSysId}&sysparm_display_value=all&sysparm_fields=sc_cat_item`,
        {
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (mappingResponse.ok) {
        const mappingData = await mappingResponse.json();
        const mappings = mappingData.result || [];

        console.log(`  → Found ${mappings.length} catalog items`);

        mappings.forEach((mapping: any) => {
          const catItemSysId = mapping.sc_cat_item && mapping.sc_cat_item.value;
          const catItemName = mapping.sc_cat_item && mapping.sc_cat_item.display_value;

          if (catItemSysId) {
            catalogItemSysIds.add(catItemSysId);
            if (catItemName && !catalogItemDetails.has(catItemSysId)) {
              catalogItemDetails.set(catItemSysId, { name: catItemName });
            }
          }
        });
      }
    }

    console.log('');
    console.log(`✅ Total unique catalog items found: ${catalogItemSysIds.size}`);
    console.log('');

    if (catalogItemSysIds.size === 0) {
      console.log('❌ No catalog items are associated with these user criteria');
      process.exit(0);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 STEP 3: Fetch Full Catalog Item Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Step 3: Fetch full details for all catalog items
    const catalogItems: any[] = [];

    for (const catItemSysId of Array.from(catalogItemSysIds)) {
      const itemResponse = await fetch(
        `${instanceUrl}/api/now/table/sc_cat_item/${catItemSysId}?sysparm_display_value=all&sysparm_fields=sys_id,name,short_description,active,category,sc_catalogs`,
        {
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (itemResponse.ok) {
        const itemData = await itemResponse.json();
        const item = itemData.result;
        if (item) {
          catalogItems.push(item);
        }
      }
    }

    console.log(`Fetched details for ${catalogItems.length} catalog items:`);
    console.log('');

    // Separate active and inactive
    const activeItems = catalogItems.filter(item => {
      const active = item.active && item.active.value;
      return active === 'true' || active === true;
    });

    const inactiveItems = catalogItems.filter(item => {
      const active = item.active && item.active.value;
      return active !== 'true' && active !== true;
    });

    console.log(`✅ Active: ${activeItems.length}`);
    console.log(`❌ Inactive: ${inactiveItems.length}`);
    console.log('');

    if (activeItems.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ ACTIVE CATALOG ITEMS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');

      activeItems.forEach((item, i) => {
        const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value;
        const sysId = item.sys_id && item.sys_id.value ? item.sys_id.value : item.sys_id;
        const shortDesc = item.short_description && item.short_description.display_value ? item.short_description.display_value : '(none)';
        const category = item.category && item.category.display_value ? item.category.display_value : '(none)';
        const catalog = item.sc_catalogs && item.sc_catalogs.display_value ? item.sc_catalogs.display_value : '(none)';

        console.log(`${i + 1}. ${name}`);
        console.log(`   Sys ID:      ${sysId}`);
        console.log(`   Description: ${shortDesc}`);
        console.log(`   Category:    ${category}`);
        console.log(`   Catalog:     ${catalog}`);
        console.log(`   URL:         ${instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`);
        console.log('');
      });
    }

    if (inactiveItems.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ INACTIVE CATALOG ITEMS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');

      inactiveItems.forEach((item, i) => {
        const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value;
        const sysId = item.sys_id && item.sys_id.value ? item.sys_id.value : item.sys_id;

        console.log(`${i + 1}. ${name} (${sysId})`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`Company:                     ${companySysId}`);
    console.log(`User Criteria Found:         ${userCriteria.length}`);
    console.log(`Catalog Items (Total):       ${catalogItemSysIds.size}`);
    console.log(`  → Active:                  ${activeItems.length}`);
    console.log(`  → Inactive:                ${inactiveItems.length}`);
    console.log('');

    // List catalog item names for easy reference
    console.log('Active Catalog Item Names (for configuration):');
    console.log('─────────────────────────────────────────────────────');
    activeItems.forEach((item, i) => {
      const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value;
      console.log(`  ${i + 1}. "${name}"`);
    });
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

findCatalogByUserCriteria();
