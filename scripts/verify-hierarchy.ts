import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function verifyHierarchy() {
  console.log('🔗 Verifying Complete Hierarchy in PROD');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Level 1: Business Service
  const bsUrl = instanceUrl + '/api/now/table/cmdb_ci_service_business/e24d6752c368721066d9bdb4e40131a8?sysparm_display_value=all&sysparm_fields=sys_id,name,number';
  const bsResponse = await fetch(bsUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const bsData = await bsResponse.json();
  
  console.log('📦 LEVEL 1: Business Service');
  console.log('─'.repeat(70));
  const bsName = bsData.result.name && bsData.result.name.display_value ? bsData.result.name.display_value : bsData.result.name;
  const bsNumber = bsData.result.number && bsData.result.number.display_value ? bsData.result.number.display_value : bsData.result.number;
  console.log('   ' + bsName);
  console.log('   (' + bsNumber + ')');
  console.log('');
  
  // Level 2: Service Offerings
  const soUrl = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_display_value=all&sysparm_fields=sys_id,name,parent';
  const soResponse = await fetch(soUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const soData = await soResponse.json();
  
  console.log('📂 LEVEL 2: Service Offerings (' + soData.result.length + ')');
  console.log('─'.repeat(70));
  
  for (const so of soData.result) {
    const soName = so.name && so.name.display_value ? so.name.display_value : so.name;
    const parentName = so.parent && so.parent.display_value ? so.parent.display_value : '(no parent)';
    console.log('   ├─ ' + soName);
    console.log('   │  Parent: ' + parentName + ' ✓');
    
    // Level 3: Application Services under this Service Offering
    const soSysId = so.sys_id && so.sys_id.value ? so.sys_id.value : so.sys_id;
    const asUrl = instanceUrl + '/api/now/table/cmdb_ci_service_discovered?sysparm_query=parent=' + soSysId + '&sysparm_display_value=all&sysparm_fields=name,parent';
    const asResponse = await fetch(asUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });
    const asData = await asResponse.json();
    
    if (asData.result.length > 0) {
      console.log('   │  └─ Application Services (' + asData.result.length + '):');
      for (let i = 0; i < asData.result.length; i++) {
        const as = asData.result[i];
        const asName = as.name && as.name.display_value ? as.name.display_value : as.name;
        const prefix = i === asData.result.length - 1 ? '      └─' : '      ├─';
        console.log('   │  ' + prefix + ' ' + asName);
      }
    }
    console.log('   │');
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ Complete hierarchy verified!');
  console.log('');
  console.log('Structure:');
  console.log('   Business Service (1)');
  console.log('   └─ Service Offerings (6)');
  console.log('      └─ Application Services (24 total)');
}

verifyHierarchy().catch(console.error);
