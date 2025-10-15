import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function list() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_display_value=all&sysparm_fields=sys_id,name,vendor';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('All 6 Service Offerings under "Managed Support Services":');
  console.log('');
  
  for (const so of data.result) {
    const name = so.name?.display_value || so.name;
    const vendor = so.vendor?.display_value || '(empty)';
    console.log('  ✅', name);
    console.log('     vendor:', vendor);
  }
  
  console.log('');
  console.log('Total:', data.result.length, 'Service Offerings');
}

list().catch(console.error);
