/**
 * Test different methods of creating ServiceNow interaction records
 * and linking them to parent cases
 */

const SERVICENOW_URL = process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

const CASE_SYS_ID = 'f753b7c08378721039717000feaad385';  // SCS0049247
const CASE_NUMBER = 'SCS0049247';
const CASE_TABLE = 'x_mobit_serv_case_service_case';

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

async function testMethod1_ContextDocument() {
  console.log('\n=== METHOD 1: Using context_document and context_table ===');
  console.log('Theory: Link interaction to case using document_id pattern');

  const payload = {
    type: 'phone',
    direction: 'inbound',
    short_description: `Test Phone Call - Method 1 - ${new Date().toISOString()}`,
    state: 'closed',

    // Link to case using context fields
    context_table: CASE_TABLE,
    context_document: CASE_SYS_ID,

    // Channel metadata (alternative linking method)
    channel_metadata_table: CASE_TABLE,
    channel_metadata_document: CASE_SYS_ID,
  };

  try {
    const response = await fetch(`${SERVICENOW_URL}/api/now/table/interaction`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('SUCCESS! Interaction created:');
      console.log(`  sys_id: ${data.result.sys_id}`);
      console.log(`  number: ${data.result.number}`);
      console.log(`  URL: ${SERVICENOW_URL}/nav_to.do?uri=interaction.do?sys_id=${data.result.sys_id}`);

      // Fetch the record back to verify context linking
      const fetchResponse = await fetch(
        `${SERVICENOW_URL}/api/now/table/interaction/${data.result.sys_id}?sysparm_display_value=all`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        }
      );

      const fetchData = await fetchResponse.json();
      console.log('\n  Verification - context_table:', fetchData.result?.context_table);
      console.log('  Verification - context_document:', fetchData.result?.context_document);
      console.log('  Verification - channel_metadata_table:', fetchData.result?.channel_metadata_table);
      console.log('  Verification - channel_metadata_document:', fetchData.result?.channel_metadata_document);

      return data.result.sys_id;
    } else {
      console.log('FAILED:', data);
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

async function testMethod2_Parent() {
  console.log('\n=== METHOD 2: Using parent field (if case is also an interaction) ===');
  console.log('Theory: Link using parent reference field');

  // This won't work since case is not an interaction, but test it
  const payload = {
    type: 'phone',
    direction: 'inbound',
    short_description: `Test Phone Call - Method 2 - ${new Date().toISOString()}`,
    state: 'closed',
    parent: CASE_SYS_ID,  // This will fail - case is not an interaction
  };

  try {
    const response = await fetch(`${SERVICENOW_URL}/api/now/table/interaction`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('SUCCESS (unexpected):');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('FAILED (expected):', data.error?.message || data);
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

async function testMethod3_LookupUser() {
  console.log('\n=== METHOD 3: Lookup user from case and use opened_for ===');
  console.log('Theory: Get the case contact/opened_for and link interaction to same user');

  try {
    // First, get the case details to find the customer/contact
    const caseResponse = await fetch(
      `${SERVICENOW_URL}/api/now/table/${CASE_TABLE}/${CASE_SYS_ID}?sysparm_fields=opened_for,contact,u_contact,caller,sys_id`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      }
    );

    const caseData = await caseResponse.json();
    console.log('Case fields:', JSON.stringify(caseData.result, null, 2));

    const openedFor = caseData.result?.opened_for?.value || caseData.result?.opened_for;
    const contact = caseData.result?.contact?.value || caseData.result?.contact;
    const caller = caseData.result?.caller?.value || caseData.result?.caller;

    console.log('Found opened_for:', openedFor);
    console.log('Found contact:', contact);
    console.log('Found caller:', caller);

    if (openedFor || caller) {
      const payload = {
        type: 'phone',
        direction: 'inbound',
        short_description: `Test Phone Call - Method 3 - ${new Date().toISOString()}`,
        state: 'closed',
        opened_for: openedFor || caller,  // Link to user

        // Also try context linking
        context_table: CASE_TABLE,
        context_document: CASE_SYS_ID,
      };

      const response = await fetch(`${SERVICENOW_URL}/api/now/table/interaction`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('SUCCESS! Interaction created:');
        console.log(`  sys_id: ${data.result.sys_id}`);
        console.log(`  number: ${data.result.number}`);
        console.log(`  URL: ${SERVICENOW_URL}/nav_to.do?uri=interaction.do?sys_id=${data.result.sys_id}`);

        return data.result.sys_id;
      } else {
        console.log('FAILED:', data);
      }
    } else {
      console.log('SKIPPED: No user found on case');
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

async function checkInteractionRelatedLists() {
  console.log('\n=== CHECKING: Are there interaction related lists on case table? ===');

  try {
    // Check if case record has any related interactions
    const response = await fetch(
      `${SERVICENOW_URL}/api/now/table/interaction?sysparm_query=context_document=${CASE_SYS_ID}^ORcontext_table=${CASE_TABLE}&sysparm_limit=10`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      }
    );

    const data = await response.json();
    console.log(`Found ${data.result?.length || 0} interactions linked via context_document to case ${CASE_NUMBER}`);

    if (data.result && data.result.length > 0) {
      console.log('\nExisting interactions:');
      for (const interaction of data.result) {
        console.log(`  - ${interaction.number}: ${interaction.short_description}`);
      }
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

async function main() {
  console.log('=== TESTING SERVICENOW INTERACTION CREATION METHODS ===');
  console.log(`Case: ${CASE_NUMBER} (${CASE_SYS_ID})`);

  await checkInteractionRelatedLists();
  await testMethod1_ContextDocument();
  await testMethod2_Parent();
  await testMethod3_LookupUser();

  console.log('\n=== TEST COMPLETE ===');
  console.log('Please check the ServiceNow UI to verify which method successfully linked the interaction to the case.');
}

main().catch(console.error);
