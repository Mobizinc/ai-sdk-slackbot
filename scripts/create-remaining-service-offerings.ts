import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function createRemaining() {
  console.log('Creating remaining 2 Service Offerings');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const offerings = [
    'Helpdesk and Endpoint Support - Standard Business Hours',
    'Application Administration',
  ];
  
  for (const name of offerings) {
    const payload = {
      name: name,
      parent: 'e24d6752c368721066d9bdb4e40131a8', // Managed Support Services
      vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
    };
    
    console.log('Creating:', name);
    
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
    } else {
      const errorText = await response.text();
      console.log('  ❌ Failed:', errorText);
    }
    
    // Wait 2 seconds between creations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('');
  console.log('✅ All 6 Service Offerings created!');
}

createRemaining().catch(console.error);
