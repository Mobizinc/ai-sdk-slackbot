/**
 * Find Altus Company ID from ServiceNow
 * This script helps identify the correct company sys_id for Altus
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function findAltusCompanyId() {
  console.log('🔍 FINDING ALTUS COMPANY ID');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    process.exit(1);
  }

  // Method 1: Get from case SCS0049613
  console.log('📋 Method 1: Checking case SCS0049613 for company field');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  try {
    const caseData = await serviceNowClient.getCaseBySysId('3d0e40a9833c3a10185f7000feaad345');

    if (caseData) {
      console.log('Case Data Retrieved:');
      console.log(`  Case Number:     ${caseData.number}`);
      console.log(`  Short Desc:      ${caseData.short_description}`);
      console.log(`  Submitted By:    ${caseData.submitted_by}`);
      console.log('');

      // Check for company/account fields
      const caseRaw = caseData as any;
      console.log('Company/Account Fields:');
      console.log(`  company:         ${caseRaw.company || '(not found)'}`);
      console.log(`  account:         ${caseRaw.account || '(not found)'}`);
      console.log(`  company_name:    ${caseRaw.company_name || '(not found)'}`);
      console.log(`  account_name:    ${caseRaw.account_name || '(not found)'}`);
      console.log('');

      if (caseRaw.company) {
        console.log('✅ FOUND COMPANY ID: ' + caseRaw.company);
        console.log('');
      } else if (caseRaw.account) {
        console.log('✅ FOUND ACCOUNT ID: ' + caseRaw.account);
        console.log('');
      }
    }
  } catch (error) {
    console.error('❌ Error fetching case:', error);
  }

  // Method 2: Search for companies with "Altus" in name
  console.log('📋 Method 2: Searching for companies matching "Altus"');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  try {
    // ServiceNow companies are typically in core_company or customer_account table
    const response = await fetch(
      `${process.env.SERVICENOW_URL}/api/now/table/core_company?sysparm_query=nameLIKEAltus&sysparm_display_value=all&sysparm_limit=10`,
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        console.log(`Found ${data.result.length} companies matching "Altus":`);
        console.log('');
        data.result.forEach((company: any, i: number) => {
          console.log(`${i + 1}. ${company.name?.display_value || company.name}`);
          console.log(`   Sys ID: ${company.sys_id?.display_value || company.sys_id}`);
          console.log(`   Active: ${company.active?.display_value || company.active}`);
          console.log('');
        });

        console.log('✅ Use one of the sys_id values above for Altus configuration');
        console.log('');
      } else {
        console.log('❌ No companies found matching "Altus"');
        console.log('');
      }
    } else {
      console.log('⚠️  Could not search core_company table');
      console.log(`   HTTP ${response.status}: ${await response.text()}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error searching companies:', error);
    console.log('');
  }

  // Method 3: Try customer_account table
  console.log('📋 Method 3: Searching customer_account table');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  try {
    const response = await fetch(
      `${process.env.SERVICENOW_URL}/api/now/table/customer_account?sysparm_query=nameLIKEAltus&sysparm_display_value=all&sysparm_limit=10`,
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        console.log(`Found ${data.result.length} customer accounts matching "Altus":`);
        console.log('');
        data.result.forEach((account: any, i: number) => {
          console.log(`${i + 1}. ${account.name?.display_value || account.name}`);
          console.log(`   Sys ID: ${account.sys_id?.display_value || account.sys_id}`);
          console.log(`   Active: ${account.active?.display_value || account.active}`);
          console.log(`   Number: ${account.number?.display_value || account.number || '(none)'}`);
          console.log('');
        });

        console.log('✅ Use one of the sys_id values above for Altus configuration');
        console.log('');
      } else {
        console.log('❌ No customer accounts found matching "Altus"');
        console.log('');
      }
    } else {
      console.log('⚠️  Could not search customer_account table');
      console.log(`   HTTP ${response.status}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error searching customer accounts:', error);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📝 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('1. Copy the Altus sys_id from one of the results above');
  console.log('2. Use it in the setup script:');
  console.log('   Edit scripts/setup-altus-catalog-redirect.ts');
  console.log('   Replace ALTUS_COMPANY_SYS_ID with the actual sys_id');
  console.log('');
  console.log('3. Or manually query ServiceNow:');
  console.log('   - Open case SCS0049613 in ServiceNow');
  console.log('   - Look for Company or Account field');
  console.log('   - Copy the sys_id value');
  console.log('');
}

findAltusCompanyId().catch(console.error);
