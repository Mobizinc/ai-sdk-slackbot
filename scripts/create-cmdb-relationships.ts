import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function createRelationships() {
  console.log('Creating CMDB Relationships');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const endpointManagementSysId = '8120bf9ac320f210ad36b9ff050131d8';
  const helpdesk247SysId = '377ea3d2c368721066d9bdb4e40131d2';
  const helpdeskStandardSysId = 'ae8f6356c368721066d9bdb4e40131a3';
  
  // Relationship 1: Helpdesk 24/7 depends on Endpoint Management
  console.log('Creating relationship 1:');
  console.log('  Helpdesk and Endpoint Support - 24/7');
  console.log('  DEPENDS ON');
  console.log('  Endpoint Management Platform');
  console.log('');
  
  const rel1Payload = {
    parent: endpointManagementSysId,  // Endpoint Management (what is depended on)
    child: helpdesk247SysId,           // Helpdesk 24/7 (what depends)
    type: 'Depends on::Used by'        // Standard ServiceNow relationship type
  };
  
  const rel1Response = await fetch(instanceUrl + '/api/now/table/cmdb_rel_ci', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rel1Payload),
  });
  
  if (rel1Response.ok) {
    const rel1Data = await rel1Response.json();
    console.log('  ✅ Relationship 1 created');
    console.log('     sys_id:', rel1Data.result.sys_id);
  } else {
    const errorText = await rel1Response.text();
    console.log('  ❌ Failed to create relationship 1');
    console.log('     Error:', errorText);
  }
  
  console.log('');
  
  // Relationship 2: Helpdesk Standard depends on Endpoint Management
  console.log('Creating relationship 2:');
  console.log('  Helpdesk and Endpoint - Standard');
  console.log('  DEPENDS ON');
  console.log('  Endpoint Management Platform');
  console.log('');
  
  const rel2Payload = {
    parent: endpointManagementSysId,  // Endpoint Management (what is depended on)
    child: helpdeskStandardSysId,      // Helpdesk Standard (what depends)
    type: 'Depends on::Used by'        // Standard ServiceNow relationship type
  };
  
  const rel2Response = await fetch(instanceUrl + '/api/now/table/cmdb_rel_ci', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rel2Payload),
  });
  
  if (rel2Response.ok) {
    const rel2Data = await rel2Response.json();
    console.log('  ✅ Relationship 2 created');
    console.log('     sys_id:', rel2Data.result.sys_id);
  } else {
    const errorText = await rel2Response.text();
    console.log('  ❌ Failed to create relationship 2');
    console.log('     Error:', errorText);
  }
  
  console.log('');
  console.log('─'.repeat(70));
  console.log('✅ CMDB Relationships created!');
  console.log('');
  console.log('Structure:');
  console.log('  Endpoint Management Platform (Infrastructure)');
  console.log('  ├─ SUPPORTS → Helpdesk and Endpoint Support - 24/7');
  console.log('  └─ SUPPORTS → Helpdesk and Endpoint - Standard');
}

createRelationships().catch(console.error);
