/**
 * Fix Endpoint Management Platform Parent in DEV
 * This service existed before but had no parent assigned
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function fixEndpointManagementParent() {
  console.log('🔧 Fixing Endpoint Management Platform Parent');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ DEV credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get Infrastructure and Cloud Management sys_id
  const offeringQuery = encodeURIComponent(`name=Infrastructure and Cloud Management`);
  const offeringUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${offeringQuery}&sysparm_limit=1`;

  const offeringResponse = await fetch(offeringUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!offeringResponse.ok) {
    console.error('❌ Failed to find Infrastructure and Cloud Management');
    process.exit(1);
  }

  const offeringData = await offeringResponse.json();
  const parentSysId = offeringData.result[0].sys_id;

  console.log(`Parent Service Offering: ${parentSysId}`);
  console.log('');

  // Find Endpoint Management Platform service
  const serviceQuery = encodeURIComponent(`name=Altus Health - Endpoint Management Platform`);
  const serviceUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${serviceQuery}&sysparm_limit=1`;

  const serviceResponse = await fetch(serviceUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!serviceResponse.ok) {
    console.error('❌ Failed to find Endpoint Management Platform');
    process.exit(1);
  }

  const serviceData = await serviceResponse.json();
  const serviceSysId = serviceData.result[0].sys_id;

  console.log(`Service sys_id: ${serviceSysId}`);
  console.log('');

  // Update parent
  const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered/${serviceSysId}`;
  const payload = {
    parent: parentSysId,
  };

  const updateResponse = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    console.error(`❌ Failed to update: ${updateResponse.status}`);
    console.error(errorText);
    process.exit(1);
  }

  console.log('✅ Parent updated successfully!');
  console.log('');
  console.log('Altus Health - Endpoint Management Platform');
  console.log('  → Now linked to Infrastructure and Cloud Management');
}

fixEndpointManagementParent()
  .catch(console.error)
  .finally(() => process.exit(0));
