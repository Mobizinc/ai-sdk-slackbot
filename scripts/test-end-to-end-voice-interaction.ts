import { serviceNowClient } from "../lib/tools/servicenow";
import axios from 'axios';

async function testEndToEndVoiceInteraction() {
  try {
    console.log('=== End-to-End Voice Interaction Test ===\n');

    // Simulate the workflow from sync-voice-worknotes.ts
    const caseSysId = 'f753b7c08378721039717000feaad385'; // SCS0049247

    // 1. Get case data
    console.log('STEP 1: Fetching case data...');
    const caseRecord = await serviceNowClient.getCaseBySysId(caseSysId);

    if (!caseRecord) {
      console.error('Case not found!');
      return;
    }

    console.log(`Case: ${caseRecord.number}`);
    console.log(`Contact (sys_id): ${caseRecord.contact || 'MISSING'}`);
    console.log(`Account (sys_id): ${caseRecord.account || 'MISSING'}`);
    console.log('');

    // 2. Create interaction (simulating the cron job)
    console.log('STEP 2: Creating ServiceNow interaction...');
    const sessionId = `E2E-TEST-${Date.now()}`;
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 5 * 60 * 1000); // 5 minutes later

    const result = await serviceNowClient.createPhoneInteraction({
      caseSysId: caseRecord.sys_id,
      caseNumber: caseRecord.number,
      channel: 'phone',
      direction: 'inbound',
      phoneNumber: '+14097906402',
      sessionId,
      startTime,
      endTime,
      durationSeconds: 311,
      agentName: 'Test Agent',
      queueName: 'Support Queue',
    });

    console.log(`Created: ${result.interaction_number}`);
    console.log(`Sys ID: ${result.interaction_sys_id}`);
    console.log('');

    // 3. Verify the interaction
    console.log('STEP 3: Verifying interaction...');

    const instance = process.env.SERVICENOW_URL!.replace('https://', '').replace('.service-now.com', '');
    const username = process.env.SERVICENOW_USERNAME!;
    const password = process.env.SERVICENOW_PASSWORD!;
    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const verifyResponse = await axios.get(
      `https://${instance}.service-now.com/api/now/table/interaction/${result.interaction_sys_id}`,
      {
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account,state,context_document,caller_phone_number,short_description,work_notes'
        },
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const interaction = verifyResponse.data.result;

    console.log('=== VERIFICATION RESULTS ===');
    console.log('Interaction Number:', interaction.number?.display_value);
    console.log('Contact:', interaction.contact?.display_value || 'MISSING');
    console.log('Account:', interaction.account?.display_value || 'MISSING');
    console.log('State:', interaction.state?.display_value);
    console.log('Context Document:', interaction.context_document?.display_value);
    console.log('Phone Number:', interaction.caller_phone_number?.display_value);
    console.log('');

    // 4. Validation
    const checks = {
      hasContact: Boolean(interaction.contact?.value),
      hasAccount: Boolean(interaction.account?.value),
      isClosedComplete: interaction.state?.value === 'closed_complete',
      hasContext: Boolean(interaction.context_document?.value),
      hasPhone: Boolean(interaction.caller_phone_number?.value),
      contactMatchesCase: interaction.contact?.value === caseRecord.contact,
      accountMatchesCase: interaction.account?.value === caseRecord.account,
    };

    console.log('=== VALIDATION CHECKS ===');
    console.log('Contact populated:', checks.hasContact ? 'PASS' : 'FAIL');
    console.log('Account populated:', checks.hasAccount ? 'PASS' : 'FAIL');
    console.log('State is closed_complete:', checks.isClosedComplete ? 'PASS' : 'FAIL');
    console.log('Context linked:', checks.hasContext ? 'PASS' : 'FAIL');
    console.log('Phone number set:', checks.hasPhone ? 'PASS' : 'FAIL');
    console.log('Contact matches case:', checks.contactMatchesCase ? 'PASS' : 'FAIL');
    console.log('Account matches case:', checks.accountMatchesCase ? 'PASS' : 'FAIL');
    console.log('');

    const allPassed = Object.values(checks).every(v => v === true);
    if (allPassed) {
      console.log('SUCCESS: All validation checks passed!');
      console.log(`View interaction: ${result.interaction_url}`);
    } else {
      console.log('FAILURE: Some validation checks failed.');
      const failed = Object.entries(checks).filter(([_, v]) => !v).map(([k]) => k);
      console.log('Failed checks:', failed.join(', '));
    }

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testEndToEndVoiceInteraction();
