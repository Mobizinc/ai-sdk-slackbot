import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function verifyRelationships() {
  console.log('🔗 Verifying CMDB Relationships');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const endpointManagementSysId = '8120bf9ac320f210ad36b9ff050131d8';
  
  // Query relationships where Endpoint Management is the parent (what others depend on)
  const query = 'parent=' + endpointManagementSysId;
  const url = instanceUrl + '/api/now/table/cmdb_rel_ci?sysparm_query=' + encodeURIComponent(query) + '&sysparm_display_value=all&sysparm_fields=sys_id,parent,child,type';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  
  console.log('Relationships for Endpoint Management Platform:');
  console.log('');
  
  if (data.result.length === 0) {
    console.log('  ❌ No relationships found');
  } else {
    console.log('  Parent: Endpoint Management Platform (Infrastructure)');
    console.log('');
    for (const rel of data.result) {
      const childName = rel.child && rel.child.display_value ? rel.child.display_value : rel.child;
      const relType = rel.type && rel.type.display_value ? rel.type.display_value : rel.type;
      console.log('  ✅ Relationship:');
      console.log('     Type:', relType);
      console.log('     Child:', childName);
      console.log('     sys_id:', rel.sys_id && rel.sys_id.value ? rel.sys_id.value : rel.sys_id);
      console.log('');
    }
  }
  
  console.log('─'.repeat(70));
  console.log('Complete Structure:');
  console.log('');
  console.log('📦 Business Service: Managed Support Services');
  console.log('   ├─ 📂 Infrastructure and Cloud Management');
  console.log('   │     └─ Endpoint Management Platform');
  console.log('   │        ├─ SUPPORTS → Helpdesk and Endpoint Support - 24/7');
  console.log('   │        └─ SUPPORTS → Helpdesk and Endpoint - Standard');
  console.log('   │');
  console.log('   ├─ 📂 Helpdesk and Endpoint Support - 24/7');
  console.log('   │     └─ DEPENDS ON ← Endpoint Management Platform');
  console.log('   │');
  console.log('   └─ 📂 Helpdesk and Endpoint - Standard');
  console.log('         └─ DEPENDS ON ← Endpoint Management Platform');
}

verifyRelationships().catch(console.error);
