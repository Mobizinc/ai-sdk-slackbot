import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkFirewallLinks() {
  console.log('Checking Firewall CI Links to Services');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Query Altus firewalls
  const fwUrl = instanceUrl + '/api/now/table/cmdb_ci_netgear?sysparm_query=nameLIKEAltus&sysparm_fields=sys_id,name,company,used_for&sysparm_limit=50';
  const fwResponse = await fetch(fwUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const fwData = await fwResponse.json();
  
  console.log('Found', fwData.result.length, 'Altus firewalls');
  console.log('');
  
  for (const fw of fwData.result) {
    console.log('Firewall:', fw.name);
    console.log('  sys_id:', fw.sys_id);
    console.log('  company:', fw.company);
    console.log('  used_for (service):', fw.used_for || '(not set)');
    
    // Check CI relationships
    const relUrl = instanceUrl + '/api/now/table/cmdb_rel_ci?sysparm_query=child=' + fw.sys_id + '&sysparm_display_value=all&sysparm_fields=parent,type';
    const relResponse = await fetch(relUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });
    const relData = await relResponse.json();
    
    if (relData.result.length > 0) {
      console.log('  CI Relationships:', relData.result.length);
      for (const rel of relData.result) {
        const parentName = rel.parent && rel.parent.display_value ? rel.parent.display_value : rel.parent;
        const relType = rel.type && rel.type.display_value ? rel.type.display_value : rel.type;
        console.log('    -', relType, '→', parentName);
      }
    } else {
      console.log('  ⚠️  No CI relationships found');
    }
    console.log('');
  }
}

checkFirewallLinks().catch(console.error);
