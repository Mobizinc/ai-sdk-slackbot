import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function findAll() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const url = instanceUrl + '/api/now/table/service_offering?sysparm_limit=50&sysparm_display_value=all&sysparm_fields=sys_id,name,u_sn_app_service_id,parent';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('Found ' + data.result.length + ' total Service Offerings in PROD:');
  console.log('');
  
  for (const so of data.result) {
    console.log('Name:', so.name?.display_value || so.name);
    console.log('sys_id:', so.sys_id?.value || so.sys_id);
    console.log('parent:', so.parent?.display_value || so.parent || '(empty)');
    console.log('u_sn_app_service_id:', so.u_sn_app_service_id?.display_value || so.u_sn_app_service_id || '(empty)');
    console.log('');
  }
}

findAll().catch(console.error);
