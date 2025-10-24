/**
 * Test Incident Creation in ServiceNow DEV
 *
 * This script validates that incidents created from cases properly inherit
 * company/account/location context and are not "orphaned"
 *
 * Steps:
 * 1. Connect to ServiceNow DEV using DEV credentials
 * 2. Query for an existing open case
 * 3. Create incident from that case with all company context
 * 4. Verify incident has company/account/location fields populated
 * 5. Provide URLs for manual verification
 */

import * as dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config({ path: '.env.local' });
dotenv.config();

// Set DEV credentials as primary credentials BEFORE importing ServiceNow client
const devUrl = process.env.DEV_SERVICENOW_URL;
const devUsername = process.env.DEV_SERVICENOW_USERNAME;
const devPassword = process.env.DEV_SERVICENOW_PASSWORD;
const devCaseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

if (devUrl && devUsername && devPassword) {
  process.env.SERVICENOW_INSTANCE_URL = devUrl;
  process.env.SERVICENOW_URL = devUrl;
  process.env.SERVICENOW_USERNAME = devUsername;
  process.env.SERVICENOW_PASSWORD = devPassword;
  process.env.SERVICENOW_CASE_TABLE = devCaseTable;
}

// NOW import ServiceNow client (after env vars are set)
import { ServiceNowClient } from '../lib/tools/servicenow';

