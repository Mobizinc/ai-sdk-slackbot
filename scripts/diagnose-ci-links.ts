import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function diagnoseCILinks() {
  console.log('🔍 Diagnosing CI Links and Operational Status in PROD');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // 1. Check Business Service
  console.log('📦 LEVEL 1: Business Service');
  console.log('─'.repeat(70));
  const bsUrl = instanceUrl + '/api/now/table/cmdb_ci_service_business/e24d6752c368721066d9bdb4e40131a8?sysparm_display_value=all&sysparm_fields=sys_id,name,operational_status';
  const bsResponse = await fetch(bsUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const bsData = await bsResponse.json();
  const bsName = bsData.result.name && bsData.result.name.display_value ? bsData.result.name.display_value : bsData.result.name;
  const bsStatus = bsData.result.operational_status && bsData.result.operational_status.display_value ? bsData.result.operational_status.display_value : bsData.result.operational_status;
  console.log('Name:', bsName);
  console.log('Status:', bsStatus);
  console.log('');
  
  // 2. Check Service Offerings
  console.log('📂 LEVEL 2: Service Offerings');
  console.log('─'.repeat(70));
  const soUrl = instanceUrl + '/api/now/table/service_offering?sysparm_query=parent=e24d6752c368721066d9bdb4e40131a8&sysparm_display_value=all&sysparm_fields=sys_id,name,parent,operational_status';
  const soResponse = await fetch(soUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const soData = await soResponse.json();
  
  for (const so of soData.result) {
    const soName = so.name && so.name.display_value ? so.name.display_value : so.name;
    const soStatus = so.operational_status && so.operational_status.display_value ? so.operational_status.display_value : so.operational_status;
    const parentValue = so.parent && so.parent.value ? so.parent.value : so.parent;
    const parentDisplay = so.parent && so.parent.display_value ? so.parent.display_value : '(no parent)';
    
    console.log('Service Offering:', soName);
    console.log('  Status:', soStatus);
    console.log('  Parent sys_id:', parentValue);
    console.log('  Parent name:', parentDisplay);
    console.log('');
  }
  
  // 3. Check Application Services under Application Administration
  console.log('🖥️  LEVEL 3: Application Services under Application Administration');
  console.log('─'.repeat(70));
  
  // First get Application Administration sys_id
  const appAdminUrl = instanceUrl + '/api/now/table/service_offering?sysparm_query=name=Application Administration&sysparm_fields=sys_id';
  const appAdminResponse = await fetch(appAdminUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const appAdminData = await appAdminResponse.json();
  const appAdminSysId = appAdminData.result[0].sys_id;
  console.log('Application Administration sys_id:', appAdminSysId);
  console.log('');
  
  // Now check Application Services
  const asUrl = instanceUrl + '/api/now/table/cmdb_ci_service_discovered?sysparm_query=nameLIKEAltus Health^parent=' + appAdminSysId + '&sysparm_display_value=all&sysparm_fields=name,parent,operational_status&sysparm_limit=20';
  const asResponse = await fetch(asUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const asData = await asResponse.json();
  
  console.log('Found', asData.result.length, 'Application Services under Application Administration');
  console.log('');
  
  for (const as of asData.result) {
    const asName = as.name && as.name.display_value ? as.name.display_value : as.name;
    const asStatus = as.operational_status && as.operational_status.display_value ? as.operational_status.display_value : as.operational_status;
    const parentValue = as.parent && as.parent.value ? as.parent.value : as.parent;
    const parentDisplay = as.parent && as.parent.display_value ? as.parent.display_value : '(no parent)';
    
    console.log('App Service:', asName);
    console.log('  Status:', asStatus);
    console.log('  Parent sys_id:', parentValue);
    console.log('  Parent name:', parentDisplay);
    console.log('');
  }
  
  // 4. Summary
  console.log('─'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log('');
  console.log('Issues Found:');
  let issueCount = 0;
  
  // Check Service Offerings status
  const pipelineSOs = soData.result.filter(so => {
    const status = so.operational_status && so.operational_status.display_value ? so.operational_status.display_value : so.operational_status;
    return status === 'Pipeline' || status === '4';
  });
  
  if (pipelineSOs.length > 0) {
    issueCount++;
    console.log(issueCount + '. Service Offerings in Pipeline status:', pipelineSOs.length);
    for (const so of pipelineSOs) {
      const name = so.name && so.name.display_value ? so.name.display_value : so.name;
      console.log('   -', name);
    }
  }
  
  // Check for missing parent links
  const orphanedAS = asData.result.filter(as => {
    const parentValue = as.parent && as.parent.value ? as.parent.value : as.parent;
    return !parentValue || parentValue === '';
  });
  
  if (orphanedAS.length > 0) {
    issueCount++;
    console.log(issueCount + '. Application Services with missing parent links:', orphanedAS.length);
    for (const as of orphanedAS) {
      const name = as.name && as.name.display_value ? as.name.display_value : as.name;
      console.log('   -', name);
    }
  }
  
  if (issueCount === 0) {
    console.log('✅ No issues found! All links and statuses are correct.');
  }
}

diagnoseCILinks().catch(console.error);
