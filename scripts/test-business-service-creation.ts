/**
 * Test Business Service Creation with Different Approaches
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function testBusinessServiceCreation() {
  console.log('🧪 Testing Business Service Creation in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = 'https://mobiz.service-now.com';
  const username = 'SVC.Mobiz.Integration.TableAPI.PROD';
  const password = 'jOH2NgppZwdSY+I';

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Test 1: Create without specifying u_sn_app_service_id (default behavior)
  console.log('Test 1: Create without u_sn_app_service_id field');
  console.log('─'.repeat(70));

  const payload1 = {
    name: 'Managed Support Services',
    short_description: 'Global MSP service portfolio for managed support services',
  };

  console.log('Payload:', JSON.stringify(payload1, null, 2));
  console.log('');

  const url = `${instanceUrl}/api/now/table/cmdb_ci_service_business`;
  const response1 = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload1),
  });

  console.log(`Status: ${response1.status}`);

  if (response1.ok) {
    const data = await response1.json();
    console.log('✅ SUCCESS!');
    console.log('Created sys_id:', data.result.sys_id);
    console.log('');
    console.log('Full response:', JSON.stringify(data.result, null, 2));
    process.exit(0);
  } else {
    const errorText = await response1.text();
    console.log('❌ FAILED');
    console.log('Error:', errorText);
    console.log('');

    // Parse the error to understand what's happening
    try {
      const errorJson = JSON.parse(errorText);
      console.log('Error Detail:', errorJson.error?.detail || '(no detail)');
      console.log('');
    } catch (e) {
      // Not JSON
    }
  }

  // Test 2: Create with explicit u_sn_app_service_id = unique value
  console.log('─'.repeat(70));
  console.log('Test 2: Create with explicit u_sn_app_service_id = "MSP-001"');
  console.log('─'.repeat(70));

  const payload2 = {
    name: 'Managed Support Services',
    short_description: 'Global MSP service portfolio for managed support services',
    u_sn_app_service_id: 'MSP-001',
  };

  console.log('Payload:', JSON.stringify(payload2, null, 2));
  console.log('');

  const response2 = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload2),
  });

  console.log(`Status: ${response2.status}`);

  if (response2.ok) {
    const data = await response2.json();
    console.log('✅ SUCCESS!');
    console.log('Created sys_id:', data.result.sys_id);
    console.log('');
    console.log('Full response:', JSON.stringify(data.result, null, 2));
    process.exit(0);
  } else {
    const errorText = await response2.text();
    console.log('❌ FAILED');
    console.log('Error:', errorText);
    console.log('');
  }

  // Test 3: Create with u_sn_app_service_id = empty string
  console.log('─'.repeat(70));
  console.log('Test 3: Create with explicit u_sn_app_service_id = ""');
  console.log('─'.repeat(70));

  const payload3 = {
    name: 'Managed Support Services',
    short_description: 'Global MSP service portfolio for managed support services',
    u_sn_app_service_id: '',
  };

  console.log('Payload:', JSON.stringify(payload3, null, 2));
  console.log('');

  const response3 = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload3),
  });

  console.log(`Status: ${response3.status}`);

  if (response3.ok) {
    const data = await response3.json();
    console.log('✅ SUCCESS!');
    console.log('Created sys_id:', data.result.sys_id);
    console.log('');
    console.log('Full response:', JSON.stringify(data.result, null, 2));
    process.exit(0);
  } else {
    const errorText = await response3.text();
    console.log('❌ FAILED');
    console.log('Error:', errorText);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('CONCLUSION: All tests failed');
  console.log('─'.repeat(70));
  console.log('');
  console.log('Next step: Check if the field is required or has special validation');
}

testBusinessServiceCreation()
  .catch(console.error)
  .finally(() => process.exit(0));
