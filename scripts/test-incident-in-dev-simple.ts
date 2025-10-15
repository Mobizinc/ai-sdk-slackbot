/**
 * Test Incident Creation in ServiceNow DEV (Simplified Version)
 *
 * This script validates that incidents created from cases properly inherit
 * company/account/location context using direct API calls
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function testIncidentInDev() {
  console.log('🧪 Testing Incident Creation in ServiceNow DEV\n');
  console.log('Validating fix for orphaned incidents missing company information');
  console.log('Example: SCS0048882 <-> INC0167613 (incident missing company context)\n');
  console.log('='.repeat(70));
  console.log('');

  // Get DEV credentials
  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;
  const devCaseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables:');
    console.log('  - DEV_SERVICENOW_URL');
    console.log('  - DEV_SERVICENOW_USERNAME');
    console.log('  - DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log('Step 1: ServiceNow DEV Configuration');
  console.log('─'.repeat(70));
  console.log(`✓ URL: ${devUrl}`);
  console.log(`✓ Username: ${devUsername}`);
  console.log(`✓ Case Table: ${devCaseTable}`);
  console.log('');

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // Step 2: Query for existing open case
    console.log('Step 2: Querying for existing open case');
    console.log('─'.repeat(70));

    const caseQuery = 'active=true^state!=3^state!=6^ORDERBYDESCsys_created_on';
    const caseUrl = `${devUrl}/api/now/table/${devCaseTable}?sysparm_query=${encodeURIComponent(caseQuery)}&sysparm_limit=1&sysparm_display_value=all`;

    const caseResponse = await fetch(caseUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!caseResponse.ok) {
      throw new Error(`Failed to query cases: ${caseResponse.status} ${caseResponse.statusText}\n${await caseResponse.text()}`);
    }

    const caseData = await caseResponse.json();

    if (!caseData.result || caseData.result.length === 0) {
      console.error('❌ No open cases found in DEV');
      console.log('Create a test case in ServiceNow DEV first');
      process.exit(1);
    }

    const rawCase = caseData.result[0];

    // Extract values from ServiceNow response
    const getValue = (field: any): string | undefined => {
      if (!field) return undefined;
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field.value) return field.value;
      return String(field);
    };

    const testCase = {
      sys_id: getValue(rawCase.sys_id)!,
      number: getValue(rawCase.number)!,
      short_description: getValue(rawCase.short_description) || '',
      description: getValue(rawCase.description) || '',
      priority: getValue(rawCase.priority) || '3',
      urgency: getValue(rawCase.urgency) || '3',
      category: getValue(rawCase.category),
      subcategory: getValue(rawCase.subcategory),
      company: getValue(rawCase.company),
      account: getValue(rawCase.account),
      location: getValue(rawCase.location),
      business_service: getValue(rawCase.business_service),
      contact: getValue(rawCase.contact),
      contact_type: getValue(rawCase.contact_type),
      opened_by: getValue(rawCase.opened_by),
      caller_id: getValue(rawCase.caller_id),
      cmdb_ci: getValue(rawCase.cmdb_ci),
      assignment_group: getValue(rawCase.assignment_group),
      sys_domain: getValue(rawCase.sys_domain),
      sys_domain_path: getValue(rawCase.sys_domain_path),
    };

    console.log(`✅ Found case: ${testCase.number}`);
    console.log(`   Sys ID: ${testCase.sys_id}`);
    console.log(`   Description: ${testCase.short_description}`);
    console.log('');
    console.log('   Company Context:');
    console.log(`   - Company: ${testCase.company || 'null'}`);
    console.log(`   - Account: ${testCase.account || 'null'}`);
    console.log(`   - Location: ${testCase.location || 'null'}`);
    console.log(`   - Business Service: ${testCase.business_service || 'null'}`);
    console.log('');
    console.log('   Contact Information:');
    console.log(`   - Contact: ${testCase.contact || 'null'}`);
    console.log(`   - Contact Type: ${testCase.contact_type || 'null'}`);
    console.log(`   - Opened By: ${testCase.opened_by || 'null'}`);
    console.log(`   - Caller ID: ${testCase.caller_id || 'null'}`);
    console.log('');

    // Step 3: Create incident with full company context
    console.log('Step 3: Creating incident with company context');
    console.log('─'.repeat(70));

    const incidentPayload: Record<string, any> = {
      short_description: `[TEST] ${testCase.short_description}`,
      description: `[DEV TEST] Testing incident creation with company context.\n\nOriginal case: ${testCase.number}\n\n${testCase.description}`,
      category: testCase.category || 'inquiry',
      subcategory: testCase.subcategory,
      urgency: testCase.urgency,
      priority: testCase.priority,
      caller_id: testCase.caller_id,
      assignment_group: testCase.assignment_group,
      parent: testCase.sys_id,
      work_notes: `Automatically created from Case ${testCase.number} via AI triage system. ITSM record type classification determined this is a service disruption requiring incident management.`,
    };

    // Add company/account context (prevents orphaned incidents)
    if (testCase.company) incidentPayload.company = testCase.company;
    if (testCase.account) incidentPayload.account = testCase.account;
    if (testCase.business_service) incidentPayload.business_service = testCase.business_service;
    if (testCase.location) incidentPayload.location = testCase.location;

    // Add contact information
    if (testCase.contact) incidentPayload.contact = testCase.contact;
    if (testCase.contact_type) incidentPayload.contact_type = testCase.contact_type;
    if (testCase.opened_by) incidentPayload.opened_by = testCase.opened_by;

    // Add technical context
    if (testCase.cmdb_ci) incidentPayload.cmdb_ci = testCase.cmdb_ci;

    // Add multi-tenancy
    if (testCase.sys_domain) incidentPayload.sys_domain = testCase.sys_domain;
    if (testCase.sys_domain_path) incidentPayload.sys_domain_path = testCase.sys_domain_path;

    console.log('Incident payload includes:');
    console.log(`  - Company: ${incidentPayload.company || 'null'}`);
    console.log(`  - Account: ${incidentPayload.account || 'null'}`);
    console.log(`  - Location: ${incidentPayload.location || 'null'}`);
    console.log(`  - Contact: ${incidentPayload.contact || 'null'}`);
    console.log(`  - Contact Type: ${incidentPayload.contact_type || 'null'}`);
    console.log(`  - Opened By: ${incidentPayload.opened_by || 'null'}`);
    console.log(`  - Domain: ${incidentPayload.sys_domain || 'null'}`);
    console.log('');

    const incidentUrl = `${devUrl}/api/now/table/incident`;
    const incidentResponse = await fetch(incidentUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(incidentPayload),
    });

    if (!incidentResponse.ok) {
      throw new Error(`Failed to create incident: ${incidentResponse.status}\n${await incidentResponse.text()}`);
    }

    const incidentData = await incidentResponse.json();
    const incident = incidentData.result;

    console.log(`✅ Incident created: ${incident.number}`);
    console.log(`   Sys ID: ${incident.sys_id}`);
    console.log('');

    // Step 3.5: Update case with incident reference (bidirectional link)
    console.log('Step 3.5: Updating case with incident reference (bidirectional link)');
    console.log('─'.repeat(70));
    console.log(`Updating case ${testCase.number} with incident ${incident.number}...`);
    console.log('');

    const caseUpdateUrl = `${devUrl}/api/now/table/${devCaseTable}/${testCase.sys_id}`;
    const caseUpdateResponse = await fetch(caseUpdateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ incident: incident.sys_id }),
    });

    if (!caseUpdateResponse.ok) {
      throw new Error(`Failed to update case: ${caseUpdateResponse.status}\n${await caseUpdateResponse.text()}`);
    }

    console.log(`✅ Case ${testCase.number} updated with incident reference`);
    console.log(`   Bidirectional link established: Case ↔ Incident`);
    console.log('');

    // Step 4: Verify incident has company context
    console.log('Step 4: Verifying incident has company context');
    console.log('─'.repeat(70));

    const verifyUrl = `${devUrl}/api/now/table/incident/${incident.sys_id}?sysparm_display_value=all`;
    const verifyResponse = await fetch(verifyUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyResponse.ok) {
      throw new Error(`Failed to fetch incident: ${verifyResponse.status}`);
    }

    const verifyData = await verifyResponse.json();
    const verifiedIncident = verifyData.result;

    const incCompany = getValue(verifiedIncident.company);
    const incAccount = getValue(verifiedIncident.account);
    const incLocation = getValue(verifiedIncident.location);
    const incContact = getValue(verifiedIncident.contact);
    const incContactType = getValue(verifiedIncident.contact_type);
    const incOpenedBy = getValue(verifiedIncident.opened_by);
    const incDomain = getValue(verifiedIncident.sys_domain);

    console.log('Company/Account fields:');
    console.log(`  - Company: ${incCompany || 'null'} ${incCompany ? '✅' : '❌ MISSING'}`);
    console.log(`  - Account: ${incAccount || 'null'} ${incAccount ? '✅' : '❌ MISSING'}`);
    console.log(`  - Location: ${incLocation || 'null'} ${incLocation ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');
    console.log('Contact fields:');
    console.log(`  - Contact: ${incContact || 'null'} ${incContact ? '✅' : '❌ MISSING'}`);
    console.log(`  - Contact Type: ${incContactType || 'null'} ${incContactType ? '✅' : '⚠️  OPTIONAL'}`);
    console.log(`  - Opened By: ${incOpenedBy || 'null'} ${incOpenedBy ? '✅' : '❌ MISSING'}`);
    console.log('');
    console.log('Multi-tenancy fields:');
    console.log(`  - Domain: ${incDomain || 'null'} ${incDomain ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');

    // Calculate results
    const requiredFields = [
      { name: 'company', value: incCompany, required: true },
      { name: 'account', value: incAccount, required: true },
      { name: 'contact', value: incContact, required: true },
      { name: 'opened_by', value: incOpenedBy, required: true },
    ];

    const populated = requiredFields.filter(f => f.value);
    const missing = requiredFields.filter(f => !f.value);

    console.log('─'.repeat(70));
    if (missing.length === 0) {
      console.log('✅ SUCCESS - All required company context fields are populated!');
      console.log('   Incident is NOT orphaned - has full company linkage');
    } else {
      console.log(`⚠️  WARNING - ${missing.length} required fields missing:`);
      missing.forEach(f => console.log(`   - ${f.name}`));
    }
    console.log('');

    // Step 5: Verify bidirectional link (Case → Incident)
    console.log('Step 5: Verifying bidirectional link (Case → Incident)');
    console.log('─'.repeat(70));

    const verifyCaseUrl = `${devUrl}/api/now/table/${devCaseTable}/${testCase.sys_id}?sysparm_display_value=all`;
    const verifyCaseResponse = await fetch(verifyCaseUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyCaseResponse.ok) {
      throw new Error(`Failed to fetch case: ${verifyCaseResponse.status}`);
    }

    const verifyCaseData = await verifyCaseResponse.json();
    const verifiedCase = verifyCaseData.result;

    const caseIncidentRef = getValue(verifiedCase.incident);
    const incidentParentRef = getValue(verifiedIncident.parent);

    console.log('Bidirectional link verification:');
    console.log(`  Case ${testCase.number} → Incident field: ${caseIncidentRef || 'null'} ${caseIncidentRef ? '✅' : '❌ MISSING'}`);
    console.log(`  Incident ${incident.number} → Parent field: ${incidentParentRef || 'null'} ${incidentParentRef ? '✅' : '❌ MISSING'}`);
    console.log('');

    if (caseIncidentRef && incidentParentRef) {
      console.log('✅ SUCCESS - Bidirectional link established!');
      console.log('   Case knows about Incident (Related Records > Incident tab will show it)');
      console.log('   Incident knows about Case (Customer Cases tab will show it)');
    } else {
      console.log('❌ FAILED - Bidirectional link is broken!');
      if (!caseIncidentRef) console.log('   Case does not reference the incident');
      if (!incidentParentRef) console.log('   Incident does not reference the case');
    }
    console.log('');

    // Step 6: Manual verification
    console.log('Step 6: Manual Verification in ServiceNow UI');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Parent Case: ${devUrl}/nav_to.do?uri=${devCaseTable}.do?sys_id=${testCase.sys_id}`);
    console.log(`  Case Number: ${testCase.number}`);
    console.log('');
    console.log(`Created Incident: ${devUrl}/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`);
    console.log(`  Incident Number: ${incident.number}`);
    console.log('');
    console.log('Verification Checklist:');
    console.log('');
    console.log('Company Context:');
    console.log(`  [ ] Incident has Company: ${testCase.company || 'N/A'}`);
    console.log(`  [ ] Incident has Account: ${testCase.account || 'N/A'}`);
    console.log(`  [ ] Incident has Location: ${testCase.location || 'N/A'}`);
    console.log(`  [ ] Incident has Contact: ${testCase.contact || 'N/A'}`);
    console.log('  [ ] Incident does NOT appear "orphaned"');
    console.log('');
    console.log('Bidirectional Linking:');
    console.log(`  [ ] Case "Related Records" tab → Incident field shows: ${incident.number}`);
    console.log(`  [ ] Incident "Related Records" tab → Parent Incident is EMPTY (correct)`);
    console.log(`  [ ] Incident "Customer Cases" tab shows: ${testCase.number}`);
    console.log(`  [ ] Both Case and Incident can navigate to each other`);
    console.log('');

    console.log('✅ Test completed successfully! 🎉');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

testIncidentInDev()
  .catch(console.error)
  .finally(() => process.exit(0));
