/**
 * Fix subcategory reference_qual for cascading
 * Updates the subcategory variables to properly cascade based on category selection
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

// Subcategory variable sys_ids from DEV
const REPORT_PROBLEM_SUBCATEGORY_SYS_ID = 'e9248da5c3053e141302560fb0013160';
const REQUEST_SOMETHING_SUBCATEGORY_SYS_ID = ''; // Will be provided

async function updateReferenceQual(variableSysId: string, itemName: string) {
  console.log(`\n📝 Updating reference_qual for ${itemName} subcategory variable...`);

  // The reference qualifier that filters subcategories based on selected category
  const referenceQual = 'javascript:"name=sn_customerservice_case^element=subcategory^dependent_value="+current.variables.category';

  try {
    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/item_option_new/${variableSysId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          reference_qual: referenceQual,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update: ${response.status} - ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Updated reference_qual: ${data.result.reference_qual}`);

    return data.result;
  } catch (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }
}

async function main() {
  console.log('🔧 Fixing Subcategory Reference Qualifiers');
  console.log('='.repeat(60));

  // Get the Request Something subcategory variable sys_id
  console.log(`\n📥 Finding Request Something subcategory variable...`);

  const searchResponse = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer?sysparm_query=name=Request Something&sysparm_fields=sys_id`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`Failed to find Request Something catalog item`);
  }

  const catalogData = await searchResponse.json();
  if (catalogData.result.length === 0) {
    throw new Error('Request Something catalog item not found');
  }

  const requestSomethingCatalogId = catalogData.result[0].sys_id;
  console.log(`✅ Found Request Something: ${requestSomethingCatalogId}`);

  // Get subcategory variable for Request Something
  const varResponse = await fetch(
    `${SERVICENOW_URL}/api/now/table/item_option_new?sysparm_query=cat_item=${requestSomethingCatalogId}^name=subcategory&sysparm_fields=sys_id`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!varResponse.ok) {
    throw new Error(`Failed to find subcategory variable`);
  }

  const varData = await varResponse.json();
  if (varData.result.length === 0) {
    throw new Error('Subcategory variable not found for Request Something');
  }

  const requestSomethingSubcatId = varData.result[0].sys_id;
  console.log(`✅ Found subcategory variable: ${requestSomethingSubcatId}`);

  // Update both subcategory variables
  await updateReferenceQual(REPORT_PROBLEM_SUBCATEGORY_SYS_ID, 'Report a Problem');
  await updateReferenceQual(requestSomethingSubcatId, 'Request Something');

  console.log('\n' + '='.repeat(60));
  console.log('✅ Reference qualifiers updated successfully!');
  console.log('\nNext Steps:');
  console.log('1. Test both catalog items in Employee Service Center');
  console.log('2. Verify subcategory dropdown cascades when category is selected');
  console.log('3. Submit test cases to ensure category + subcategory are captured');
}

main();
