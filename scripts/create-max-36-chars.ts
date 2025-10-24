import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function createMax36() {
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const shortName = 'Helpdesk and Endpoint - Standard';
  console.log('Trying name at 32 chars:', shortName);
  console.log('Length:', shortName.length, 'characters');
  console.log('');
  
  const payload = {
    name: shortName,
    parent: 'e24d6752c368721066d9bdb4e40131a8',
    vendor: '2d6a47c7870011100fadcbb6dabb35fb',
  };
  
  const response = await fetch(instanceUrl + '/api/now/table/service_offering', {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  console.log('Status:', response.status);
  if (response.ok) {
    const data = await response.json();
    console.log('✅ SUCCESS! sys_id:', data.result.sys_id);
  } else {
    console.log('❌ FAILED:', await response.text());
  }
}

createMax36().catch(console.error);
