/**
 * Sync Subcategories to DEV Environment
 *
 * Creates the 11 new subcategories in the DEV sys_choice table
 * so that the catalog items can work properly
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const DEV_SERVICENOW_URL = process.env.DEV_SERVICENOW_URL;
const DEV_SERVICENOW_USERNAME = process.env.DEV_SERVICENOW_USERNAME;
const DEV_SERVICENOW_PASSWORD = process.env.DEV_SERVICENOW_PASSWORD;

if (!DEV_SERVICENOW_URL || !DEV_SERVICENOW_USERNAME || !DEV_SERVICENOW_PASSWORD) {
  console.error('❌ Missing DEV ServiceNow credentials');
  process.exit(1);
}

console.log(`🔧 Syncing Subcategories to DEV`);
console.log(`🔗 URL: ${DEV_SERVICENOW_URL}\n`);

const auth = Buffer.from(`${DEV_SERVICENOW_USERNAME}:${DEV_SERVICENOW_PASSWORD}`).toString('base64');

// Table name for DEV (from .env.local)
const TABLE_NAME = 'x_mobit_serv_case_service_case';

// All subcategories to create (from add-missing-subcategories.ts + existing ones)
const subcategories = [
  // EHR (23)
  { category: '23', value: 'nextgen_epm', label: 'NextGen EPM', sequence: 33 },
  { category: '23', value: 'nextgen_mobile', label: 'NextGen Mobile', sequence: 32 },

  // User Account Management (17)
  { category: '17', value: 'new_access_request', label: 'New Access Request', sequence: 52 },
  { category: '17', value: 'permission_change', label: 'Permission Change', sequence: 53 },
  { category: '17', value: 'role_change', label: 'Role Change', sequence: 54 },
  { category: '17', value: 'password_reset', label: 'Password Reset', sequence: 55 },
  { category: '17', value: 'unlock_account', label: 'Unlock Account', sequence: 56 },

  // Hardware issue (12)
  { category: '12', value: 'desktop_request', label: 'Desktop Request', sequence: 80 },
  { category: '12', value: 'laptop_request', label: 'Laptop Request', sequence: 81 },
  { category: '12', value: 'monitor_request', label: 'Monitor Request', sequence: 82 },
  { category: '12', value: 'mobile_device_request', label: 'Mobile Device Request', sequence: 83 },
  { category: '12', value: 'peripheral_request', label: 'Peripheral Request', sequence: 84 },

  // Application (13) - Add some common ones
  { category: '13', value: 'software_install', label: 'Software Installation', sequence: 40 },
  { category: '13', value: 'software_update', label: 'Software Update', sequence: 41 },
  { category: '13', value: 'license_request', label: 'License Request', sequence: 42 },

  // Azure (22)
  { category: '22', value: 'azure_vm', label: 'Azure VM', sequence: 70 },
  { category: '22', value: 'azure_storage', label: 'Azure Storage', sequence: 71 },
  { category: '22', value: 'azure_network', label: 'Azure Network', sequence: 72 },

  // Networking (15)
  { category: '15', value: 'firewall_issues', label: 'Firewall Issues', sequence: 60 },
  { category: '15', value: 'vpn_issues', label: 'VPN Issues', sequence: 61 },
  { category: '15', value: 'wifi_issues', label: 'WiFi Issues', sequence: 62 },

  // Exchange (11)
  { category: '11', value: 'new_mailbox', label: 'New Mailbox', sequence: 45 },
  { category: '11', value: 'distribution_list', label: 'Distribution List', sequence: 46 },
  { category: '11', value: 'email_issues', label: 'Email Issues', sequence: 47 },

  // Active Directory (18)
  { category: '18', value: 'ad_account_issues', label: 'AD Account Issues', sequence: 65 },
  { category: '18', value: 'group_membership', label: 'Group Membership', sequence: 66 },

  // Security (19)
  { category: '19', value: 'phishing', label: 'Phishing', sequence: 75 },
  { category: '19', value: 'malware', label: 'Malware', sequence: 76 },
  { category: '19', value: 'security_incident', label: 'Security Incident', sequence: 77 },

  // Printer (14)
  { category: '14', value: 'printer_offline', label: 'Printer Offline', sequence: 50 },
  { category: '14', value: 'print_quality', label: 'Print Quality', sequence: 51 },

  // Citrix (10)
  { category: '10', value: 'citrix_access', label: 'Citrix Access', sequence: 35 },
  { category: '10', value: 'citrix_performance', label: 'Citrix Performance', sequence: 36 },
];

async function createSubcategory(subcat: any) {
  const choiceData = {
    name: TABLE_NAME,
    element: 'subcategory',
    value: subcat.value,
    label: subcat.label,
    sequence: subcat.sequence,
    dependent_value: subcat.category,
    inactive: false,
  };

  try {
    const response = await fetch(
      `${DEV_SERVICENOW_URL}/api/now/table/sys_choice`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(choiceData),
      }
    );

    if (!response.ok) {
      // Check if it already exists
      if (response.status === 400) {
        const error = await response.text();
        if (error.includes('duplicate') || error.includes('unique')) {
          console.log(`  ⚪ Skipped (already exists): ${subcat.label}`);
          return true;
        }
      }
      console.error(`  ❌ Failed: ${subcat.label} - ${response.status}`);
      return false;
    }

    console.log(`  ✅ Created: ${subcat.label} (${subcat.value})`);
    return true;
  } catch (error) {
    console.error(`  ❌ Error creating ${subcat.label}:`, error);
    return false;
  }
}

async function main() {
  console.log('🔧 Creating Subcategories in DEV');
  console.log('='.repeat(60));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  // Group by category for better output
  const byCategory = subcategories.reduce((acc, sub) => {
    if (!acc[sub.category]) acc[sub.category] = [];
    acc[sub.category].push(sub);
    return acc;
  }, {} as Record<string, any[]>);

  for (const [categoryValue, subs] of Object.entries(byCategory)) {
    const categoryName = subs[0].label.split(' ')[0]; // Rough category name
    console.log(`\n📋 Category ${categoryValue}: ${subs.length} subcategories`);

    for (const sub of subs) {
      const result = await createSubcategory(sub);
      if (result === true) {
        if (sub.label.includes('already exists')) {
          skipped++;
        } else {
          created++;
        }
      } else {
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Subcategory Sync Complete!');
  console.log(`\nResults:`);
  console.log(`  ✅ Created: ${created}`);
  console.log(`  ⚪ Skipped: ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);

  console.log('\nNext Steps:');
  console.log('  1. Test catalog items in Service Portal again');
  console.log('  2. Verify subcategory dropdown appears and cascades correctly');
  console.log('  3. Submit test cases to verify category + subcategory are captured');
}

main();
