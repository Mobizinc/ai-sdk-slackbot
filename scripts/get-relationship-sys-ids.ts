import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function getSysIds() {
  console.log('Getting sys_ids for relationship creation');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Get Endpoint Management Platform
  const empUrl = instanceUrl + '/api/now/table/cmdb_ci_service_discovered?sysparm_query=name=Altus Health - Endpoint Management Platform&sysparm_fields=sys_id,name,sys_class_name';
  const empResponse = await fetch(empUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const empData = await empResponse.json();
  
  console.log('Application Service:');
  console.log('  Name: Altus Health - Endpoint Management Platform');
  console.log('  sys_id:', empData.result[0].sys_id);
  console.log('  Table:', empData.result[0].sys_class_name);
  console.log('');
  
  // Get Helpdesk Service Offerings
  const helpdesk1Url = instanceUrl + '/api/now/table/service_offering?sysparm_query=name=Helpdesk and Endpoint Support - 24/7&sysparm_fields=sys_id,name,sys_class_name';
  const helpdesk1Response = await fetch(helpdesk1Url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const helpdesk1Data = await helpdesk1Response.json();
  
  console.log('Service Offering 1:');
  console.log('  Name: Helpdesk and Endpoint Support - 24/7');
  console.log('  sys_id:', helpdesk1Data.result[0].sys_id);
  console.log('  Table:', helpdesk1Data.result[0].sys_class_name);
  console.log('');
  
  const helpdesk2Url = instanceUrl + '/api/now/table/service_offering?sysparm_query=name=Helpdesk and Endpoint - Standard&sysparm_fields=sys_id,name,sys_class_name';
  const helpdesk2Response = await fetch(helpdesk2Url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const helpdesk2Data = await helpdesk2Response.json();
  
  console.log('Service Offering 2:');
  console.log('  Name: Helpdesk and Endpoint - Standard');
  console.log('  sys_id:', helpdesk2Data.result[0].sys_id);
  console.log('  Table:', helpdesk2Data.result[0].sys_class_name);
}

getSysIds().catch(console.error);
