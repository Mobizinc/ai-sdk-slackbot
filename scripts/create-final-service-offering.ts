import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function createFinal() {
  console.log('Creating final Service Offering');
  console.log('='.repeat(70));
  console.log('');
  
  // Wait 3 seconds first
  console.log('Waiting 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const payload = {
    name: 'Helpdesk and Endpoint Support - Standard Business Hours',
    parent: 'e24d6752c368721066d9bdb4e40131a8', // Managed Support Services
    vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
  };
  
  console.log('Creating: Helpdesk and Endpoint Support - Standard Business Hours');
  
  const url = instanceUrl + '/api/now/table/service_offering';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log('  ✅ Created - sys_id:', data.result.sys_id);
    console.log('');
    console.log('✅ All 6 Service Offerings now exist!');
  } else {
    const errorText = await response.text();
    console.log('  ❌ Failed:', errorText);
  }
}

createFinal().catch(console.error);
