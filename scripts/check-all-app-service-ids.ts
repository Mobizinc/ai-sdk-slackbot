import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkIds() {
  console.log('Checking u_sn_app_service_id field for all Service Offerings');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_limit=50&sysparm_display_value=all&sysparm_fields=sys_id,name,u_sn_app_service_id';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  
  console.log('Total Service Offerings:', data.result.length);
  console.log('');
  
  // Group by u_sn_app_service_id value
  const grouped = {};
  for (const so of data.result) {
    const id = so.u_sn_app_service_id?.display_value || so.u_sn_app_service_id || '(empty)';
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(so.name?.display_value || so.name);
  }
  
  console.log('u_sn_app_service_id values:');
  for (const [id, names] of Object.entries(grouped)) {
    console.log('  "' + id + '": ' + names.length + ' Service Offering(s)');
    if (names.length > 1 || id !== '(empty)') {
      for (const name of names) {
        console.log('    - ' + name);
      }
    }
  }
}

checkIds().catch(console.error);
