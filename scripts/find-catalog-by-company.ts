/**
 * Find catalog items by company/account sys_id
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/find-catalog-by-company.ts <company_sys_id>
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findCatalogByCompany() {
  const companySysId = process.argv[2] || 'c3eec28c931c9a1049d9764efaba10f3'; // Altus

  console.log('🔍 Finding catalog items for company');
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
    console.log('🏢 METHOD 1: Direct Company Field Query');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Try querying by company field
    const response1 = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=company=${companySysId}^active=true&sysparm_display_value=all&sysparm_limit=100&sysparm_fields=sys_id,name,short_description`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response1.ok) {
      const data1 = await response1.json();
      const items1 = data1.result || [];

      if (items1.length > 0) {
        console.log(`✅ Found ${items1.length} catalog items with company field:`);
        items1.forEach((item: any, i: number) => {
          const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value;
          console.log(`  ${i + 1}. ${name}`);
        });
      } else {
        console.log('❌ No catalog items found with company field');
      }
    } else {
      console.log(`❌ Query failed: ${response1.status}`);
    }
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👥 METHOD 2: User Criteria Query');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Checking user criteria for company-specific restrictions...');
    console.log('');

    // Query user criteria that reference this company
    const response2 = await fetch(
      `${instanceUrl}/api/now/table/user_criteria?sysparm_query=company=${companySysId}^ORaccount=${companySysId}&sysparm_display_value=all&sysparm_limit=50&sysparm_fields=sys_id,name,company,account`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response2.ok) {
      const data2 = await response2.json();
      const criteria = data2.result || [];

      if (criteria.length > 0) {
        console.log(`✅ Found ${criteria.length} user criteria for this company:`);
        console.log('');

        for (const crit of criteria) {
          const critSysId = crit.sys_id && crit.sys_id.value ? crit.sys_id.value : crit.sys_id;
          const critName = crit.name && crit.name.display_value ? crit.name.display_value : crit.name && crit.name.value;

          console.log(`  User Criteria: ${critName || critSysId}`);

          // Find catalog items that use this user criteria
          const response3 = await fetch(
            `${instanceUrl}/api/now/table/sc_cat_item_user_criteria_mtom?sysparm_query=user_criteria=${critSysId}&sysparm_display_value=all&sysparm_limit=20`,
            {
              headers: {
                'Authorization': `Basic ${encoded}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response3.ok) {
            const data3 = await response3.json();
            const mappings = data3.result || [];

            if (mappings.length > 0) {
              console.log(`    → ${mappings.length} catalog items use this criteria`);

              for (const mapping of mappings) {
                const catItemSysId = mapping.sc_cat_item && mapping.sc_cat_item.value;
                const catItemName = mapping.sc_cat_item && mapping.sc_cat_item.display_value;

                if (catItemName) {
                  console.log(`      • ${catItemName}`);
                }
              }
            } else {
              console.log('    → No catalog items use this criteria');
            }
          }
          console.log('');
        }
      } else {
        console.log('❌ No user criteria found for this company');
        console.log('   (Company restrictions might be in entitlement scripts instead)');
      }
    }
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📛 METHOD 3: Name Pattern Query (Current Working Method)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Get company name to derive prefix
    const companyResponse = await fetch(
      `${instanceUrl}/api/now/table/core_company/${companySysId}?sysparm_display_value=all&sysparm_fields=name`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (companyResponse.ok) {
      const companyData = await companyResponse.json();
      const company = companyData.result;
      const companyName = company.name && company.name.display_value ? company.name.display_value : company.name && company.name.value;

      console.log(`Company Name: ${companyName}`);

      // Extract first word as potential prefix
      const prefix = companyName ? companyName.split(' ')[0] : '';
      console.log(`Prefix: ${prefix}`);
      console.log('');

      if (prefix) {
        const response4 = await fetch(
          `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=nameSTARTSWITH${prefix}^active=true&sysparm_display_value=all&sysparm_limit=100&sysparm_fields=sys_id,name,short_description,sc_catalogs`,
          {
            headers: {
              'Authorization': `Basic ${encoded}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response4.ok) {
          const data4 = await response4.json();
          const items4 = data4.result || [];

          if (items4.length > 0) {
            console.log(`✅ Found ${items4.length} catalog items with "${prefix}" prefix:`);
            console.log('');
            items4.forEach((item: any, i: number) => {
              const name = item.name && item.name.display_value ? item.name.display_value : item.name && item.name.value;
              const sysId = item.sys_id && item.sys_id.value ? item.sys_id.value : item.sys_id;
              const catalog = item.sc_catalogs && item.sc_catalogs.display_value ? item.sc_catalogs.display_value : '(none)';

              console.log(`  ${i + 1}. ${name}`);
              console.log(`     Sys ID:  ${sysId}`);
              console.log(`     Catalog: ${catalog}`);
              console.log('');
            });
          } else {
            console.log(`❌ No catalog items found with "${prefix}" prefix`);
          }
        }
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 CONCLUSION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Catalog items are NOT directly associated with companies via a field.');
    console.log('');
    console.log('Company-specific catalog items are managed through:');
    console.log('  1. Naming conventions (e.g., "Altus New Hire")');
    console.log('  2. User criteria rules (availability based on user\'s company)');
    console.log('  3. Entitlement scripts (custom code controlling access)');
    console.log('');
    console.log('Recommended query for Altus catalog items:');
    console.log(`  nameSTARTSWITHAltus^active=true`);
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

findCatalogByCompany();
