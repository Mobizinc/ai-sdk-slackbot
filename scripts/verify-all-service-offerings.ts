import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function verify() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_display_value=all&sysparm_fields=sys_id,name,vendor';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('Found ' + data.result.length + ' Service Offerings under "Managed Support Services":');
  console.log('');
  
  const expected = [
    'Infrastructure and Cloud Management',
    'Network Management',
    'Cybersecurity Management',
    'Helpdesk and Endpoint Support - 24/7',
    'Helpdesk and Endpoint Support - Standard Business Hours',
    'Application Administration',
  ];
  
  for (const name of expected) {
    const found = data.result.find(so => (so.name?.display_value || so.name) === name);
    if (found) {
      const vendor = found.vendor?.display_value || '(empty)';
      console.log('  ✅', name);
      console.log('     sys_id:', found.sys_id?.value || found.sys_id);
      console.log('     vendor:', vendor);
    } else {
      console.log('  ❌ MISSING:', name);
    }
  }
  
  console.log('');
  console.log('Summary:', data.result.length, '/', expected.length, 'Service Offerings exist');
}

verify().catch(console.error);
