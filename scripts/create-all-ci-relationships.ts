import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function createAllCIRelationships() {
  console.log('🔗 Creating All CI Relationships in PROD');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const businessServiceSysId = 'e24d6752c368721066d9bdb4e40131a8';
  
  // STEP 1: Get all Service Offering sys_ids
  console.log('📂 STEP 1: Getting Service Offering sys_ids');
  console.log('─'.repeat(70));
  
  const soUrl = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=' + businessServiceSysId + '&sysparm_fields=sys_id,name';
  const soResponse = await fetch(soUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const soData = await soResponse.json();
  
  console.log('Found', soData.result.length, 'Service Offerings');
  console.log('');
  
  const serviceOfferings = soData.result.map(so => ({
    sys_id: so.sys_id,
    name: so.name
  }));
  
  // STEP 2: Create Business Service → Service Offering relationships
  console.log('🔗 STEP 2: Creating Business Service → Service Offering relationships');
  console.log('─'.repeat(70));
  
  let bsToSoCount = 0;
  for (const so of serviceOfferings) {
    const payload = {
      parent: businessServiceSysId,
      child: so.sys_id,
      type: 'Contains::Contained by'
    };
    
    const response = await fetch(instanceUrl + '/api/now/table/cmdb_rel_ci', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      const data = await response.json();
      bsToSoCount++;
      console.log('✅', so.name);
      console.log('   Relationship sys_id:', data.result.sys_id);
    } else {
      const errorText = await response.text();
      console.log('❌', so.name);
      console.log('   Error:', errorText);
    }
  }
  
  console.log('');
  console.log('Created', bsToSoCount, '/ 6 BS→SO relationships');
  console.log('');
  
  // STEP 3: Get all Application Services grouped by parent
  console.log('🖥️  STEP 3: Getting Application Services');
  console.log('─'.repeat(70));
  
  const asUrl = instanceUrl + '/api/now/table/cmdb_ci_service_discovered?sysparm_query=nameLIKEAltus Health&sysparm_fields=sys_id,name,parent&sysparm_limit=50';
  const asResponse = await fetch(asUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const asData = await asResponse.json();
  
  console.log('Found', asData.result.length, 'Application Services');
  console.log('');
  
  // STEP 4: Create Service Offering → Application Service relationships
  console.log('🔗 STEP 4: Creating Service Offering → Application Service relationships');
  console.log('─'.repeat(70));
  
  let soToAsCount = 0;
  for (const as of asData.result) {
    const parentSysId = as.parent;
    if (!parentSysId) {
      console.log('⚠️  Skipping', as.name, '- no parent');
      continue;
    }
    
    const payload = {
      parent: parentSysId,
      child: as.sys_id,
      type: 'Contains::Contained by'
    };
    
    const response = await fetch(instanceUrl + '/api/now/table/cmdb_rel_ci', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      const data = await response.json();
      soToAsCount++;
      console.log('✅', as.name);
    } else {
      const errorText = await response.text();
      console.log('❌', as.name);
      console.log('   Error:', errorText);
    }
  }
  
  console.log('');
  console.log('Created', soToAsCount, '/ 24 SO→AS relationships');
  console.log('');
  
  // STEP 5: Summary
  console.log('─'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log('Business Service → Service Offerings:', bsToSoCount, '/ 6');
  console.log('Service Offerings → Application Services:', soToAsCount, '/ 24');
  console.log('Total CI Relationships Created:', bsToSoCount + soToAsCount, '/ 30');
  console.log('');
  
  if (bsToSoCount === 6 && soToAsCount === 24) {
    console.log('✅ All CI relationships created successfully!');
  } else {
    console.log('⚠️  Some relationships may have failed. Check errors above.');
  }
}

createAllCIRelationships().catch(console.error);
