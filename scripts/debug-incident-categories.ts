/**
 * Debug Incident Category Setting
 * Investigates why incident categories aren't being set when creating incidents from cases
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars from parent directory's .env.local
const envPath = resolve(process.cwd(), '../ai-sdk-slackbot/.env.local');
config({ path: envPath });

async function debugIncidentCategories() {
  const baseUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;

  if (!baseUrl || !username || !password) {
    console.error('❌ ServiceNow DEV credentials not configured');
    process.exit(1);
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  console.log('🔍 Debugging Incident Category Setting');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // Step 1: Get choice list values for incident categories
    console.log('📋 Step 1: Fetching Incident category choice list...\n');

    const choiceUrl = `${baseUrl}/api/now/table/sys_choice?sysparm_query=name=incident^element=category&sysparm_fields=label,value,inactive&sysparm_limit=100`;

    const choiceResponse = await fetch(choiceUrl, { headers });
    if (!choiceResponse.ok) {
      throw new Error(`Failed to fetch choice list: ${choiceResponse.status}`);
    }

    const choiceData = await choiceResponse.json();
    const categories = choiceData.result
      .filter((c: any) => !c.inactive || c.inactive === 'false')
      .map((c: any) => ({ label: c.label, value: c.value }));

    console.log(`✅ Found ${categories.length} active incident categories:\n`);
    categories.slice(0, 10).forEach((cat: any, i: number) => {
      console.log(`   ${i + 1}. "${cat.label}" (value: "${cat.value}")`);
    });
    if (categories.length > 10) {
      console.log(`   ... and ${categories.length - 10} more`);
    }
    console.log('');

    // Step 2: Find an open case to link to
    console.log('📋 Step 2: Finding an open case for testing...\n');

    const caseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';
    const caseQuery = 'state!=6^state!=7^state!=8^ORDERBYDESCsys_created_on';
    const caseUrl = `${baseUrl}/api/now/table/${caseTable}?sysparm_query=${caseQuery}&sysparm_limit=1&sysparm_fields=sys_id,number,short_description,company`;

    const caseResponse = await fetch(caseUrl, { headers });
    if (!caseResponse.ok) {
      throw new Error(`Failed to fetch case: ${caseResponse.status}`);
    }

    const caseData = await caseResponse.json();
    if (!caseData.result || caseData.result.length === 0) {
      throw new Error('No open cases found for testing');
    }

    const testCase = caseData.result[0];
    console.log(`✅ Found test case: ${testCase.number}`);
    console.log(`   Description: ${testCase.short_description}`);
    console.log('');

    // Step 3: Create incident with explicit categories (using first available category)
    console.log('📋 Step 3: Creating test incident with explicit categories...\n');

    const testCategory = categories[0].value; // Use first available category
    const testSubcategory = 'Test Subcategory'; // Simple subcategory

    const incidentPayload = {
      short_description: `TEST: Incident category debug - ${new Date().toISOString()}`,
      description: 'Testing incident category setting from API',
      category: testCategory,
      subcategory: testSubcategory,
      impact: '3',
      urgency: '3',
      company: testCase.company || undefined,
      // Link to test case
      u_parent_case: testCase.sys_id,
      // Add work notes to identify this as test
      work_notes: `[DEBUG] Testing incident category setting
Category: ${testCategory}
Subcategory: ${testSubcategory}
Created by: ai-sdk-slackbot debug script`,
    };

    console.log('📤 Request payload:');
    console.log(JSON.stringify(incidentPayload, null, 2));
    console.log('');

    const createUrl = `${baseUrl}/api/now/table/incident`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(incidentPayload),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create incident: ${createResponse.status} - ${errorText}`);
    }

    const createData = await createResponse.json();
    const createdIncident = createData.result;

    console.log(`✅ Incident created: ${createdIncident.number} (${createdIncident.sys_id})`);
    console.log('');

    // Step 4: Fetch the created incident to verify categories
    console.log('📋 Step 4: Verifying category values on created incident...\n');

    const verifyUrl = `${baseUrl}/api/now/table/incident/${createdIncident.sys_id}?sysparm_fields=number,category,subcategory,short_description,work_notes&sysparm_display_value=all`;

    const verifyResponse = await fetch(verifyUrl, { headers });
    if (!verifyResponse.ok) {
      throw new Error(`Failed to fetch created incident: ${verifyResponse.status}`);
    }

    const verifyData = await verifyResponse.json();
    const incident = verifyData.result;

    console.log('📥 Created incident values:');
    console.log(`   Number: ${incident.number}`);
    console.log(`   Category: ${incident.category?.display_value || incident.category || '(NOT SET)'}`);
    console.log(`   Subcategory: ${incident.subcategory?.display_value || incident.subcategory || '(NOT SET)'}`);
    console.log('');

    // Step 5: Analysis
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 ANALYSIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const categorySet = !!(incident.category?.display_value || incident.category);
    const subcategorySet = !!(incident.subcategory?.display_value || incident.subcategory);

    if (categorySet) {
      console.log('✅ Category WAS set successfully!');
      console.log(`   Sent: "${testCategory}"`);
      console.log(`   Received: "${incident.category?.display_value || incident.category}"`);
    } else {
      console.log('❌ Category was NOT set!');
      console.log(`   Sent: "${testCategory}"`);
      console.log('   Received: (empty)');
      console.log('');
      console.log('💡 Possible causes:');
      console.log('   1. Field name mismatch (try "u_category" instead of "category")');
      console.log('   2. Choice list value mismatch (category value not in choice list)');
      console.log('   3. Field permissions (field may be read-only or require specific role)');
      console.log('   4. Business rule clearing the field on insert');
    }

    if (subcategorySet) {
      console.log(`\n✅ Subcategory WAS set successfully!`);
      console.log(`   Sent: "${testSubcategory}"`);
      console.log(`   Received: "${incident.subcategory?.display_value || incident.subcategory}"`);
    } else {
      console.log(`\n❌ Subcategory was NOT set!`);
      console.log(`   Sent: "${testSubcategory}"`);
      console.log('   Received: (empty)');
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 NEXT STEPS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!categorySet) {
      console.log('1. Check ServiceNow incident table schema:');
      console.log(`   ${baseUrl}/sys_dictionary_list.do?sysparm_query=name=incident^element=category`);
      console.log('');
      console.log('2. Try alternative field names in payload:');
      console.log('   - u_category');
      console.log('   - incident_category');
      console.log('');
      console.log('3. Check if field requires display_value format:');
      console.log('   - Send category label instead of value');
      console.log('');
      console.log('4. Review business rules on incident table:');
      console.log(`   ${baseUrl}/sys_script_list.do?sysparm_query=table=incident^active=true`);
    } else {
      console.log('✅ Categories ARE being set correctly!');
      console.log('   The issue may be specific to createIncidentFromCase() method.');
      console.log('   Check lib/tools/servicenow.ts payload construction.');
    }

    console.log('');
    console.log(`🔗 View created incident: ${baseUrl}/incident.do?sys_id=${createdIncident.sys_id}`);

  } catch (error) {
    console.error('❌ Debug failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

debugIncidentCategories();
