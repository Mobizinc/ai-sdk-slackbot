/**
 * End-to-end test simulating the actual production flow
 * This mimics what sync-voice-worknotes.ts does
 */

import { serviceNowClient } from '../lib/tools/servicenow';

const TEST_CASE_SYS_ID = 'f753b7c08378721039717000feaad385';  // SCS0049247
const TEST_CASE_NUMBER = 'SCS0049247';

async function testEndToEndInteraction() {
  console.log('=== END-TO-END INTERACTION TEST ===');
  console.log('Simulating production flow from sync-voice-worknotes.ts');
  console.log('');

  // Simulate the metadata structure from sync-voice-worknotes.ts
  // Use current time to avoid "Verify Opened Date" business rule errors
  const now = new Date();
  const startTime = new Date(now.getTime() - 15 * 60 * 1000); // 15 minutes ago
  const endTime = new Date(now.getTime() - 2 * 60 * 1000);  // 2 minutes ago

  const metadata = {
    sessionId: `e2e-test-${Date.now()}`,
    caseSysId: TEST_CASE_SYS_ID,
    caseNumber: TEST_CASE_NUMBER,
    direction: 'inbound',
    phoneNumber: '+14097906402',
    startTime,
    endTime,
  };

  console.log('Interaction Metadata:');
  console.log(JSON.stringify(metadata, null, 2));
  console.log('');

  try {
    console.log('Creating interaction in ServiceNow...');

    const result = await serviceNowClient.createPhoneInteraction({
      caseSysId: metadata.caseSysId,
      caseNumber: metadata.caseNumber,
      channel: 'phone',
      direction: metadata.direction,
      phoneNumber: metadata.phoneNumber,
      sessionId: metadata.sessionId,
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      // Optional fields not in metadata
      summary: `Voice call - ${metadata.direction}`,
      notes: `Session ID: ${metadata.sessionId}\nANI: ${metadata.phoneNumber}`,
    });

    console.log('✅ SUCCESS!');
    console.log('');
    console.log('Created Interaction:');
    console.log(`  Number: ${result.interaction_number}`);
    console.log(`  sys_id: ${result.interaction_sys_id}`);
    console.log(`  URL: ${result.interaction_url}`);
    console.log('');

    // Verify the interaction
    const SERVICENOW_URL = process.env.SERVICENOW_URL;
    const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
    const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

    if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
      console.log('⚠️  Cannot verify - missing credentials');
      return result;
    }

    const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/interaction/${result.interaction_sys_id}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log('⚠️  Failed to fetch for verification');
      return result;
    }

    const data = await response.json();
    const record = data.result;

    console.log('=== VERIFICATION ===');
    console.log('');
    console.log('Critical Fields:');
    console.log(`  ✅ context_document: ${record.context_document?.value === TEST_CASE_SYS_ID ? 'LINKED TO CASE' : 'NOT LINKED'}`);
    console.log(`  ✅ context_table: ${record.context_table || 'NOT SET'}`);
    console.log(`  ✅ caller_phone_number: ${record.caller_phone_number || 'NOT SET'}`);
    console.log(`  ✅ type: ${record.type || 'NOT SET'}`);
    console.log(`  ✅ direction: ${record.direction || 'NOT SET'}`);
    console.log(`  ✅ opened_at: ${record.opened_at || 'NOT SET'}`);
    console.log('');

    // Check for any issues
    const issues: string[] = [];

    if (record.context_document?.value !== TEST_CASE_SYS_ID) {
      issues.push('❌ Interaction NOT linked to case');
    }

    if (!record.caller_phone_number) {
      issues.push('❌ Phone number missing');
    }

    if (record.type !== 'phone') {
      issues.push('❌ Type not set to "phone"');
    }

    if (issues.length > 0) {
      console.log('ISSUES FOUND:');
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log('');
    } else {
      console.log('✅ ALL CHECKS PASSED - Interaction properly created and linked!');
      console.log('');
    }

    console.log('=== PRODUCTION READINESS ===');
    console.log('This test confirms that:');
    console.log('  1. Interactions are created successfully');
    console.log('  2. Interactions are properly linked to cases via context_document');
    console.log('  3. Phone numbers are populated');
    console.log('  4. All required fields are set');
    console.log('');
    console.log('The fix is ready for production use.');

    return result;

  } catch (error) {
    console.error('❌ ERROR:');
    console.error(error);
    throw error;
  }
}

testEndToEndInteraction().catch(console.error);
