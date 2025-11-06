/**
 * Create "Request Something" Catalog Item
 *
 * Copies the existing "Request Support" catalog item and modifies it to:
 * 1. Change name to "Request Something"
 * 2. Add subcategory variable (currently missing!)
 * 3. Filter categories to request-oriented ones only
 * 4. Update reference qualifiers for cascading subcategory
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const SERVICENOW_URL = process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('❌ Missing ServiceNow credentials');
  process.exit(1);
}

const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

// Original Request Support sys_id
const ORIGINAL_ITEM_SYS_ID = '0ad4666883a9261068537cdfeeaad303';

// Request categories (for access, hardware, software requests - NOT for problems)
const REQUEST_CATEGORIES = [
  '17', // User Account Management (onboarding, access, permissions)
  '22', // Azure (provisioning VMs, resources)
  '11', // Exchange (new mailboxes, distribution lists)
  '13', // Application (software installation requests)
  '12', // Hardware issue (new hardware requests - laptop, monitor, etc.)
];

async function fetchOriginalItem() {
  console.log(`📥 Fetching original catalog item: ${ORIGINAL_ITEM_SYS_ID}`);

  const response = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer/${ORIGINAL_ITEM_SYS_ID}`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch original item: ${response.status}`);
  }

  const data = await response.json();
  console.log(`✅ Fetched: ${data.result.name}`);
  return data.result;
}

async function createCatalogItem(originalItem: any) {
  console.log(`\n📝 Creating "Request Something" catalog item...`);

  const newItem = {
    name: 'Request Something',
    short_description: 'Request access, hardware, software, or account changes',
    description: '<p>Use this form to request IT services such as:</p><ul><li>Access to applications or file shares</li><li>New user onboarding or offboarding</li><li>New hardware (laptop, monitor, keyboard, mouse, etc.)</li><li>Software installation</li><li>New email mailbox or distribution list</li><li>Azure resource provisioning</li><li>Permission changes or role updates</li></ul><p><strong>NOT for problems:</strong> If something is broken or not working, use "Report a Problem" instead.</p>',
    sc_catalogs: originalItem.sc_catalogs, // Same catalog
    category: originalItem.category, // Same category
    table_name: originalItem.table_name, // sn_customerservice_case
    active: true,
    order: 20, // After "Report a Problem" (order 10)
    sys_class_name: 'sc_cat_item_producer',
  };

  const response = await fetch(
    `${SERVICENOW_URL}/api/now/table/sc_cat_item_producer`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(newItem),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create catalog item: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log(`✅ Created catalog item: ${data.result.sys_id}`);
  return data.result;
}

async function fetchOriginalVariables() {
  console.log(`\n📥 Fetching variables from original catalog item...`);

  const response = await fetch(
    `${SERVICENOW_URL}/api/now/table/item_option_new?sysparm_query=cat_item=${ORIGINAL_ITEM_SYS_ID}&sysparm_fields=name,question_text,type,order,mandatory,reference,reference_qual,sys_id&sysparm_limit=100`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch variables: ${response.status}`);
  }

  const data = await response.json();
  console.log(`✅ Found ${data.result.length} variables`);
  return data.result;
}

async function createVariable(catalogItemSysId: string, variable: any, isNew = false) {
  const varData = {
    cat_item: catalogItemSysId,
    name: variable.name,
    question_text: variable.question_text,
    type: variable.type,
    order: variable.order,
    mandatory: variable.mandatory,
    reference: variable.reference || '',
    reference_qual: variable.reference_qual || '',
  };

  const response = await fetch(
    `${SERVICENOW_URL}/api/now/table/item_option_new`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(varData),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Failed to create variable ${variable.name}: ${error}`);
    return null;
  }

  const data = await response.json();
  return data.result;
}

async function main() {
  console.log('🔧 Creating "Request Something" Catalog Item');
  console.log('='.repeat(60));

  try {
    // Step 1: Fetch original catalog item
    const originalItem = await fetchOriginalItem();

    // Step 2: Create new catalog item
    const newItem = await createCatalogItem(originalItem);

    // Step 3: Fetch original variables
    const originalVariables = await fetchOriginalVariables();

    // Step 4: Copy variables and modify as needed
    console.log(`\n📋 Creating variables for new catalog item...`);

    for (const origVar of originalVariables) {
      let modifiedVar = { ...origVar };

      // Modify category variable to filter for request categories only
      if (origVar.name === 'category') {
        console.log(`  ✏️  Modifying category variable to filter request categories`);
        modifiedVar.reference_qual = `name=sn_customerservice_case^element=category^valueIN${REQUEST_CATEGORIES.join(',')}`;
      }

      // Create the variable
      const created = await createVariable(newItem.sys_id, modifiedVar);
      if (created) {
        console.log(`  ✅ Created variable: ${origVar.name}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Step 5: Add NEW subcategory variable (missing from original!)
    console.log(`\n📋 Adding NEW subcategory variable...`);
    const subcategoryVar = {
      name: 'subcategory',
      question_text: 'Request Type',
      type: '5', // Select Box
      order: 360, // Right after category (350)
      mandatory: true,
      reference: '',
      reference_qual: 'javascript:"dependent_value="+current.variables.category',
    };

    const subcatCreated = await createVariable(newItem.sys_id, subcategoryVar, true);
    if (subcatCreated) {
      console.log(`  ✅ Created subcategory variable with cascading`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ "Request Something" Catalog Item Created!');
    console.log(`\nCatalog Item sys_id: ${newItem.sys_id}`);
    console.log(`URL: ${SERVICENOW_URL}/sp?id=sc_cat_item&sys_id=${newItem.sys_id}`);
    console.log('\nNext Steps:');
    console.log('1. Test the catalog item in Employee Service Center');
    console.log('2. Verify category filtering works (only request categories)');
    console.log('3. Verify subcategory cascades based on category selection');
    console.log('4. Deprecate original "Request Support" catalog item');
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

main();
