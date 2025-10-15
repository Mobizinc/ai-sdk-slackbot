import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkExisting() {
  console.log('Checking if Service Offering already exists');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Search for this exact name
  const searchName = 'Helpdesk and Endpoint Support - Standard Business Hours';
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_query=' + encodeURIComponent('name=' + searchName) + '&sysparm_display_value=all';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('Found ' + data.result.length + ' existing Service Offering(s) with this name:');
  console.log('');
  
  if (data.result.length > 0) {
    for (const so of data.result) {
      console.log('  Name:', so.name?.display_value || so.name);
      console.log('  sys_id:', so.sys_id?.value || so.sys_id);
      console.log('  parent:', so.parent?.display_value || '(empty)');
      console.log('  vendor:', so.vendor?.display_value || '(empty)');
      console.log('');
    }
  } else {
    console.log('  None found - should be safe to create');
  }
}

checkExisting().catch(console.error);
