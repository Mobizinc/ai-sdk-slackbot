/**
 * Test the fixed interaction creation with correct field mappings
 */

import { serviceNowClient } from '../lib/tools/servicenow';

const CASE_SYS_ID = 'f753b7c08378721039717000feaad385';  // SCS0049247
const CASE_NUMBER = 'SCS0049247';

async function testFixedInteractionCreation() {
  console.log('=== TESTING FIXED INTERACTION CREATION ===');
  console.log(`Case: ${CASE_NUMBER} (${CASE_SYS_ID})`);
  console.log('');

  try {
    const result = await serviceNowClient.createPhoneInteraction({
      caseSysId: CASE_SYS_ID,
      caseNumber: CASE_NUMBER,
      channel: 'phone',
      direction: 'inbound',
      phoneNumber: '+14097906402',
      sessionId: 'test-session-' + Date.now(),
      startTime: new Date('2025-10-20T11:30:11Z'),
      endTime: new Date('2025-10-20T11:45:23Z'),
      durationSeconds: 912, // 15 minutes 12 seconds
      agentName: 'Jane Smith',
      queueName: 'Customer Support',
      summary: 'Customer inquiry - product information',
      notes: 'Customer called asking about product availability and pricing.',
    });

    console.log('✅ SUCCESS! Interaction created with corrected field mappings');
    console.log('');
    console.log('Result:');
    console.log(`  Interaction Number: ${result.interaction_number}`);
    console.log(`  Interaction sys_id: ${result.interaction_sys_id}`);
    console.log(`  URL: ${result.interaction_url}`);
    console.log('');

    // Fetch the interaction back to verify all fields
    const SERVICENOW_URL = process.env.SERVICENOW_URL;
    const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
    const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

    if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
      console.log('⚠️  Cannot verify - missing ServiceNow credentials');
      return;
    }

    const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/interaction/${result.interaction_sys_id}?sysparm_display_value=all`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log('❌ Failed to fetch interaction for verification');
      return;
    }

    const data = await response.json();
    const record = data.result;

    console.log('=== VERIFICATION ===');
    console.log('');
    console.log('Linking Fields:');
    console.log(`  context_table: ${record.context_table?.value || 'NOT SET'}`);
    console.log(`  context_document: ${record.context_document?.display_value || 'NOT SET'}`);
    console.log(`  channel_metadata_table: ${record.channel_metadata_table?.value || 'NOT SET'}`);
    console.log(`  channel_metadata_document: ${record.channel_metadata_document?.display_value || 'NOT SET'}`);
    console.log('');

    console.log('Contact/Customer Fields:');
    console.log(`  caller_phone_number: ${record.caller_phone_number || 'NOT SET'}`);
    console.log(`  contact: ${record.contact?.display_value || 'NOT SET'}`);
    console.log(`  opened_for: ${record.opened_for?.display_value || 'NOT SET'}`);
    console.log('');

    console.log('Timing Fields:');
    console.log(`  type: ${record.type || 'NOT SET'}`);
    console.log(`  direction: ${record.direction || 'NOT SET'}`);
    console.log(`  opened_at: ${record.opened_at?.display_value || 'NOT SET'}`);
    console.log(`  closed_at: ${record.closed_at?.display_value || 'NOT SET'}`);
    console.log(`  duration: ${record.duration || 'NOT SET'}`);
    console.log(`  state: ${record.state?.display_value || 'NOT SET'}`);
    console.log('');

    console.log('Description Fields:');
    console.log(`  short_description: ${record.short_description || 'NOT SET'}`);
    console.log(`  work_notes: ${record.work_notes?.display_value || 'NOT SET'}`);
    console.log('');

    // Check if interaction is linked properly
    if (record.context_document?.value === CASE_SYS_ID) {
      console.log('✅ Interaction is properly linked to case via context_document');
    } else {
      console.log('❌ Interaction is NOT linked to case');
    }

    if (record.caller_phone_number) {
      console.log('✅ Phone number is populated');
    } else {
      console.log('❌ Phone number is missing');
    }

    if (record.type === 'phone') {
      console.log('✅ Type is set to "phone"');
    } else {
      console.log('❌ Type is not set correctly');
    }

    console.log('');
    console.log('=== TEST COMPLETE ===');
    console.log('Please verify in ServiceNow UI that:');
    console.log('1. Interaction record shows proper context/case link');
    console.log('2. Phone number is displayed');
    console.log('3. Timing information is correct');
    console.log('4. Agent/queue info appears in work_notes');

  } catch (error) {
    console.error('❌ ERROR creating interaction:');
    console.error(error);
    throw error;
  }
}

testFixedInteractionCreation().catch(console.error);