async function testIncidentInDev() {
  console.log('🧪 Testing Incident Creation in ServiceNow DEV\n');
  console.log('This test validates the fix for orphaned incidents missing company information');
  console.log('Example issue: SCS0048882 <-> INC0167613 (incident missing company context)\n');
  console.log('='.repeat(70));
  console.log('');

  // Step 1: Set up DEV ServiceNow client
  console.log('Step 1: Connecting to ServiceNow DEV');
  console.log('─'.repeat(70));

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured in .env.local');
    console.log('Required variables:');
    console.log('  - DEV_SERVICENOW_URL');
    console.log('  - DEV_SERVICENOW_USERNAME');
    console.log('  - DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log(`✓ DEV URL: ${devUrl}`);
  console.log(`✓ DEV Username: ${devUsername}`);
  console.log(`✓ DEV Case Table: ${devCaseTable}`);
  console.log('');

  // Create DEV client (using env vars set at top of file)
  const devClient = new ServiceNowClient();

  if (!devClient.isConfigured()) {
    console.error('❌ DEV ServiceNow client not properly configured');
    process.exit(1);
  }

  console.log('✅ Connected to ServiceNow DEV\n');

  try {
    // Step 2: Query for an existing open case
    console.log('Step 2: Querying for existing open case in DEV');
    console.log('─'.repeat(70));

    // Build query for open cases
    const query = 'active=true^state!=3^state!=6^ORDERBYDESCsys_created_on';
    const endpoint = `/api/now/table/${devCaseTable}?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=1&sysparm_display_value=all`;

    console.log(`Querying: ${devCaseTable}`);
    console.log(`Filter: active cases (not closed/resolved)`);
    console.log('');

    const response = await fetch(`${devUrl}${endpoint}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query cases: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.result || data.result.length === 0) {
      console.error('❌ No open cases found in DEV');
      console.log('Please create a test case in ServiceNow DEV first');
      process.exit(1);
    }

    const caseData = data.result[0];

    // Extract display values (ServiceNow returns objects with display_value)
    const extractValue = (field: any): string | undefined => {
      if (!field) return undefined;
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field.value) return field.value;
      return String(field);
    };

    const testCase = {
      sys_id: extractValue(caseData.sys_id) || '',
      number: extractValue(caseData.number) || '',
      short_description: extractValue(caseData.short_description) || '',
      description: extractValue(caseData.description) || '',
      priority: extractValue(caseData.priority) || '3',
      urgency: extractValue(caseData.urgency) || '3',
      category: extractValue(caseData.category),
      subcategory: extractValue(caseData.subcategory),
      state: extractValue(caseData.state),
      // Company/Account context
      company: extractValue(caseData.company),
      account: extractValue(caseData.account),
      location: extractValue(caseData.location),
      business_service: extractValue(caseData.business_service),
      // Contact information
      contact: extractValue(caseData.contact),
      contact_type: extractValue(caseData.contact_type),
      opened_by: extractValue(caseData.opened_by),
      caller_id: extractValue(caseData.caller_id),
      // Technical context
      cmdb_ci: extractValue(caseData.cmdb_ci),
      // Assignment
      assignment_group: extractValue(caseData.assignment_group),
      assigned_to: extractValue(caseData.assigned_to),
      // Multi-tenancy
      sys_domain: extractValue(caseData.sys_domain),
      sys_domain_path: extractValue(caseData.sys_domain_path),
    };

    console.log(`✅ Found case: ${testCase.number}`);
    console.log(`   Sys ID: ${testCase.sys_id}`);
    console.log(`   Description: ${testCase.short_description}`);
    console.log(`   State: ${testCase.state}`);
    console.log(`   Priority: ${testCase.priority}`);
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
    console.log('   Technical Context:');
    console.log(`   - CMDB CI: ${testCase.cmdb_ci || 'null'}`);
    console.log('');
    console.log('   Multi-tenancy:');
    console.log(`   - Domain: ${testCase.sys_domain || 'null'}`);
    console.log(`   - Domain Path: ${testCase.sys_domain_path || 'null'}`);
    console.log('');

    // Step 3: Create incident from case with all company context
    console.log('Step 3: Creating incident from case');
    console.log('─'.repeat(70));
    console.log('Using updated createIncidentFromCase with company context fields...');
    console.log('');

    const incidentResult = await devClient.createIncidentFromCase({
      caseSysId: testCase.sys_id,
      caseNumber: testCase.number,
      shortDescription: `[TEST] ${testCase.short_description}`,
      description: `[DEV TEST] Testing incident creation with company context.\n\nOriginal case: ${testCase.number}\n\n${testCase.description}`,
      category: testCase.category || 'inquiry',
      subcategory: testCase.subcategory,
      urgency: testCase.urgency,
      priority: testCase.priority,
      callerId: testCase.caller_id,
      assignmentGroup: testCase.assignment_group,
      isMajorIncident: false,
      // NEW: Company/Account context (prevents orphaned incidents)
      company: testCase.company,
      account: testCase.account,
      businessService: testCase.business_service,
      location: testCase.location,
      // NEW: Contact information
      contact: testCase.contact,
      contactType: testCase.contact_type,
      openedBy: testCase.opened_by,
      // NEW: Technical context
      cmdbCi: testCase.cmdb_ci,
      // NEW: Multi-tenancy
      sysDomain: testCase.sys_domain,
      sysDomainPath: testCase.sys_domain_path,
    });

    console.log(`✅ Incident created: ${incidentResult.incident_number}`);
    console.log(`   Sys ID: ${incidentResult.incident_sys_id}`);
    console.log(`   URL: ${incidentResult.incident_url}`);
    console.log('');

    // Step 4: Verify incident has company fields populated
    console.log('Step 4: Verifying incident has company context');
    console.log('─'.repeat(70));

    const incidentEndpoint = `/api/now/table/incident/${incidentResult.incident_sys_id}?sysparm_display_value=all`;
    const incidentResponse = await fetch(`${devUrl}${incidentEndpoint}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (!incidentResponse.ok) {
      throw new Error(`Failed to fetch incident: ${incidentResponse.status}`);
    }

    const incidentData = await incidentResponse.json();
    const incident = incidentData.result;

    console.log('Incident field verification:');
    console.log('');
    console.log('✓ Standard fields:');
    console.log(`  - Number: ${extractValue(incident.number)}`);
    console.log(`  - Short Description: ${extractValue(incident.short_description)}`);
    console.log(`  - Category: ${extractValue(incident.category) || 'null'}`);
    console.log(`  - Priority: ${extractValue(incident.priority)}`);
    console.log(`  - Parent Case: ${extractValue(incident.parent)}`);
    console.log('');

    const incidentCompany = extractValue(incident.company);
    const incidentAccount = extractValue(incident.account);
    const incidentLocation = extractValue(incident.location);
    const incidentContact = extractValue(incident.contact);
    const incidentContactType = extractValue(incident.contact_type);
    const incidentOpenedBy = extractValue(incident.opened_by);
    const incidentCmdbCi = extractValue(incident.cmdb_ci);
    const incidentDomain = extractValue(incident.sys_domain);
    const incidentDomainPath = extractValue(incident.sys_domain_path);

    console.log('✓ Company/Account context fields:');
    console.log(`  - Company: ${incidentCompany || '❌ null'} ${incidentCompany ? '✅' : '⚠️  MISSING'}`);
    console.log(`  - Account: ${incidentAccount || '❌ null'} ${incidentAccount ? '✅' : '⚠️  MISSING'}`);
    console.log(`  - Location: ${incidentLocation || '❌ null'} ${incidentLocation ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');

    console.log('✓ Contact information fields:');
    console.log(`  - Contact: ${incidentContact || '❌ null'} ${incidentContact ? '✅' : '⚠️  MISSING'}`);
    console.log(`  - Contact Type: ${incidentContactType || '❌ null'} ${incidentContactType ? '✅' : '⚠️  OPTIONAL'}`);
    console.log(`  - Opened By: ${incidentOpenedBy || '❌ null'} ${incidentOpenedBy ? '✅' : '⚠️  MISSING'}`);
    console.log('');

    console.log('✓ Technical context fields:');
    console.log(`  - CMDB CI: ${incidentCmdbCi || 'null (optional)'}`);
    console.log('');

    console.log('✓ Multi-tenancy fields:');
    console.log(`  - Domain: ${incidentDomain || '❌ null'} ${incidentDomain ? '✅' : '⚠️  MISSING'}`);
    console.log(`  - Domain Path: ${incidentDomainPath || '❌ null'} ${incidentDomainPath ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');

    // Calculate success score
    const requiredFields = [
      { name: 'company', value: incidentCompany },
      { name: 'account', value: incidentAccount },
      { name: 'contact', value: incidentContact },
      { name: 'opened_by', value: incidentOpenedBy },
      { name: 'sys_domain', value: incidentDomain },
    ];

    const populatedCount = requiredFields.filter(f => f.value).length;
    const totalRequired = requiredFields.length;

    console.log('─'.repeat(70));
    console.log(`Populated Fields: ${populatedCount}/${totalRequired} required fields`);
    console.log('');

    if (populatedCount === totalRequired) {
      console.log('✅ SUCCESS - All required company context fields are populated!');
      console.log('   Incident is NOT orphaned - has full company linkage');
    } else {
      console.log('⚠️  WARNING - Some required fields are missing:');
      requiredFields.filter(f => !f.value).forEach(f => {
        console.log(`   - ${f.name}`);
      });
      console.log('');
      console.log('   This may indicate:');
      console.log('   - Parent case is missing these fields');
      console.log('   - Fields not being passed correctly');
      console.log('   - ServiceNow permissions blocking field updates');
    }
    console.log('');

    // Step 5: Provide manual verification URLs
    console.log('Step 5: Manual Verification');
    console.log('='.repeat(70));
    console.log('');
    console.log('Please verify in ServiceNow DEV UI:');
    console.log('');
    console.log(`1. Parent Case: ${devUrl}/nav_to.do?uri=${devCaseTable}.do?sys_id=${testCase.sys_id}`);
    console.log(`   Case Number: ${testCase.number}`);
    console.log('');
    console.log(`2. Created Incident: ${incidentResult.incident_url}`);
    console.log(`   Incident Number: ${incidentResult.incident_number}`);
    console.log('');
    console.log('Verification Checklist:');
    console.log(`  [ ] Incident has Company field populated: ${testCase.company}`);
    console.log(`  [ ] Incident has Account field populated: ${testCase.account}`);
    console.log(`  [ ] Incident has Location field populated: ${testCase.location || 'N/A'}`);
    console.log(`  [ ] Incident has Contact field populated: ${testCase.contact}`);
    console.log(`  [ ] Incident has Parent link to Case: ${testCase.number}`);
    console.log('  [ ] Incident does NOT appear "orphaned" in company views');
    console.log('');

    console.log('Test completed successfully! 🎉');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

testIncidentInDev()
  .catch(console.error)
  .finally(() => process.exit(0));
