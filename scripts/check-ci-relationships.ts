import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkCIRelationships() {
  console.log('🔗 Checking CMDB CI Relationships (cmdb_rel_ci table)');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Check CI relationships for Business Service
  const bsSysId = 'e24d6752c368721066d9bdb4e40131a8';
  
  console.log('1. CI Relationships where Business Service is Parent:');
  console.log('─'.repeat(70));
  const bsParentUrl = instanceUrl + '/api/now/table/cmdb_rel_ci?sysparm_query=parent=' + bsSysId + '&sysparm_display_value=all&sysparm_fields=parent,child,type';
  const bsParentResponse = await fetch(bsParentUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const bsParentData = await bsParentResponse.json();
  
  if (bsParentData.result.length === 0) {
    console.log('❌ No CI relationships found with Business Service as parent');
    console.log('   Expected: 6 relationships (one for each Service Offering)');
  } else {
    console.log('✅ Found', bsParentData.result.length, 'CI relationship(s):');
    for (const rel of bsParentData.result) {
      const childName = rel.child && rel.child.display_value ? rel.child.display_value : rel.child;
      const relType = rel.type && rel.type.display_value ? rel.type.display_value : rel.type;
      console.log('   -', relType, '→', childName);
    }
  }
  console.log('');
  
  // Check CI relationships for Application Administration Service Offering
  const appAdminSysId = '7abe6bd6c320f210ad36b9ff05013112';
  
  console.log('2. CI Relationships where Application Administration is Parent:');
  console.log('─'.repeat(70));
  const appAdminUrl = instanceUrl + '/api/now/table/cmdb_rel_ci?sysparm_query=parent=' + appAdminSysId + '&sysparm_display_value=all&sysparm_fields=parent,child,type&sysparm_limit=20';
  const appAdminResponse = await fetch(appAdminUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const appAdminData = await appAdminResponse.json();
  
  if (appAdminData.result.length === 0) {
    console.log('❌ No CI relationships found with Application Administration as parent');
    console.log('   Expected: 18 relationships (one for each Application Service)');
  } else {
    console.log('✅ Found', appAdminData.result.length, 'CI relationship(s):');
    for (const rel of appAdminData.result) {
      const childName = rel.child && rel.child.display_value ? rel.child.display_value : rel.child;
      const relType = rel.type && rel.type.display_value ? rel.type.display_value : rel.type;
      console.log('   -', relType, '→', childName);
    }
  }
  console.log('');
  
  console.log('─'.repeat(70));
  console.log('📝 NOTES:');
  console.log('─'.repeat(70));
  console.log('In ServiceNow CMDB, there are TWO ways to link CIs:');
  console.log('');
  console.log('1. Parent field (hierarchy) - WHAT WE HAVE');
  console.log('   - Set on each CI record');
  console.log('   - Shows in forms and lists');
  console.log('   - Used for: Business Service → Service Offering → App Service');
  console.log('');
  console.log('2. CI Relationships (cmdb_rel_ci table) - MAY BE MISSING');
  console.log('   - Separate relationship records');
  console.log('   - Shows in CI Relationship viewer');
  console.log('   - Used for: Dependencies, connections, "runs on", etc.');
  console.log('');
  console.log('The "parent" field creates the hierarchy, but ServiceNow may');
  console.log('expect formal CI Relationships for the relationship viewer.');
}

checkCIRelationships().catch(console.error);
