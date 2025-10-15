import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function testCreate() {
  console.log('Testing Service Offering creation with vendor field');
  console.log('='.repeat(70));
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const payload = {
    name: 'Helpdesk and Endpoint Support - 24/7',
    parent: 'e24d6752c368721066d9bdb4e40131a8', // Managed Support Services
    vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
  };
  
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('');
  
  const url = instanceUrl + '/api/now/table/service_offering';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  console.log('Status:', response.status);
  console.log('');
  
  if (response.ok) {
    const data = await response.json();
    console.log('✅ SUCCESS!');
    console.log('sys_id:', data.result.sys_id);
  } else {
    const errorText = await response.text();
    console.log('❌ FAILED');
    console.log('Error:', errorText);
  }
}

testCreate().catch(console.error);
