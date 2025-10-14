/**
 * Query ServiceNow Catalog Items
 * Searches for HR-related catalog items and verifies availability
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/query-catalog-items.ts
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

// Expected catalog item names from HR Request Detector
const EXPECTED_CATALOG_ITEMS = {
  onboarding: [
    'HR - Employee Onboarding Request',
    'Employee Onboarding',
    'New Employee Setup',
    'New Hire Request',
  ],
  termination: [
    'HR - Employee Termination Request',
    'Employee Termination',
    'Employee Offboarding',
    'User Termination',
  ],
  offboarding: [
    'HR - Employee Offboarding Request',
    'Employee Offboarding',
    'User Deactivation',
    'Access Removal',
  ],
  new_account: [
    'HR - New Account Request',
    'New User Account',
    'Account Creation Request',
    'User Provisioning',
  ],
  account_modification: [
    'HR - Account Modification Request',
    'User Account Modification',
    'Access Modification',
    'Permission Change Request',
  ],
  transfer: [
    'HR - Employee Transfer Request',
    'Employee Transfer',
    'Department Transfer',
    'Role Change Request',
  ],
};

async function queryCatalogItems() {
  console.log('🔍 Querying ServiceNow Catalog Items');
  console.log('');

  // Check ServiceNow configuration
  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client is not properly configured');
    console.error('   Please check your .env.local file');
    process.exit(1);
  }

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Search for HR-Related Catalog Items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Search with HR-related keywords
    const hrKeywords = ['HR', 'employee', 'onboarding', 'termination', 'hire', 'account'];
    const hrResults: Map<string, any> = new Map();

    for (const keyword of hrKeywords) {
      console.log(`Searching for "${keyword}"...`);
      const items = await serviceNowClient.getCatalogItems({
        keywords: [keyword],
        active: true,
        limit: 20,
      });

      items.forEach(item => hrResults.set(item.sys_id, item));
      console.log(`  Found ${items.length} items`);
    }

    console.log('');
    console.log(`✅ Total unique HR-related catalog items: ${hrResults.size}`);
    console.log('');

    if (hrResults.size > 0) {
      console.log('HR-Related Catalog Items:');
      console.log('─────────────────────────────────────────────────────');
      Array.from(hrResults.values()).forEach((item, i) => {
        console.log(`${i + 1}. ${item.name}`);
        if (item.short_description) {
          console.log(`   ${item.short_description}`);
        }
        console.log(`   Sys ID: ${item.sys_id}`);
        console.log(`   URL: ${item.url}`);
        console.log('');
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔎 STEP 2: Test Specific Expected Catalog Item Names');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const foundItems: Map<string, any[]> = new Map();
    const missingItems: Map<string, string[]> = new Map();

    for (const [requestType, expectedNames] of Object.entries(EXPECTED_CATALOG_ITEMS)) {
      console.log(`Testing ${requestType} catalog items:`);
      const found: any[] = [];
      const missing: string[] = [];

      for (const expectedName of expectedNames) {
        const item = await serviceNowClient.getCatalogItemByName(expectedName);
        if (item) {
          console.log(`  ✅ Found: ${expectedName}`);
          found.push(item);
        } else {
          console.log(`  ❌ Not found: ${expectedName}`);
          missing.push(expectedName);
        }
      }

      if (found.length > 0) {
        foundItems.set(requestType, found);
      }
      if (missing.length > 0) {
        missingItems.set(requestType, missing);
      }

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('Found Catalog Items by Request Type:');
    console.log('─────────────────────────────────────────────────────');
    for (const [requestType, items] of foundItems.entries()) {
      console.log(`\n${requestType.toUpperCase()}: ${items.length} found`);
      items.forEach(item => {
        console.log(`  • ${item.name}`);
        console.log(`    ${item.url}`);
      });
    }

    console.log('');
    console.log('');
    console.log('Missing Catalog Items:');
    console.log('─────────────────────────────────────────────────────');
    if (missingItems.size === 0) {
      console.log('✅ All expected catalog items found!');
    } else {
      for (const [requestType, items] of missingItems.entries()) {
        console.log(`\n${requestType.toUpperCase()}:`);
        items.forEach(name => {
          console.log(`  ❌ ${name}`);
        });
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 RECOMMENDATIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (foundItems.size === 0) {
      console.log('⚠️  WARNING: No matching catalog items found!');
      console.log('');
      console.log('The catalog redirect system will not be able to suggest');
      console.log('appropriate catalog items for HR requests.');
      console.log('');
      console.log('Action Required:');
      console.log('1. Check if HR catalog items exist in ServiceNow');
      console.log('2. Verify catalog item names match expectations');
      console.log('3. Update custom catalog mappings for Altus if needed');
    } else if (missingItems.size > 0) {
      console.log('⚠️  Some expected catalog items were not found.');
      console.log('');
      console.log('The system will work, but some request types may not');
      console.log('receive catalog item suggestions.');
      console.log('');
      console.log('Options:');
      console.log('1. Create missing catalog items in ServiceNow');
      console.log('2. Update custom mappings to use found catalog items');
      console.log('3. Accept limited functionality for missing types');
    } else {
      console.log('✅ All expected catalog items were found!');
      console.log('');
      console.log('The catalog redirect system is fully configured and');
      console.log('ready to suggest appropriate catalog items for all');
      console.log('HR request types.');
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error querying catalog items:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

queryCatalogItems();
