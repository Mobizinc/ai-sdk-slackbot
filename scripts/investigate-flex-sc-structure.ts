/**
 * Investigate Flex SC Structure for MSP Multi-Tenant Setup (READ-ONLY)
 *
 * Analyzes the existing "Flex SC" service catalog structure to understand:
 * - What Flex SC is (Business Service, Service Offering, etc.)
 * - Existing Service Offerings and their pattern
 * - How to integrate 6 global Service Offerings
 * - Whether customer-specific offerings should exist
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * Target: Any environment (DEV or PROD)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function investigateFlexSC() {
  console.log('🔍 Investigate Flex SC Structure - MSP Multi-Tenant Analysis');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables (use either PROD or DEV prefix):');
    console.log('  - SERVICENOW_URL or DEV_SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  if (environment === 'PRODUCTION') {
    console.log('⚠️  WARNING: Analyzing PRODUCTION environment');
    console.log('');
  }

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // 1. Find "Flex SC" - What is it?
    // ========================================
    console.log('1. Finding "Flex SC" Record');
    console.log('─'.repeat(70));

    // Try Business Service first
    let flexScQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent('nameLIKEFlex SC')}&sysparm_display_value=all`;
    let flexScResponse = await fetch(flexScQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    let flexScData = await flexScResponse.json();
    let flexSc = flexScData.result && flexScData.result.length > 0 ? flexScData.result[0] : null;
    let flexScTable = 'cmdb_ci_service_business';

    // If not found, try Service Offering
    if (!flexSc) {
      flexScQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent('nameLIKEFlex SC')}&sysparm_display_value=all`;
      flexScResponse = await fetch(flexScQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      flexScData = await flexScResponse.json();
      flexSc = flexScData.result && flexScData.result.length > 0 ? flexScData.result[0] : null;
      flexScTable = 'service_offering';
    }

    // If still not found, try generic service table
    if (!flexSc) {
      flexScQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service?sysparm_query=${encodeURIComponent('nameLIKEFlex SC')}&sysparm_display_value=all`;
      flexScResponse = await fetch(flexScQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      flexScData = await flexScResponse.json();
      flexSc = flexScData.result && flexScData.result.length > 0 ? flexScData.result[0] : null;
      flexScTable = 'cmdb_ci_service';
    }

    if (!flexSc) {
      console.log('❌ "Flex SC" not found in any table');
      console.log('   This might be a display name or reference field value');
      console.log('');
    } else {
      const name = typeof flexSc.name === 'object' ? flexSc.name.display_value : flexSc.name;
      const sysId = typeof flexSc.sys_id === 'object' ? flexSc.sys_id.value : flexSc.sys_id;
      const description = typeof flexSc.short_description === 'object' ? flexSc.short_description.display_value : flexSc.short_description;

      console.log(`✅ Found: "${name}"`);
      console.log(`   Table: ${flexScTable}`);
      console.log(`   sys_id: ${sysId}`);
      console.log(`   Description: ${description || 'None'}`);
      console.log('');
    }

    // ========================================
    // 2. Analyze Service Offerings under "Flex SC"
    // ========================================
    console.log('2. Service Offerings with "Flex SC" as Parent');
    console.log('─'.repeat(70));

    const offeringsQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_display_value=all&sysparm_limit=100`;

    const offeringsResponse = await fetch(offeringsQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!offeringsResponse.ok) {
      throw new Error(`Failed to query service_offering: ${offeringsResponse.status}`);
    }

    const offeringsData = await offeringsResponse.json();
    const allOfferings = offeringsData.result || [];

    // Filter for ones with "Flex SC" as parent (by display value)
    const flexScOfferings = allOfferings.filter((o: any) => {
      const parent = typeof o.parent === 'object' ? o.parent.display_value : o.parent;
      return parent && parent.includes('Flex SC');
    });

    console.log(`Found ${flexScOfferings.length} Service Offering(s) under Flex SC`);
    console.log('');

    // Categorize offerings
    const customerSpecific: any[] = [];
    const potentialGlobal: any[] = [];

    for (const offering of flexScOfferings) {
      const name = typeof offering.name === 'object' ? offering.name.display_value : offering.name;
      const sysId = typeof offering.sys_id === 'object' ? offering.sys_id.value : offering.sys_id;
      const description = typeof offering.short_description === 'object' ? offering.short_description.display_value : offering.short_description;

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Description: ${description || 'None'}`);

      // Categorize
      if (name.includes('Cat Items') || name.includes('Offering') || name.includes('Users')) {
        customerSpecific.push(offering);
        console.log(`    Category: 🏢 Customer-Specific`);
      } else if (name.match(/Standard|Pro|Enterprise/)) {
        potentialGlobal.push(offering);
        console.log(`    Category: 🌐 Potential Global Service Tier`);
      } else {
        customerSpecific.push(offering);
        console.log(`    Category: 🏢 Customer-Specific (assumed)`);
      }

      console.log('');
    }

    // ========================================
    // 3. Check for Existing Global Service Offerings
    // ========================================
    console.log('3. Check for Existing Global Service Offerings');
    console.log('─'.repeat(70));

    const globalOfferingNames = [
      'Application Administration',
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support',
    ];

    const existingGlobal: string[] = [];
    const missingGlobal: string[] = [];

    for (const offeringName of globalOfferingNames) {
      const found = allOfferings.some((o: any) => {
        const name = typeof o.name === 'object' ? o.name.display_value : o.name;
        return name.includes(offeringName);
      });

      if (found) {
        existingGlobal.push(offeringName);
        console.log(`  ✅ ${offeringName} - EXISTS`);
      } else {
        missingGlobal.push(offeringName);
        console.log(`  ❌ ${offeringName} - MISSING`);
      }
    }

    console.log('');

    // ========================================
    // 4. Check for Application Services
    // ========================================
    console.log('4. Application Services for Sample Customers');
    console.log('─'.repeat(70));

    const sampleCustomers = ['Altus', 'AllCare', 'Telgian', 'MHS'];

    for (const customer of sampleCustomers) {
      const asQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`nameLIKE${customer}`)}&sysparm_display_value=all&sysparm_limit=10`;

      const asResponse = await fetch(asQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (asResponse.ok) {
        const asData = await asResponse.json();
        const services = asData.result || [];

        console.log(`  ${customer}: ${services.length} Application Service(s)`);

        for (const service of services) {
          const name = typeof service.name === 'object' ? service.name.display_value : service.name;
          const parent = typeof service.parent === 'object' ? service.parent.display_value : service.parent;
          const company = typeof service.company === 'object' ? service.company.display_value : service.company;

          console.log(`    - ${name}`);
          console.log(`      Parent: ${parent || 'None'}`);
          console.log(`      Company: ${company || 'None'}`);
        }
      }
    }

    console.log('');

    // ========================================
    // Summary & Recommendations
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 ANALYSIS SUMMARY');
    console.log('─'.repeat(70));
    console.log('');

    console.log('Current Structure:');
    console.log(`  Flex SC: ${flexSc ? `✅ Found in ${flexScTable}` : '❌ Not found'}`);
    console.log(`  Service Offerings under Flex SC: ${flexScOfferings.length}`);
    console.log(`    - Customer-Specific: ${customerSpecific.length}`);
    console.log(`    - Potential Global Tiers: ${potentialGlobal.length}`);
    console.log('');

    console.log('Global Service Offerings Status:');
    console.log(`  Existing: ${existingGlobal.length}/${globalOfferingNames.length}`);
    console.log(`  Missing: ${missingGlobal.length}/${globalOfferingNames.length}`);
    console.log('');

    console.log('─'.repeat(70));
    console.log('💡 RECOMMENDATIONS');
    console.log('─'.repeat(70));
    console.log('');

    if (!flexSc || flexScTable !== 'cmdb_ci_service_business') {
      console.log('⚠️  ISSUE: Flex SC should be a Business Service (cmdb_ci_service_business)');
      console.log('   Either:');
      console.log('   1. Flex SC doesn\'t exist - create it as a Business Service');
      console.log('   2. Flex SC is in wrong table - migrate/recreate it');
      console.log('');
    }

    if (missingGlobal.length > 0) {
      console.log('📝 ACTION NEEDED: Create Global Service Offerings');
      console.log('   Create these Service Offerings under Flex SC:');
      for (const offering of missingGlobal) {
        console.log(`   - ${offering}`);
      }
      console.log('');
      console.log('   These will be REUSABLE by all customers (Altus, AllCare, etc.)');
      console.log('');
    }

    if (customerSpecific.length > 0) {
      console.log('🏢 CUSTOMER-SPECIFIC OFFERINGS:');
      console.log('   Review these to determine if they should be:');
      console.log('   1. Kept as-is (if they represent customer catalog wrappers)');
      console.log('   2. Deleted (if they should be replaced by global offerings)');
      console.log('');
      console.log('   Current customer-specific offerings:');
      for (const offering of customerSpecific) {
        const name = typeof offering.name === 'object' ? offering.name.display_value : offering.name;
        console.log(`   - ${name}`);
      }
      console.log('');
    }

    console.log('✅ PROPOSED ARCHITECTURE:');
    console.log('');
    console.log('Flex SC (Business Service)');
    console.log('├── Global Service Offerings (create if missing):');
    console.log('│   ├── Application Administration');
    console.log('│   ├── Infrastructure and Cloud Management');
    console.log('│   ├── Network Management');
    console.log('│   ├── Cybersecurity Management');
    console.log('│   ├── Helpdesk - 24/7');
    console.log('│   └── Helpdesk - Standard Hours');
    console.log('│');
    console.log('└── Application Services (customer-specific):');
    console.log('    ├── Altus Health - NextGen (parent: Application Administration)');
    console.log('    ├── Altus Health - O365 (parent: Infrastructure)');
    console.log('    ├── AllCare - [Service] (parent: [Global Offering])');
    console.log('    └── [Other customers...]');
    console.log('');

    console.log('📋 NEXT STEPS:');
    console.log('');
    console.log('1. Verify "Flex SC" is a Business Service');
    console.log(`   ${flexSc && flexScTable === 'cmdb_ci_service_business' ? '✅ Already correct' : '⚠️  Needs creation/migration'}`);
    console.log('');
    console.log('2. Create missing global Service Offerings under Flex SC');
    console.log(`   Missing: ${missingGlobal.join(', ')}`);
    console.log('');
    console.log('3. Delete/Review customer-specific Service Offerings');
    console.log('   Specifically: "Altus Community Healthcare" Service Offering');
    console.log('   (Should be replaced with Application Services linking to global offerings)');
    console.log('');
    console.log('4. Create Altus Application Services with:');
    console.log('   - parent: [Global Service Offering]');
    console.log('   - company: Altus Community Healthcare (ACCT0010145)');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Investigation failed:');
    console.error(error);
    process.exit(1);
  }
}

investigateFlexSC()
  .catch(console.error)
  .finally(() => process.exit(0));
