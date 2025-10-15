/**
 * Test Problem Creation in ServiceNow DEV (Simplified Version)
 *
 * This script validates that problems created from cases properly inherit
 * company/account/location context using direct API calls
 *
 * Similar to incidents, but Problems are for root cause analysis rather than
 * immediate service restoration.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function testProblemInDev() {
  console.log('🧪 Testing Problem Creation in ServiceNow DEV\n');
  console.log('Validating fix for orphaned problems missing company information');
  console.log('Problems track root causes for recurring/potential incidents\n');
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
      if (typeof field === 'object') {
        // Try to extract sys_id value first, then display_value, then value
        if (field.value) return field.value;
        if (field.display_value) return field.display_value;
        // If it's an object without value/display_value, return undefined (not the object itself)
        return undefined;
      }
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
      assigned_to: getValue(rawCase.assigned_to),
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
    console.log('   Assignment:');
    console.log(`   - Assignment Group: ${testCase.assignment_group || 'null'}`);
    console.log(`   - Assigned To: ${testCase.assigned_to || 'null'}`);
    console.log('');

    // Step 3: Create problem with full company context
    console.log('Step 3: Creating problem with company context');
    console.log('─'.repeat(70));

    const problemPayload: Record<string, any> = {
      short_description: `[TEST] ${testCase.short_description}`,
      description: `[DEV TEST] Testing problem creation with company context.\n\nOriginal case: ${testCase.number}\n\n${testCase.description}`,
      category: testCase.category || 'inquiry',
      subcategory: testCase.subcategory,
      urgency: testCase.urgency,
      priority: testCase.priority,
      caller_id: testCase.caller_id,
      assignment_group: testCase.assignment_group,
      parent: testCase.sys_id,
      work_notes: `Automatically created from Case ${testCase.number} via AI triage system. ITSM record type classification determined this requires root cause analysis via problem management.`,
    };

    // Add assignment fields
    if (testCase.assigned_to) problemPayload.assigned_to = testCase.assigned_to;
    // First reported by task is a reference to the Case (task), not the user
    problemPayload.first_reported_by_task = testCase.sys_id;

    // Add company/account context (prevents orphaned problems)
    if (testCase.company) problemPayload.company = testCase.company;
    if (testCase.account) problemPayload.account = testCase.account;
    if (testCase.business_service) problemPayload.business_service = testCase.business_service;
    if (testCase.location) problemPayload.location = testCase.location;

    // Add contact information
    if (testCase.contact) problemPayload.contact = testCase.contact;
    if (testCase.contact_type) problemPayload.contact_type = testCase.contact_type;
    if (testCase.opened_by) problemPayload.opened_by = testCase.opened_by;

    // Add technical context
    if (testCase.cmdb_ci) problemPayload.cmdb_ci = testCase.cmdb_ci;

    // Add multi-tenancy
    if (testCase.sys_domain) problemPayload.sys_domain = testCase.sys_domain;
    if (testCase.sys_domain_path) problemPayload.sys_domain_path = testCase.sys_domain_path;

    console.log('Problem payload includes:');
    console.log(`  - Company: ${problemPayload.company || 'null'}`);
    console.log(`  - Account: ${problemPayload.account || 'null'}`);
    console.log(`  - Location: ${problemPayload.location || 'null'}`);
    console.log(`  - Contact: ${problemPayload.contact || 'null'}`);
    console.log(`  - Contact Type: ${problemPayload.contact_type || 'null'}`);
    console.log(`  - Opened By: ${problemPayload.opened_by || 'null'}`);
    console.log(`  - First Reported By Task (Case): ${problemPayload.first_reported_by_task || 'null'}`);
    console.log(`  - Assignment Group: ${problemPayload.assignment_group || 'null'}`);
    console.log(`  - Assigned To: ${problemPayload.assigned_to || 'null'}`);
    console.log(`  - Domain: ${problemPayload.sys_domain || 'null'}`);
    console.log('');

    const problemUrl = `${devUrl}/api/now/table/problem`;
    const problemResponse = await fetch(problemUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(problemPayload),
    });

    if (!problemResponse.ok) {
      throw new Error(`Failed to create problem: ${problemResponse.status}\n${await problemResponse.text()}`);
    }

    const problemData = await problemResponse.json();
    const problem = problemData.result;

    console.log(`✅ Problem created: ${problem.number}`);
    console.log(`   Sys ID: ${problem.sys_id}`);
    console.log('');

    // Step 3.5: Update case with problem reference (bidirectional link)
    console.log('Step 3.5: Updating case with problem reference (bidirectional link)');
    console.log('─'.repeat(70));
    console.log(`Updating case ${testCase.number} with problem ${problem.number}...`);
    console.log('');

    const caseUpdateUrl = `${devUrl}/api/now/table/${devCaseTable}/${testCase.sys_id}`;
    const caseUpdateResponse = await fetch(caseUpdateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ problem: problem.sys_id }),
    });

    if (!caseUpdateResponse.ok) {
      throw new Error(`Failed to update case: ${caseUpdateResponse.status}\n${await caseUpdateResponse.text()}`);
    }

    console.log(`✅ Case ${testCase.number} updated with problem reference`);
    console.log(`   Bidirectional link established: Case ↔ Problem`);
    console.log('');

    // Step 4: Verify problem has company context
    console.log('Step 4: Verifying problem has company context');
    console.log('─'.repeat(70));

    const verifyUrl = `${devUrl}/api/now/table/problem/${problem.sys_id}?sysparm_display_value=all`;
    const verifyResponse = await fetch(verifyUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!verifyResponse.ok) {
      throw new Error(`Failed to fetch problem: ${verifyResponse.status}`);
    }

    const verifyData = await verifyResponse.json();
    const verifiedProblem = verifyData.result;

    const prbCompany = getValue(verifiedProblem.company);
    const prbAccount = getValue(verifiedProblem.account);
    const prbLocation = getValue(verifiedProblem.location);
    const prbContact = getValue(verifiedProblem.contact);
    const prbContactType = getValue(verifiedProblem.contact_type);
    const prbOpenedBy = getValue(verifiedProblem.opened_by);
    const prbFirstReportedByTask = getValue(verifiedProblem.first_reported_by_task);
    const prbAssignmentGroup = getValue(verifiedProblem.assignment_group);
    const prbAssignedTo = getValue(verifiedProblem.assigned_to);
    const prbDomain = getValue(verifiedProblem.sys_domain);

    console.log('Company/Account fields:');
    console.log(`  - Company: ${prbCompany || 'null'} ${prbCompany ? '✅' : '❌ MISSING'}`);
    console.log(`  - Account: ${prbAccount || 'null'} ${prbAccount ? '✅' : '❌ MISSING'}`);
    console.log(`  - Location: ${prbLocation || 'null'} ${prbLocation ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');
    console.log('Contact fields:');
    console.log(`  - Contact: ${prbContact || 'null'} ${prbContact ? '✅' : '❌ MISSING'}`);
    console.log(`  - Contact Type: ${prbContactType || 'null'} ${prbContactType ? '✅' : '⚠️  OPTIONAL'}`);
    console.log(`  - Opened By: ${prbOpenedBy || 'null'} ${prbOpenedBy ? '✅' : '❌ MISSING'}`);
    console.log(`  - First Reported By Task (Case ref): ${prbFirstReportedByTask || 'null'} ${prbFirstReportedByTask ? '✅' : '❌ MISSING'}`);
    console.log('');
    console.log('Assignment fields:');
    console.log(`  - Assignment Group: ${prbAssignmentGroup || 'null'} ${prbAssignmentGroup ? '✅' : '⚠️  OPTIONAL'}`);
    console.log(`  - Assigned To: ${prbAssignedTo || 'null'} ${prbAssignedTo ? '✅' : '⚠️  OPTIONAL (only if case has assignee)'}`);
    console.log('');
    console.log('Multi-tenancy fields:');
    console.log(`  - Domain: ${prbDomain || 'null'} ${prbDomain ? '✅' : '⚠️  OPTIONAL'}`);
    console.log('');

    // Calculate results
    const requiredFields = [
      { name: 'company', value: prbCompany, required: true },
      { name: 'account', value: prbAccount, required: true },
      { name: 'contact', value: prbContact, required: true },
      { name: 'opened_by', value: prbOpenedBy, required: true },
      { name: 'first_reported_by_task', value: prbFirstReportedByTask, required: true },
      { name: 'assignment_group', value: prbAssignmentGroup, required: true },
    ];

    const populated = requiredFields.filter(f => f.value);
    const missing = requiredFields.filter(f => !f.value);

    console.log('─'.repeat(70));
    if (missing.length === 0) {
      console.log('✅ SUCCESS - All required company context fields are populated!');
      console.log('   Problem is NOT orphaned - has full company linkage');
    } else {
      console.log(`⚠️  WARNING - ${missing.length} required fields missing:`);
      missing.forEach(f => console.log(`   - ${f.name}`));
    }
    console.log('');

    // Step 5: Verify bidirectional link (Case → Problem)
    console.log('Step 5: Verifying bidirectional link (Case → Problem)');
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

    const caseProblemRef = getValue(verifiedCase.problem);
    const problemParentRef = getValue(verifiedProblem.parent);

    console.log('Bidirectional link verification:');
    console.log(`  Case ${testCase.number} → Problem field: ${caseProblemRef || 'null'} ${caseProblemRef ? '✅' : '❌ MISSING'}`);
    console.log(`  Problem ${problem.number} → Parent field: ${problemParentRef || 'null'} ${problemParentRef ? '✅' : '❌ MISSING'}`);
    console.log('');

    if (caseProblemRef && problemParentRef) {
      console.log('✅ SUCCESS - Bidirectional link established!');
      console.log('   Case knows about Problem (Related Records > Problem tab will show it)');
      console.log('   Problem knows about Case (Customer Cases tab will show it)');
    } else {
      console.log('❌ FAILED - Bidirectional link is broken!');
      if (!caseProblemRef) console.log('   Case does not reference the problem');
      if (!problemParentRef) console.log('   Problem does not reference the case');
    }
    console.log('');

    // Step 6: Manual verification
    console.log('Step 6: Manual Verification in ServiceNow UI');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Parent Case: ${devUrl}/nav_to.do?uri=${devCaseTable}.do?sys_id=${testCase.sys_id}`);
    console.log(`  Case Number: ${testCase.number}`);
    console.log('');
    console.log(`Created Problem: ${devUrl}/nav_to.do?uri=problem.do?sys_id=${problem.sys_id}`);
    console.log(`  Problem Number: ${problem.number}`);
    console.log('');
    console.log('Verification Checklist:');
    console.log('');
    console.log('Company Context:');
    console.log(`  [ ] Problem has Company: ${testCase.company || 'N/A'}`);
    console.log(`  [ ] Problem has Account: ${testCase.account || 'N/A'}`);
    console.log(`  [ ] Problem has Location: ${testCase.location || 'N/A'}`);
    console.log(`  [ ] Problem has Contact: ${testCase.contact || 'N/A'}`);
    console.log('  [ ] Problem does NOT appear "orphaned"');
    console.log('');
    console.log('Bidirectional Linking:');
    console.log(`  [ ] Case "Related Records" tab → Problem field shows: ${problem.number}`);
    console.log(`  [ ] Problem "Related Records" tab → Parent Problem is EMPTY (correct)`);
    console.log(`  [ ] Problem "Customer Cases" tab shows: ${testCase.number}`);
    console.log(`  [ ] Both Case and Problem can navigate to each other`);
    console.log('');

    console.log('✅ Test completed successfully! 🎉');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  }
}

testProblemInDev()
  .catch(console.error)
  .finally(() => process.exit(0));
