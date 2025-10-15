import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function verify() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const url = instanceUrl + '/api/now/table/cmdb_ci_service_business/e24d6752c368721066d9bdb4e40131a8?sysparm_display_value=all&sysparm_fields=sys_id,name,number,vendor';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data.result, null, 2));
}

verify().catch(console.error);
