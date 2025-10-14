/**
 * Analyze how catalog items are associated with companies/accounts
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/analyze-catalog-company-relationship.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function analyzeCatalogRelationship() {
  console.log('🔍 Analyzing Catalog Item Company Relationship');
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
    console.log('📦 STEP 1: Fetch Full Schema of Altus Catalog Items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Fetch one of the Altus catalog items with ALL fields
    const altusTerminationSysId = 'e03f7ec0c30f6ed01302560fb001319d';

    const response = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item/${altusTerminationSysId}?sysparm_display_value=all&sysparm_exclude_reference_link=false`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ Failed: ${response.status}`);
      process.exit(1);
    }

    const data = await response.json();
    const item = data.result;

    console.log('Looking for company/account-related fields in catalog item...');
    console.log('');

    // Look for fields that might indicate company/account relationship
    const potentialFields = [
      'company',
      'account',
      'u_company',
      'u_account',
      'u_client',
      'client',
      'location',
      'sc_catalogs',
      'category',
      'user_criteria',
      'entitlement_script',
      'roles',
      'access_type',
      'availability'
    ];

    console.log('Fields that might indicate company relationship:');
    console.log('─────────────────────────────────────────────────────');

    for (const field of potentialFields) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
        const value = item[field];
        const displayValue = typeof value === 'object' ? value.display_value : value;
        const rawValue = typeof value === 'object' ? value.value : value;

        console.log(`${field}:`);
        console.log(`  Display: ${displayValue}`);
        console.log(`  Value:   ${rawValue}`);
        if (value.link) {
          console.log(`  Link:    ${value.link}`);
        }
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📚 STEP 2: Check Catalog (sc_catalogs) Relationship');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (item.sc_catalogs) {
      const catalogSysId = typeof item.sc_catalogs === 'object'
        ? item.sc_catalogs.value
        : item.sc_catalogs;

      console.log(`Catalog Sys ID: ${catalogSysId}`);
      console.log('Fetching catalog details...');
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

        console.log('Catalog Details:');
        console.log('─────────────────────────────────────────────────────');
        console.log(`Title: ${catalog.title?.display_value || catalog.title?.value || '(none)'}`);
        console.log(`Description: ${catalog.description?.display_value || catalog.description?.value || '(none)'}`);
        console.log(`Active: ${catalog.active?.value === 'true' ? '✅ Yes' : '❌ No'}`);

        // Check for company/account fields in catalog
        const catalogCompanyFields = ['company', 'u_company', 'u_client', 'client'];
        for (const field of catalogCompanyFields) {
          if (catalog[field]) {
            console.log(`${field}: ${catalog[field].display_value || catalog[field].value}`);
          }
        }
        console.log('');

        console.log('Full Catalog JSON:');
        console.log(JSON.stringify(catalog, null, 2));
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 STEP 3: Check User Criteria');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Query user criteria for this catalog item
    const criteriaResponse = await fetch(
      `${instanceUrl}/api/now/table/sc_cat_item_user_criteria_mtom?sysparm_query=sc_cat_item=${altusTerminationSysId}&sysparm_display_value=all&sysparm_limit=10`,
      {
        headers: {
          'Authorization': `Basic ${encoded}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (criteriaResponse.ok) {
      const criteriaData = await criteriaResponse.json();
      const criteria = criteriaData.result || [];

      if (criteria.length > 0) {
        console.log(`✅ Found ${criteria.length} user criteria:`);
        console.log('');
        criteria.forEach((crit: any, i: number) => {
          console.log(`${i + 1}. User Criteria:`);
          console.log(`   Sys ID: ${crit.user_criteria?.value || '(none)'}`);
          console.log(`   Type: ${crit.user_criteria?.display_value || '(none)'}`);
          console.log('');
        });

        // Fetch details of the first user criteria
        if (criteria[0]?.user_criteria?.value) {
          const userCritSysId = criteria[0].user_criteria.value;
          const userCritResponse = await fetch(
            `${instanceUrl}/api/now/table/user_criteria/${userCritSysId}?sysparm_display_value=all`,
            {
              headers: {
                'Authorization': `Basic ${encoded}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (userCritResponse.ok) {
            const userCritData = await userCritResponse.json();
            const userCrit = userCritData.result;

            console.log('User Criteria Details:');
            console.log('─────────────────────────────────────────────────────');
            console.log(JSON.stringify(userCrit, null, 2));
            console.log('');

            // Check for company/account restrictions
            if (userCrit.company || userCrit.u_company || userCrit.account) {
              console.log('🎯 FOUND COMPANY/ACCOUNT RESTRICTION!');
              console.log(`Company: ${userCrit.company?.display_value || '(none)'}`);
              console.log(`Account: ${userCrit.account?.display_value || '(none)')`);
              console.log('');
            }
          }
        }
      } else {
        console.log('ℹ️  No user criteria found for this catalog item');
        console.log('');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 STEP 4: Search ALL Catalog Items by Catalog ID');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (item.sc_catalogs) {
      const catalogSysId = typeof item.sc_catalogs === 'object'
        ? item.sc_catalogs.value
        : item.sc_catalogs;

      console.log(`Searching for ALL catalog items in catalog: ${catalogSysId}`);
      console.log('');

      const allItemsResponse = await fetch(
        `${instanceUrl}/api/now/table/sc_cat_item?sysparm_query=sc_catalogs=${catalogSysId}^active=true&sysparm_display_value=all&sysparm_limit=100&sysparm_fields=sys_id,name,short_description,active`,
        {
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (allItemsResponse.ok) {
        const allItemsData = await allItemsResponse.json();
        const allItems = allItemsData.result || [];

        console.log(`✅ Found ${allItems.length} catalog items in this catalog:`);
        console.log('');
        allItems.forEach((catalogItem: any, i: number) => {
          const name = catalogItem.name?.display_value || catalogItem.name?.value;
          const sysId = catalogItem.sys_id?.value || catalogItem.sys_id;
          console.log(`${i + 1}. ${name}`);
          console.log(`   Sys ID: ${sysId}`);
          console.log('');
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎯 CONCLUSION');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('To find ALL catalog items for Altus Community Healthcare:');
        console.log('');
        console.log(`Use the catalog sys_id: ${catalogSysId}`);
        console.log('');
        console.log('Query:');
        console.log(`  sc_catalogs=${catalogSysId}^active=true`);
        console.log('');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

analyzeCatalogRelationship();
