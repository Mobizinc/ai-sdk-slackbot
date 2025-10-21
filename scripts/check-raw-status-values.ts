import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkRawValues() {
  console.log('Checking RAW operational_status values');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Get Service Offerings with RAW values
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_fields=name,operational_status';
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  
  console.log('Service Offerings - RAW operational_status values:');
  console.log('');
  for (const so of data.result) {
    console.log('Name:', so.name);
    console.log('  operational_status (raw):', so.operational_status);
    console.log('');
  }
  
  console.log('─'.repeat(70));
  console.log('ServiceNow operational_status choice values:');
  console.log('  1 = Operational');
  console.log('  2 = Standby');  
  console.log('  3 = Maintenance');
  console.log('  4 = Pipeline');
  console.log('  5 = Retired');
  console.log('  6 = Non-Operational');
}

checkRawValues().catch(console.error);
