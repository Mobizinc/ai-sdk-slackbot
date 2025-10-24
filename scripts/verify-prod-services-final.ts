import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function verifyProd() {
  console.log('Final verification in PROD');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  // Count Application Services
  const url = instanceUrl + '/api/now/table/cmdb_ci_service_discovered?sysparm_query=nameLIKEAltus Health&sysparm_limit=50';
  
  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });
  
  const data = await response.json();
  console.log('Total Altus Application Services in PROD:', data.result.length);
  console.log('');
  
  if (data.result.length === 24) {
    console.log('✅ All 24 Application Services exist in PROD!');
  } else {
    console.log('❌ Expected 24, found', data.result.length);
  }
}

verifyProd().catch(console.error);
