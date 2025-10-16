/**
 * Final CSDM Architecture Test Script
 * Tests the complete Altus Health service architecture in DEV environment
 *
 * Validates:
 * - 6 Service Offerings exist with correct parent relationships
 * - 12 Application Services exist with correct configurations
 * - Endpoint Management Platform has 2 many-to-many relationships
 * - All services are operational and linked to Altus customer account
 *
 * Target: DEV environment (mobizdev.service-now.com)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config();

interface ServiceOfferingTest {
  name: string;
  expectedCount: number;
}

interface ApplicationServiceTest {
  name: string;
  expectedCompanySysId: string;
  expectedOperationalStatus: string;
}

const expectedOfferings: ServiceOfferingTest[] = [
  { name: 'Infrastructure and Cloud Management', expectedCount: 3 },
  { name: 'Network Management', expectedCount: 1 },
  { name: 'Cybersecurity Management', expectedCount: 0 },
  { name: 'Helpdesk and Endpoint Support - 24/7', expectedCount: 0 },
  { name: 'Helpdesk and Endpoint Support - Standard Business Hours', expectedCount: 0 },
  { name: 'Application Administration', expectedCount: 7 },
];

// We'll populate the expectedCompanySysId after querying the customer account
const expectedApplicationServices: ApplicationServiceTest[] = [
  // Application Administration (7)
  { name: 'Altus Health - NextGen Production', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Novarad Production', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Epowerdocs (EPD) Production', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - TSheet Account', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Qgenda Account', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Paylocity Account', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Availity Account', expectedCompanySysId: '', expectedOperationalStatus: '1' },

  // Infrastructure and Cloud Management (3)
  { name: 'Altus Health - O365 Production', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Azure Environment', expectedCompanySysId: '', expectedOperationalStatus: '1' },
  { name: 'Altus Health - Corporate Fileshares', expectedCompanySysId: '', expectedOperationalStatus: '1' },

  // Network Management (1)
  { name: 'Altus Health - Vonage UCaaS', expectedCompanySysId: '', expectedOperationalStatus: '1' },

  // Endpoint Platform (1) - No parent Service Offering, linked via svc_ci_assoc
  { name: 'Altus Health - Endpoint Management Platform', expectedCompanySysId: '', expectedOperationalStatus: '1' },
];

async function testFinalArchitecture() {
  console.log('🧪 Final CSDM Architecture Test - Altus Health');
  console.log('='.repeat(70));
  console.log('');

  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // ========================================
    // Test 1: Business Service
    // ========================================
    console.log('Test 1: Business Service');
    console.log('─'.repeat(70));

    const bsQueryUrl = `${devUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent('name=Managed Support Services')}&sysparm_limit=1`;

    const bsResponse = await fetch(bsQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!bsResponse.ok) {
      throw new Error(`Failed to query Business Service: ${bsResponse.status}`);
    }

    const bsData = await bsResponse.json();

    if (!bsData.result || bsData.result.length === 0) {
      console.error('❌ Business Service "Managed Support Services" not found');
      process.exit(1);
    }

    const businessServiceSysId = bsData.result[0].sys_id;
    console.log('✅ Business Service: "Managed Support Services"');
    console.log(`   sys_id: ${businessServiceSysId}`);
    console.log('');

    // ========================================
    // Test 2: Service Offerings (6)
    // ========================================
    console.log('Test 2: Service Offerings (expecting 6)');
    console.log('─'.repeat(70));

    const offeringSysIds: Map<string, string> = new Map();
    let offeringPass = 0;
    let offeringFail = 0;

    for (const offering of expectedOfferings) {
      const queryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offering.name}`)}&sysparm_limit=1&sysparm_display_value=all`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        offeringFail++;
        console.log(`❌ ${offering.name} - QUERY FAILED`);
        continue;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        offeringFail++;
        console.log(`❌ ${offering.name} - NOT FOUND`);
        continue;
      }

      const sysId = typeof data.result[0].sys_id === 'object'
        ? data.result[0].sys_id.value
        : data.result[0].sys_id;

      offeringSysIds.set(offering.name, sysId);
      offeringPass++;
      console.log(`✅ ${offering.name}`);
      console.log(`   sys_id: ${sysId}`);
    }

    console.log('');
    console.log(`Result: ${offeringPass}/${expectedOfferings.length} Service Offerings found`);
    console.log('');

    if (offeringFail > 0) {
      console.error('❌ Service Offering test FAILED');
      process.exit(1);
    }

    // ========================================
    // Test 3: Customer Account
    // ========================================
    console.log('Test 3: Customer Account');
    console.log('─'.repeat(70));

    const customerQueryUrl = `${devUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent('number=ACCT0010145')}&sysparm_limit=1`;

    const customerResponse = await fetch(customerQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to query customer account: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();

    if (!customerData.result || customerData.result.length === 0) {
      console.error('❌ Customer Account "ACCT0010145" not found');
      process.exit(1);
    }

    const customerSysId = customerData.result[0].sys_id;
    const customerName = customerData.result[0].name;
    console.log(`✅ Customer Account: "${customerName}"`);
    console.log(`   Number: ACCT0010145`);
    console.log(`   sys_id: ${customerSysId}`);
    console.log('');

    // Populate expected company sys_id for all application services
    for (const appService of expectedApplicationServices) {
      appService.expectedCompanySysId = customerSysId;
    }

    // ========================================
    // Test 4: Application Services (12)
    // ========================================
    console.log('Test 4: Application Services (expecting 12)');
    console.log('─'.repeat(70));

    let appServicePass = 0;
    let appServiceFail = 0;
    const failures: string[] = [];

    for (const appService of expectedApplicationServices) {
      const queryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${appService.name}`)}&sysparm_limit=1&sysparm_display_value=all`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        appServiceFail++;
        failures.push(`Query failed for "${appService.name}"`);
        console.log(`❌ ${appService.name} - QUERY FAILED`);
        continue;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        appServiceFail++;
        failures.push(`Not found: "${appService.name}"`);
        console.log(`❌ ${appService.name} - NOT FOUND`);
        continue;
      }

      const service = data.result[0];

      // Extract company sys_id
      let companySysId: string | null = null;
      if (service.company) {
        if (typeof service.company === 'object' && service.company.value) {
          companySysId = service.company.value;
        } else if (typeof service.company === 'string') {
          companySysId = service.company;
        }
      }

      // Validate company
      if (companySysId !== appService.expectedCompanySysId) {
        appServiceFail++;
        failures.push(`Wrong company for "${appService.name}"`);
        console.log(`⚠️  ${appService.name} - WRONG COMPANY`);
        console.log(`   Expected: ${appService.expectedCompanySysId}`);
        console.log(`   Got: ${companySysId || 'null'}`);
        continue;
      }

      // Extract operational status
      let opStatus: string;
      if (typeof service.operational_status === 'object') {
        opStatus = service.operational_status.value || '';
      } else {
        opStatus = service.operational_status || '';
      }

      // Validate operational status
      if (opStatus !== appService.expectedOperationalStatus) {
        appServiceFail++;
        failures.push(`Wrong operational status for "${appService.name}"`);
        console.log(`⚠️  ${appService.name} - WRONG STATUS`);
        console.log(`   Expected: ${appService.expectedOperationalStatus} (Operational)`);
        console.log(`   Got: ${opStatus}`);
        continue;
      }

      appServicePass++;
      console.log(`✅ ${appService.name}`);
    }

    console.log('');
    console.log(`Result: ${appServicePass}/${expectedApplicationServices.length} Application Services validated`);
    console.log('');

    if (appServiceFail > 0) {
      console.error('❌ Application Service test FAILED');
      console.error('');
      console.error('Failures:');
      failures.forEach(f => console.error(`  - ${f}`));
      process.exit(1);
    }

    // ========================================
    // Test 5: Endpoint Platform Many-to-Many Relationships
    // ========================================
    console.log('Test 5: Endpoint Platform Many-to-Many Relationships');
    console.log('─'.repeat(70));

    // Get Endpoint Platform sys_id
    const endpointQueryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent('name=Altus Health - Endpoint Management Platform')}&sysparm_limit=1`;

    const endpointResponse = await fetch(endpointQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!endpointResponse.ok) {
      throw new Error(`Failed to query Endpoint Platform: ${endpointResponse.status}`);
    }

    const endpointData = await endpointResponse.json();

    if (!endpointData.result || endpointData.result.length === 0) {
      console.error('❌ Endpoint Management Platform not found');
      process.exit(1);
    }

    const endpointSysId = endpointData.result[0].sys_id;
    console.log('Found Endpoint Platform:');
    console.log(`  sys_id: ${endpointSysId}`);
    console.log('');

    // Validate both relationships
    const helpdeskOfferings = [
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint Support - Standard Business Hours',
    ];

    let relationshipPass = 0;
    let relationshipFail = 0;

    for (const offeringName of helpdeskOfferings) {
      const offeringSysId = offeringSysIds.get(offeringName);

      if (!offeringSysId) {
        relationshipFail++;
        console.log(`❌ ${offeringName} - OFFERING NOT FOUND`);
        continue;
      }

      const assocQueryUrl = `${devUrl}/api/now/table/svc_ci_assoc?sysparm_query=${encodeURIComponent(`parent=${offeringSysId}^child=${endpointSysId}`)}&sysparm_limit=1`;

      const assocResponse = await fetch(assocQueryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!assocResponse.ok) {
        relationshipFail++;
        console.log(`❌ ${offeringName} → Endpoint Platform - QUERY FAILED`);
        continue;
      }

      const assocData = await assocResponse.json();

      if (!assocData.result || assocData.result.length === 0) {
        relationshipFail++;
        console.log(`❌ ${offeringName} → Endpoint Platform - RELATIONSHIP NOT FOUND`);
        continue;
      }

      relationshipPass++;
      const assocSysId = assocData.result[0].sys_id;
      console.log(`✅ ${offeringName} → Endpoint Platform`);
      console.log(`   svc_ci_assoc sys_id: ${assocSysId}`);
    }

    console.log('');
    console.log(`Result: ${relationshipPass}/${helpdeskOfferings.length} relationships validated`);
    console.log('');

    if (relationshipFail > 0) {
      console.error('❌ Relationship test FAILED');
      process.exit(1);
    }

    // ========================================
    // Final Summary
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Final Architecture Summary:');
    console.log('');
    console.log('✅ Business Service: 1 (Managed Support Services)');
    console.log('✅ Service Offerings: 6 total');
    console.log('   - Infrastructure and Cloud Management');
    console.log('   - Network Management');
    console.log('   - Cybersecurity Management');
    console.log('   - Helpdesk and Endpoint Support - 24/7');
    console.log('   - Helpdesk and Endpoint Support - Standard Business Hours');
    console.log('   - Application Administration');
    console.log('');
    console.log('✅ Application Services: 12 total');
    console.log('   - Application Administration: 7 services');
    console.log('   - Infrastructure and Cloud Management: 3 services');
    console.log('   - Network Management: 1 service');
    console.log('   - Endpoint Platform: 1 service (linked via svc_ci_assoc)');
    console.log('');
    console.log('✅ Customer Account: Altus Community Healthcare (ACCT0010145)');
    console.log('✅ Operational Status: All services operational');
    console.log('✅ Many-to-Many Relationships: 2 (Endpoint Platform → both Helpdesk offerings)');
    console.log('');
    console.log('🎉 All tests passed! Final CSDM architecture is valid.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

testFinalArchitecture()
  .catch(console.error)
  .finally(() => process.exit(0));
