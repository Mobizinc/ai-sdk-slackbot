/**
 * Test creating Business Service with vendor field set
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function testWithVendor() {
  console.log('🧪 Test: Create Business Service with vendor field');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Use same vendor as existing Business Services
  const payload = {
    name: 'Managed Support Services',
    short_description: 'Global MSP service portfolio for managed support services',
    vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Altus Community Healthcare
    consumer_type: 'both',
    busines_criticality: '4', // 4 - not critical
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('');

  const url = `${instanceUrl}/api/now/table/cmdb_ci_service_business`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log(`Status: ${response.status}`);
  console.log('');

  if (response.ok) {
    const data = await response.json();
    console.log('✅ SUCCESS!');
    console.log('');
    console.log(`Created sys_id: ${data.result.sys_id}`);
    console.log(`Number: ${data.result.number}`);
    console.log('');
    console.log('This Business Service can now be used as parent for Service Offerings');
  } else {
    const errorText = await response.text();
    console.log('❌ FAILED');
    console.log('');
    console.log('Full error:');
    console.log(errorText);
    console.log('');

    try {
      const errorJson = JSON.parse(errorText);
      console.log('Error message:', errorJson.error?.message);
      console.log('Error detail:', errorJson.error?.detail);
    } catch (e) {
      // ignore
    }
  }
}

testWithVendor()
  .catch(console.error)
  .finally(() => process.exit(0));
