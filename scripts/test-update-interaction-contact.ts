import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const instance = process.env.SERVICENOW_URL!.replace('https://', '').replace('.service-now.com', '');
const username = process.env.SERVICENOW_USERNAME!;
const password = process.env.SERVICENOW_PASSWORD!;
const auth = Buffer.from(`${username}:${password}`).toString('base64');

async function updateInteractionContact() {
  try {
    console.log('=== STEP 1: Get Case Data ===');
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

    console.log('\n=== STEP 2: Update Interaction IMS0001462 ===');
    console.log('Contact sys_id to set:', contactSysId);
    console.log('Account sys_id to set:', accountSysId);

    const updatePayload = {
      contact: contactSysId,
      account: accountSysId
    };

    console.log('Update payload:', JSON.stringify(updatePayload, null, 2));

    const updateResponse = await axios.patch(
      `https://${instance}.service-now.com/api/now/table/interaction/03a95fa08378b210ba267000feaad307`,
      updatePayload,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account,state,context_document'
        }
      }
    );

    console.log('\n=== UPDATE RESULT ===');
    console.log(JSON.stringify(updateResponse.data.result, null, 2));

    console.log('\n=== STEP 3: Verify Update ===');
    const verifyResponse = await axios.get(
      `https://${instance}.service-now.com/api/now/table/interaction/03a95fa08378b210ba267000feaad307`,
      {
        params: {
          sysparm_display_value: 'all',
          sysparm_fields: 'number,contact,account,state,context_document,caller_phone_number'
        },
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('Verified interaction:', JSON.stringify(verifyResponse.data.result, null, 2));

  } catch (error: any) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

updateInteractionContact();
