import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function inspect() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Get the 3 Service Offerings we just created
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_display_value=all';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('Found ' + data.result.length + ' Service Offerings:');
  console.log('');
  
  for (const so of data.result) {
    console.log('Name:', so.name?.display_value || so.name);
    console.log('sys_id:', so.sys_id?.value || so.sys_id);
    console.log('u_sn_app_service_id:', so.u_sn_app_service_id?.display_value || so.u_sn_app_service_id || '(empty)');
    console.log('vendor:', so.vendor?.display_value || so.vendor || '(empty)');
    console.log('');
  }
}

inspect().catch(console.error);
