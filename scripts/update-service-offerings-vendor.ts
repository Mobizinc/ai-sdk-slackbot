import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
dotenv.config({ path: '.env.local' });

async function updateVendor() {
  console.log('Updating first 3 Service Offerings to add vendor field');
  console.log('='.repeat(70));
  console.log('');
  
  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';
  const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  
  const serviceOfferings = [
    { sys_id: '0f4e2f96c320f210ad36b9ff050131f5', name: 'Infrastructure and Cloud Management' },
    { sys_id: '6b4e6f96c320f210ad36b9ff050131ba', name: 'Network Management' },
    { sys_id: '4c5eaf96c320f210ad36b9ff05013172', name: 'Cybersecurity Management' },
  ];
  
  for (const so of serviceOfferings) {
    console.log('Updating:', so.name);
    
    const url = instanceUrl + '/api/now/table/service_offering/' + so.sys_id;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
      }),
    });
    
    if (response.ok) {
      console.log('  ✅ Updated');
    } else {
      const errorText = await response.text();
      console.log('  ❌ Failed:', errorText);
    }
  }
  
  console.log('');
  console.log('✅ Done!');
}

updateVendor().catch(console.error);
