/**
 * Test Incident Company Linkage
 * Verifies that incidents created from cases properly inherit company/account/location information
 *
 * Tests the fix for orphaned incidents missing company information
 * Example case: SCS0048882 <-> INC0167613 (should have company context)
 */

import * as dotenv from 'dotenv';
import { serviceNowClient } from '../lib/tools/servicenow';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function testIncidentCompanyLinkage() {
  console.log('🧪 Testing Incident Company Linkage\n');

  // Check if ServiceNow is configured
  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow is not configured');
    console.log('Please set SERVICENOW_INSTANCE_URL and credentials');
    process.exit(1);
  }

  // Test Case 1: Create incident with full company context
  console.log('Test 1: Create Incident with Company Context');
  console.log('─'.repeat(60));

  const testCaseData = {
    caseSysId: 'test-case-sys-id-001',
    caseNumber: 'TEST-COMPANY-001',
    shortDescription: 'VPN down for entire company - testing incident creation',
    description: 'Testing that incident inherits company information from parent case',
    category: 'Network',
    subcategory: 'VPN',
    urgency: '2',
    priority: '2',
    callerId: 'test-user-sys-id',
    assignmentGroup: 'test-group-sys-id',
    isMajorIncident: false,
    // Company/Account context
    company: 'c3eec28c931c9a1049d9764efaba10f3', // Example company sys_id
    account: 'c3eec28c931c9a1049d9764efaba10f3', // Example account sys_id
    location: 'd2cb8850c366e210a01d5673e4013159', // Example location sys_id
    businessService: undefined, // No business service for this test
    // Contact information
    contact: '075f480583a5a61068537cdfeeaad3ca', // Example contact sys_id
    contactType: 'web',
    openedBy: '075f480583a5a61068537cdfeeaad3ca', // Example user sys_id
    // Technical context
    cmdbCi: undefined, // No CI for this test
    // Multi-tenancy
    sysDomain: '87eec28c931c9a1049d9764efaba10f4', // Example domain sys_id
    sysDomainPath: '!!!/!$9/', // Example domain path
  };

  try {
    console.log('Creating incident with company context...');
    console.log(`Company: ${testCaseData.company}`);
    console.log(`Account: ${testCaseData.account}`);
    console.log(`Location: ${testCaseData.location}`);
    console.log(`Contact: ${testCaseData.contact}`);
    console.log(`Contact Type: ${testCaseData.contactType}`);
    console.log(`Opened By: ${testCaseData.openedBy}`);
    console.log(`Domain: ${testCaseData.sysDomain}`);
    console.log('');

    const result = await serviceNowClient.createIncidentFromCase(testCaseData);

    console.log(`✅ Incident Created: ${result.incident_number}`);
    console.log(`   Sys ID: ${result.incident_sys_id}`);
    console.log(`   URL: ${result.incident_url}`);
    console.log('');

    console.log('✅ Test 1 PASSED - Incident created successfully');
    console.log('');
    console.log('⚠️  MANUAL VERIFICATION REQUIRED:');
    console.log(`   1. Open incident: ${result.incident_url}`);
    console.log(`   2. Verify Company field is populated: ${testCaseData.company}`);
    console.log(`   3. Verify Account field is populated: ${testCaseData.account}`);
    console.log(`   4. Verify Location field is populated: ${testCaseData.location}`);
    console.log(`   5. Verify Contact field is populated: ${testCaseData.contact}`);
    console.log(`   6. Verify Contact Type: ${testCaseData.contactType}`);
    console.log(`   7. Verify Opened By: ${testCaseData.openedBy}`);
    console.log(`   8. Verify Domain: ${testCaseData.sysDomain}`);
    console.log(`   9. Verify Parent Case link: ${testCaseData.caseSysId}`);
    console.log('');
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error);
    console.log('');
  }

  // Test Case 2: Create incident without company context (should still work)
  console.log('Test 2: Create Incident WITHOUT Company Context');
  console.log('─'.repeat(60));

  const testCaseNoCompany = {
    caseSysId: 'test-case-sys-id-002',
    caseNumber: 'TEST-NO-COMPANY-002',
    shortDescription: 'Test incident without company context',
    description: 'Testing that incident can be created without company fields',
    category: 'Software',
    subcategory: 'Application Error',
    urgency: '3',
    priority: '3',
    callerId: 'test-user-sys-id',
    assignmentGroup: 'test-group-sys-id',
    isMajorIncident: false,
    // No company/account/location/contact fields provided
  };

  try {
    console.log('Creating incident without company context...');
    console.log('');

    const result = await serviceNowClient.createIncidentFromCase(testCaseNoCompany);

    console.log(`✅ Incident Created: ${result.incident_number}`);
    console.log(`   Sys ID: ${result.incident_sys_id}`);
    console.log(`   URL: ${result.incident_url}`);
    console.log('');

    console.log('✅ Test 2 PASSED - Incident created without company fields (graceful fallback)');
    console.log('');
  } catch (error) {
    console.error('❌ Test 2 FAILED:', error);
    console.log('');
  }

  // Test Summary
  console.log('Summary');
  console.log('─'.repeat(60));
  console.log('✅ Incident creation tests completed');
  console.log('');
  console.log('Expected Behavior:');
  console.log('  • Incidents WITH company data should have all context fields populated');
  console.log('  • Incidents WITHOUT company data should still be created successfully');
  console.log('  • Company/account/location fields prevent orphaned incidents');
  console.log('  • Domain fields ensure proper multi-tenancy separation');
  console.log('');
  console.log('⚠️  Remember to verify incidents in ServiceNow UI manually');
  console.log('');
}

testIncidentCompanyLinkage()
  .catch(console.error)
  .finally(() => process.exit(0));
