import { serviceNowClient } from "../lib/tools/servicenow";

async function testUpdatedCreateInteraction() {
  try {
    console.log('=== Testing Updated createPhoneInteraction Method ===\n');

    const caseSysId = 'f753b7c08378721039717000feaad385'; // SCS0049247
    const caseNumber = 'SCS0049247';

    console.log('Creating interaction for case:', caseNumber);
    console.log('Case sys_id:', caseSysId);
    console.log('');

    const result = await serviceNowClient.createPhoneInteraction({
      caseSysId,
      caseNumber,
      channel: 'phone',
      direction: 'inbound',
      phoneNumber: '+14097906402',
      sessionId: 'TEST-UPDATED-CODE-' + Date.now(),
      startTime: new Date('2025-10-20T11:30:11Z'),
      endTime: new Date('2025-10-20T11:35:22Z'),
      durationSeconds: 311,
      agentName: 'John Smith',
      queueName: 'Support Queue',
      summary: 'Test call with updated contact/account population',
      notes: 'This interaction was created using the updated code that automatically populates contact and account from the linked case.'
    });

    console.log('=== CREATE RESULT ===');
    console.log('Interaction Number:', result.interaction_number);
    console.log('Interaction Sys ID:', result.interaction_sys_id);
    console.log('URL:', result.interaction_url);
    console.log('');

    // Verify the created interaction
    console.log('=== VERIFYING CREATED INTERACTION ===');

    const axios = require('axios');
    const instance = process.env.SERVICENOW_URL!.replace('https://', '').replace('.service-now.com', '');
    const username = process.env.SERVICENOW_USERNAME!;
    const password = process.env.SERVICENOW_PASSWORD!;
    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const verifyResponse = await axios.get(
      `https://${instance}.service-now.com/api/now/table/interaction/${result.interaction_sys_id}`,
      {
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account,state,context_document,caller_phone_number,opened_at,closed_at,short_description'
        },
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const interaction = verifyResponse.data.result;
    console.log('Number:', interaction.number?.display_value);
    console.log('Contact:', interaction.contact?.display_value || 'MISSING');
    console.log('Account:', interaction.account?.display_value || 'MISSING');
    console.log('State:', interaction.state?.display_value);
    console.log('Context:', interaction.context_document?.display_value);
    console.log('Phone:', interaction.caller_phone_number?.display_value);
    console.log('');

    // Validation
    const hasContact = Boolean(interaction.contact?.display_value);
    const hasAccount = Boolean(interaction.account?.display_value);
    const isClosedComplete = interaction.state?.value === 'closed_complete';

    console.log('=== VALIDATION ===');
    console.log('Contact populated:', hasContact ? 'PASS' : 'FAIL');
    console.log('Account populated:', hasAccount ? 'PASS' : 'FAIL');
    console.log('State is closed_complete:', isClosedComplete ? 'PASS' : 'FAIL');
    console.log('Context linked:', Boolean(interaction.context_document) ? 'PASS' : 'FAIL');
    console.log('');

    if (hasContact && hasAccount && isClosedComplete) {
      console.log('SUCCESS: All fields populated correctly!');
    } else {
      console.log('FAILURE: Some fields are missing or incorrect.');
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testUpdatedCreateInteraction();
