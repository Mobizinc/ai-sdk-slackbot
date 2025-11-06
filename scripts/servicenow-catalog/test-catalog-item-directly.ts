/**
 * Test Catalog Item Directly via API
 *
 * Bypasses Service Portal and tests if catalog items can create cases directly
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

async function testCreateCase() {
  console.log('🧪 Testing Direct Case Creation');
  console.log('='.repeat(60));

  // Test creating a case directly via API (simulating what the catalog item should do)
  console.log('\n📝 Creating test case with category and subcategory...');

  const testCase = {
    company: '2d6a47c7870011100fadcbb6dabb35fb', // DEV company ID from .env.local
    account: '2d6a47c7870011100fadcbb6dabb35fb',
    category: '12', // Hardware issue
    subcategory: 'laptop_request', // Laptop Request
    short_description: '[TEST] Catalog item validation test',
    description: 'Testing if category and subcategory can be set via API',
    impact: '3',
    urgency: '3',
    priority: '5',
  };

  try {
    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/x_mobit_serv_case_service_case`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(testCase),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to create case: ${response.status}`);
      console.error(error);
      return null;
    }

    const data = await response.json();
    const caseData = data.result;

    console.log(`✅ Test case created successfully!`);
    console.log(`\nCase Details:`);
    console.log(`  sys_id: ${caseData.sys_id}`);
    console.log(`  number: ${caseData.number}`);
    console.log(`  category: ${caseData.category}`);
    console.log(`  subcategory: ${caseData.subcategory}`);
    console.log(`  short_description: ${caseData.short_description}`);

    // Verify category and subcategory were set
    if (caseData.category && caseData.subcategory) {
      console.log(`\n✅ VALIDATION PASSED: Both category and subcategory were set correctly!`);
    } else {
      console.log(`\n⚠️  WARNING: Category or subcategory missing:`);
      console.log(`  category: ${caseData.category || 'MISSING'}`);
      console.log(`  subcategory: ${caseData.subcategory || 'MISSING'}`);
    }

    return caseData;
  } catch (error) {
    console.error('\n❌ Error:', error);
    return null;
  }
}

async function compareCatalogItems() {
  console.log('\n\n🔍 Comparing Catalog Item Configurations');
  console.log('='.repeat(60));

  const items = [
    { name: 'Request Support (Original)', sys_id: '0ad4666883a9261068537cdfeeaad303' },
    { name: 'Report a Problem', sys_id: '142449218381be1468537cdfeeaad39a' },
    { name: 'Request Something', sys_id: '4f2401e5c3053e141302560fb001312a' },
  ];

  const fields = 'sys_id,name,active,table_name,sc_catalogs,category,script,workflow,no_order,no_order_now,no_cart,access_type';

  for (const item of items) {
    console.log(`\n📋 ${item.name}:`);

    try {
      const response = await fetch(
        `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer/${item.sys_id}?sysparm_fields=${fields}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.log(`  ❌ Failed to fetch: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const result = data.result;

      console.log(`  active: ${result.active}`);
      console.log(`  table_name: ${result.table_name || 'EMPTY'}`);
      console.log(`  sc_catalogs: ${result.sc_catalogs || 'EMPTY'}`);
      console.log(`  category: ${result.category || 'EMPTY'}`);
      console.log(`  access_type: ${result.access_type || 'N/A'}`);
      console.log(`  workflow: ${result.workflow || 'N/A'}`);
      console.log(`  no_order: ${result.no_order}`);
      console.log(`  script length: ${result.script ? result.script.length : 0} chars`);
      console.log(`  script includes subcategory: ${result.script?.includes('subcategory') ? 'YES' : 'NO'}`);
    } catch (error) {
      console.log(`  ❌ Error fetching item: ${error}`);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function main() {
  // Test 1: Try creating a case directly
  const testCaseResult = await testCreateCase();

  // Test 2: Compare all catalog item configurations
  await compareCatalogItems();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnostic complete!');
  console.log('\nConclusions:');

  if (testCaseResult) {
    console.log('  ✅ Direct case creation works - table and fields are accessible');
    console.log('  ⚠️  Issue is likely with Service Portal widget or configuration');
    console.log('\nRecommended Actions:');
    console.log('  1. Try accessing catalog items via classic UI instead of /sp');
    console.log('  2. Check Service Portal cache and clear if needed');
    console.log('  3. Verify Service Portal configuration in DEV matches PROD');
    console.log('  4. Consider testing in PROD if DEV Service Portal has known issues');
  } else {
    console.log('  ❌ Direct case creation failed - table access or permission issue');
    console.log('\nRecommended Actions:');
    console.log('  1. Check ACLs on x_mobit_serv_case_service_case table');
    console.log('  2. Verify table exists and is accessible in DEV');
    console.log('  3. Check user permissions for service account');
  }
}

main();
