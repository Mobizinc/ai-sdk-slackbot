/**
 * Check Valid Choices for portfolio_status Field
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkChoices() {
  console.log('🔍 Checking portfolio_status Field Choices');
  console.log('');

  // Query the dictionary entry for portfolio_status field
  const url = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=service_offering^element=portfolio_status&sysparm_fields=element,column_label,internal_type,reference,choice&sysparm_display_value=all`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const data = await response.json();

  console.log('Dictionary Entry:');
  console.log(JSON.stringify(data.result, null, 2));
  console.log('');

  // Query choice list
  const choiceUrl = `${instanceUrl}/api/now/table/sys_choice?sysparm_query=name=service_offering^element=portfolio_status&sysparm_fields=label,value,sequence&sysparm_display_value=all&sysparm_order_by=sequence`;

  const choiceResponse = await fetch(choiceUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const choiceData = await choiceResponse.json();

  console.log('Valid Choices for portfolio_status:');
  if (choiceData.result && choiceData.result.length > 0) {
    choiceData.result.forEach((choice: any) => {
      console.log(`  ${choice.label?.display_value || choice.label}: ${choice.value?.value || choice.value}`);
    });
  } else {
    console.log('  (No choices found - might be free text field)');
  }
}

checkChoices().catch(console.error);
