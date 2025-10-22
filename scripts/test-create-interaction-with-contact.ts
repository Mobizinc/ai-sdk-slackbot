import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const instance = process.env.SERVICENOW_URL!.replace('https://', '').replace('.service-now.com', '');
const username = process.env.SERVICENOW_USERNAME!;
const password = process.env.SERVICENOW_PASSWORD!;
const auth = Buffer.from(`${username}:${password}`).toString('base64');

async function createInteractionWithContact() {
  try {
    console.log('=== STEP 1: Get Case Data for Contact/Account ===');
    const caseResponse = await axios.get(
      `https://${instance}.service-now.com/api/now/table/x_mobit_serv_case_service_case/f753b7c08378721039717000feaad385`,
      {
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account'
        },
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const caseData = caseResponse.data.result;
    console.log('Case Data:', JSON.stringify(caseData, null, 2));

    const contactSysId = caseData.contact.value;
    const accountSysId = caseData.account.value;
    const caseSysId = 'f753b7c08378721039717000feaad385';

    console.log('\n=== STEP 2: Create Interaction with Contact/Account ===');

    const payload = {
      type: 'phone',
      direction: 'inbound',
      caller_phone_number: '+14097906402',
      contact: contactSysId,  // Customer Contact reference
      account: accountSysId,  // Customer Account reference
      context_table: 'x_mobit_serv_case_service_case',
      context_document: caseSysId,
      channel_metadata_table: 'x_mobit_serv_case_service_case',
      channel_metadata_document: caseSysId,
      opened_at: '2025-10-20 11:30:11',
      closed_at: '2025-10-20 11:35:22',
      short_description: 'Test interaction with contact/account - Webex Voice Call',
      work_notes: `Call Session ID: TEST-SESSION-123
Duration: 312 seconds
Contact: Alicia Tarver (from case)
Account: Exceptional (from case)`,
      state: 'closed_complete'  // Valid closed state
    };

    console.log('Payload:', JSON.stringify(payload, null, 2));

    const createResponse = await axios.post(
      `https://${instance}.service-now.com/api/now/table/interaction`,
      payload,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account,state,context_document,caller_phone_number,opened_at,closed_at'
        }
      }
    );

    console.log('\n=== CREATE RESULT ===');
    console.log(JSON.stringify(createResponse.data.result, null, 2));

    const interactionSysId = createResponse.data.result.sys_id?.value;
    const interactionNumber = createResponse.data.result.number?.value;

    console.log('\n=== STEP 3: Verify Created Interaction ===');
    console.log('Interaction Number:', interactionNumber);
    console.log('Sys ID:', interactionSysId);

    if (interactionSysId) {
      const verifyResponse = await axios.get(
        `https://${instance}.service-now.com/api/now/table/interaction/${interactionSysId}`,
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

      console.log('Verified interaction:', JSON.stringify(verifyResponse.data.result, null, 2));

      // Check if contact and account are populated
      const contact = verifyResponse.data.result.contact?.display_value;
      const account = verifyResponse.data.result.account?.display_value;
      const state = verifyResponse.data.result.state?.value;

      console.log('\n=== VALIDATION ===');
      console.log('Contact populated:', contact ? `YES - ${contact}` : 'NO');
      console.log('Account populated:', account ? `YES - ${account}` : 'NO');
      console.log('State:', state);
      console.log('Context linked:', verifyResponse.data.result.context_document?.display_value);
    }

  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

createInteractionWithContact();
