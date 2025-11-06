/**
 * Add Missing Subcategories to Existing Categories
 *
 * Adds subcategories that are missing from EHR, User Account Management, and Hardware issue categories
 * to support better categorization in "Report a Problem" and "Request Something" catalog items.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

const SERVICENOW_URL = process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('❌ Missing ServiceNow credentials in .env.local');
  process.exit(1);
}

const TABLE_NAME = 'sn_customerservice_case';

// Missing subcategories to add
const missingSubcategories = [
  // EHR (23) - Add NextGen EPM
  {
    category: '23',
    categoryLabel: 'EHR',
    value: 'nextgen_epm',
    label: 'NextGen EPM',
    sequence: 33,
  },

  // User Account Management (17) - Add request types
  {
    category: '17',
    categoryLabel: 'User Account Management',
    value: 'new_access_request',
    label: 'New Access Request',
    sequence: 52,
  },
  {
    category: '17',
    categoryLabel: 'User Account Management',
    value: 'permission_change',
    label: 'Permission Change',
    sequence: 53,
  },
  {
    category: '17',
    categoryLabel: 'User Account Management',
    value: 'role_change',
    label: 'Role Change',
    sequence: 54,
  },
  {
    category: '17',
    categoryLabel: 'User Account Management',
    value: 'password_reset_request',
    label: 'Password Reset',
    sequence: 55,
  },
  {
    category: '17',
    categoryLabel: 'User Account Management',
    value: 'unlock_account_request',
    label: 'Unlock Account',
    sequence: 56,
  },

  // Hardware issue (12) - Add request-oriented subcategories
  {
    category: '12',
    categoryLabel: 'Hardware issue',
    value: 'desktop_request',
    label: 'Desktop Request',
    sequence: 80,
  },
  {
    category: '12',
    categoryLabel: 'Hardware issue',
    value: 'laptop_request',
    label: 'Laptop Request',
    sequence: 81,
  },
  {
    category: '12',
    categoryLabel: 'Hardware issue',
    value: 'monitor_request',
    label: 'Monitor Request',
    sequence: 82,
  },
  {
    category: '12',
    categoryLabel: 'Hardware issue',
    value: 'mobile_device_request',
    label: 'Mobile Device Request',
    sequence: 83,
  },
  {
    category: '12',
    categoryLabel: 'Hardware issue',
    value: 'peripheral_request',
    label: 'Peripheral Request',
    sequence: 84,
  },
];

async function createSubcategory(subcat: typeof missingSubcategories[0]): Promise<void> {
  const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

  const payload = {
    name: TABLE_NAME,
    element: 'subcategory',
    language: 'en',
    label: subcat.label,
    value: subcat.value,
    sequence: subcat.sequence.toString(),
    dependent_value: subcat.category,
    inactive: 'false',
  };

  try {
    const response = await fetch(`${SERVICENOW_URL}/api/now/table/sys_choice`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Created: ${subcat.categoryLabel} → ${subcat.label} (sys_id: ${result.result.sys_id})`);
    } else {
      const error = await response.text();
      console.error(`❌ Failed to create ${subcat.label}: ${response.status} - ${error}`);
    }
  } catch (error) {
    console.error(`❌ Error creating ${subcat.label}:`, error);
  }
}

async function main() {
  console.log('🔧 Adding Missing Subcategories to ServiceNow');
  console.log('='.repeat(60));
  console.log(`\nTarget Instance: ${SERVICENOW_URL}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Total Subcategories to Add: ${missingSubcategories.length}\n`);

  console.log('📋 Subcategories to Add:');
  console.log('-'.repeat(60));

  // Group by category for display
  const byCategory = missingSubcategories.reduce((acc, sub) => {
    if (!acc[sub.categoryLabel]) acc[sub.categoryLabel] = [];
    acc[sub.categoryLabel].push(sub.label);
    return acc;
  }, {} as Record<string, string[]>);

  Object.entries(byCategory).forEach(([cat, subs]) => {
    console.log(`\n${cat} (${subs.length} subcategories):`);
    subs.forEach(sub => console.log(`  • ${sub}`));
  });

  console.log('\n' + '='.repeat(60));
  console.log('Starting creation...\n');

  for (const subcat of missingSubcategories) {
    await createSubcategory(subcat);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Subcategory Addition Complete!');
  console.log('\nNext Steps:');
  console.log('1. Run category sync: npx tsx scripts/sync-servicenow-categories.ts');
  console.log('2. Verify subcategories in database');
  console.log('3. Proceed to copy catalog items');
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
