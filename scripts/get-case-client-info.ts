/**
 * Get Case Client Information
 * Queries ServiceNow for a case and extracts client configuration details
 *
 * Usage:
 *   npx tsx scripts/get-case-client-info.ts <case_number>
 *
 * Example:
 *   npx tsx scripts/get-case-client-info.ts SCS0048833
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing ServiceNow client
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function getCaseClientInfo(caseNumber: string) {
  console.log('🔍 Querying ServiceNow for case:', caseNumber);
  console.log('');

  // Check ServiceNow configuration
  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client is not properly configured');
    console.error('   Please check your .env.local file for:');
    console.error('   - SERVICENOW_URL or SERVICENOW_INSTANCE_URL');
    console.error('   - SERVICENOW_USERNAME and SERVICENOW_PASSWORD (or SERVICENOW_API_TOKEN)');
    process.exit(1);
  }

  try {
    const caseInfo = await serviceNowClient.getCase(caseNumber);

    if (!caseInfo) {
      console.error('❌ Case not found:', caseNumber);
      process.exit(1);
    }

    console.log('✅ Case found!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 CASE INFORMATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Case Number:       ${caseInfo.number}`);
    console.log(`Case Sys ID:       ${caseInfo.sys_id}`);
    console.log(`Short Description: ${caseInfo.short_description || 'N/A'}`);
    console.log(`State:             ${caseInfo.state || 'N/A'}`);
    console.log(`Priority:          ${caseInfo.priority || 'N/A'}`);
    console.log(`Category:          ${caseInfo.category || 'N/A'}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏢 CLIENT INFORMATION (for catalog redirect config)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (caseInfo.company) {
      console.log(`✅ Company (sys_id):  ${caseInfo.company}`);
      if (caseInfo.company_name) {
        console.log(`   Company Name:      ${caseInfo.company_name}`);
      }
    } else {
      console.log('❌ Company:           Not found in case record');
    }

    console.log('');

    if (caseInfo.account) {
      console.log(`✅ Account (sys_id):  ${caseInfo.account}`);
      if (caseInfo.account_name) {
        console.log(`   Account Name:      ${caseInfo.account_name}`);
      }
    } else {
      console.log('❌ Account:           Not found in case record');
    }

    console.log('');

    if (caseInfo.caller_id) {
      console.log(`📧 Submitted By:      ${caseInfo.caller_id}`);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 CONFIGURATION COMMAND');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (caseInfo.company && (caseInfo.account_name || caseInfo.company_name)) {
      const clientName = caseInfo.account_name || caseInfo.company_name || 'Client Name';
      console.log('Run this command to configure catalog redirect:');
      console.log('');
      console.log(`npx tsx scripts/configure-client-catalog-redirect.ts \\`);
      console.log(`  "${caseInfo.company}" \\`);
      console.log(`  "${clientName}" \\`);
      console.log(`  --enabled=true \\`);
      console.log(`  --confidence=0.5 \\`);
      console.log(`  --auto-close=false`);
      console.log('');
    } else {
      console.log('⚠️  Missing required fields (company or account name)');
      console.log('   Cannot generate configuration command');
      console.log('');
      console.log('   Please check the case record in ServiceNow to ensure');
      console.log('   the Company and Account fields are populated.');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Show full description if available (truncated)
    if (caseInfo.description) {
      console.log('');
      console.log('📝 Case Description (first 500 chars):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const desc = caseInfo.description.substring(0, 500);
      console.log(desc);
      if (caseInfo.description.length > 500) {
        console.log('...');
        console.log(`(${caseInfo.description.length - 500} more characters)`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error querying ServiceNow:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const caseNumber = process.argv[2];

if (!caseNumber) {
  console.error('Usage: npx tsx scripts/get-case-client-info.ts <case_number>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/get-case-client-info.ts SCS0048833');
  process.exit(1);
}

getCaseClientInfo(caseNumber);
