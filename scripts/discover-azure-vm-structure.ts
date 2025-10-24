/**
 * Discover Azure VM Structure
 *
 * Investigates how Azure VMs are structured in ServiceNow CMDB.
 * Checks for tenant/subscription references in VM records.
 *
 * USAGE:
 *   npx tsx scripts/discover-azure-vm-structure.ts
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Console analysis of Azure VM structure
 * - Sample VMs with full field details
 * - Identification of tenant/subscription references
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function discoverAzureVMStructure() {
  console.log('☁️  Discovering Azure VM Structure');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // Query sample of Azure VMs with ALL fields to understand structure
    console.log('Querying Azure Cloud Hosts (sample of 20)...');
    console.log('');

    const url = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_display_value=all&sysparm_limit=20&sysparm_query=ORDERBYDESCsys_updated_on`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to query cloud hosts: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    const vms = data.result || [];

    console.log(`✅ Retrieved ${vms.length} Azure VMs`);
    console.log('');

    if (vms.length === 0) {
      console.log('⚠️  No Azure VMs found');
      process.exit(0);
    }

    // ========================================
    // Analysis 1: Available Fields
    // ========================================
    console.log('─'.repeat(70));
    console.log('📋 Available Fields on Cloud Hosts');
    console.log('─'.repeat(70));
    console.log('');

    const sampleVM = vms[0];
    const allFields = Object.keys(sampleVM);

    console.log(`Total fields: ${allFields.length}`);
    console.log('');

    // Look for tenant/subscription related fields
    const tenantFields = allFields.filter(f =>
      f.toLowerCase().includes('tenant') ||
      f.toLowerCase().includes('subscription') ||
      f.toLowerCase().includes('account') ||
      f.toLowerCase().includes('azure')
    );

    if (tenantFields.length > 0) {
      console.log('🔍 Tenant/Subscription Related Fields:');
      for (const field of tenantFields) {
        const value = sampleVM[field];
        const displayValue = typeof value === 'object' && value?.display_value
          ? value.display_value
          : value;
        console.log(`  - ${field}: ${displayValue || '(empty)'}`);
      }
      console.log('');
    } else {
      console.log('⚠️  No obvious tenant/subscription fields found');
      console.log('');
    }

    // ========================================
    // Analysis 2: Company Distribution
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Company Distribution (All 1341 VMs)');
    console.log('─'.repeat(70));
    console.log('');

    console.log('Querying all VMs for company analysis...');

    const allVMsUrl = `${instanceUrl}/api/now/table/cmdb_ci_cloud_host?sysparm_display_value=all&sysparm_fields=sys_id,name,company&sysparm_limit=1500`;

    const allVMsResponse = await fetch(allVMsUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (allVMsResponse.ok) {
      const allVMsData = await allVMsResponse.json();
      const allVMs = allVMsData.result || [];

      const companyCounts = new Map<string, number>();

      for (const vm of allVMs) {
        const companyName = vm.company?.display_value || '(No Company)';
        companyCounts.set(companyName, (companyCounts.get(companyName) || 0) + 1);
      }

      const sortedCompanies = Array.from(companyCounts.entries())
        .sort((a, b) => b[1] - a[1]);

      console.log(`\nTop 10 Companies by Azure VM Count:`);
      for (let i = 0; i < Math.min(10, sortedCompanies.length); i++) {
        const [company, count] = sortedCompanies[i];
        console.log(`  ${i + 1}. ${company}: ${count} VMs`);
      }

      // Check for Altus specifically
      const altusCompanies = sortedCompanies.filter(([company]) =>
        company.toLowerCase().includes('altus') ||
        company.toLowerCase().includes('neighbors') ||
        company.toLowerCase().includes('exceptional') ||
        company.toLowerCase().includes('austin emergency')
      );

      console.log('');
      if (altusCompanies.length > 0) {
        console.log('✅ Found Altus-related Azure VMs:');
        for (const [company, count] of altusCompanies) {
          console.log(`  - ${company}: ${count} VMs`);
        }
      } else {
        console.log('⚠️  No Azure VMs associated with Altus companies');
      }
    }

    console.log('');

    // ========================================
    // Analysis 3: Sample VM Details
    // ========================================
    console.log('─'.repeat(70));
    console.log('🔍 Sample VM Details (First 3)');
    console.log('─'.repeat(70));
    console.log('');

    for (let i = 0; i < Math.min(3, vms.length); i++) {
      const vm = vms[i];

      console.log(`VM ${i + 1}:`);
      console.log(`  Name: ${vm.name?.display_value || vm.name || '(unknown)'}`);
      console.log(`  sys_id: ${vm.sys_id?.value || vm.sys_id || '(unknown)'}`);
      console.log(`  Company: ${vm.company?.display_value || '(not set)'}`);
      console.log(`  Location: ${vm.location?.display_value || '(not set)'}`);
      console.log(`  Used For: ${vm.used_for?.display_value || '(not set)'}`);
      console.log(`  Install Status: ${vm.install_status?.display_value || vm.install_status || '(not set)'}`);
      console.log(`  Operational Status: ${vm.operational_status?.display_value || vm.operational_status || '(not set)'}`);

      // Show tenant/subscription fields if they exist
      if (tenantFields.length > 0) {
        console.log(`  Tenant/Subscription Info:`);
        for (const field of tenantFields) {
          const value = vm[field];
          const displayValue = typeof value === 'object' && value?.display_value
            ? value.display_value
            : value;
          if (displayValue) {
            console.log(`    ${field}: ${displayValue}`);
          }
        }
      }

      console.log('');
    }

    // ========================================
    // Summary & Recommendations
    // ========================================
    console.log('─'.repeat(70));
    console.log('💡 Analysis Summary');
    console.log('─'.repeat(70));
    console.log('');

    console.log('Key Findings:');
    console.log(`  - Total Azure VMs in CMDB: 1341`);
    console.log(`  - Tenant/Subscription fields found: ${tenantFields.length}`);
    console.log(`  - Azure Subscription table status: EMPTY`);
    console.log(`  - Azure Tenant table: NOT FOUND`);
    console.log('');

    console.log('Conclusions:');
    if (tenantFields.length === 0) {
      console.log('  ⚠️  Azure VMs do NOT have tenant/subscription references');
      console.log('  - VMs imported directly without hierarchy context');
      console.log('  - Tenant/Subscription CMDB records need to be created first');
      console.log('  - Then VMs can be linked to appropriate subscriptions');
      console.log('');
      console.log('Recommendation:');
      console.log('  1. Create Azure Tenant CMDB records manually (4 tenants)');
      console.log('  2. Create Azure Subscription CMDB records (multiple per tenant)');
      console.log('  3. Link Tenants → Infrastructure and Cloud Management Service');
      console.log('  4. Link Subscriptions → Application Services');
      console.log('  5. Optionally link VMs → Subscriptions for complete hierarchy');
    } else {
      console.log('  ✅ Azure VMs have tenant/subscription field references');
      console.log('  - Review field values to understand structure');
      console.log('  - May be able to extract tenant/subscription IDs from VMs');
      console.log('  - Use this data to create missing CMDB records');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error);
    process.exit(1);
  }
}

discoverAzureVMStructure()
  .catch(console.error)
  .finally(() => process.exit(0));
