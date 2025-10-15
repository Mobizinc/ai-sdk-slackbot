import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function checkAllCIRelRecords() {
  console.log('Checking ALL CI Relationship Records');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Get ALL CI relationships created today
  const url = instanceUrl + '/api/now/table/cmdb_rel_ci?sysparm_query=sys_created_onONToday@javascript:gs.daysAgoStart(0)@javascript:gs.daysAgoEnd(0)&sysparm_display_value=all&sysparm_fields=parent,child,type&sysparm_limit=50';
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  
  console.log('Found', data.result.length, 'CI relationships created today');
  console.log('');
  
  // Group by parent
  const grouped = {};
  for (const rel of data.result) {
    const parentName = rel.parent && rel.parent.display_value ? rel.parent.display_value : rel.parent;
    if (!grouped[parentName]) {
      grouped[parentName] = [];
    }
    const childName = rel.child && rel.child.display_value ? rel.child.display_value : rel.child;
    grouped[parentName].push(childName);
  }
  
  console.log('Grouped by Parent:');
  console.log('');
  for (const [parent, children] of Object.entries(grouped)) {
    console.log('📦', parent);
    console.log('   Children:', children.length);
    for (const child of children) {
      console.log('   └─', child);
    }
    console.log('');
  }
}

checkAllCIRelRecords().catch(console.error);
