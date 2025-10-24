/**
 * Check which companies have application services configured in DEV
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Buffer } from 'node:buffer';

async function snowRequest<T>(path: string): Promise<T> {
  const instanceUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    throw new Error('DEV ServiceNow credentials not configured');
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const response = await fetch(`${instanceUrl}${path}`, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`ServiceNow request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function checkApplicationServices() {
  console.log('🔍 Checking Application Services in ServiceNow DEV');
  console.log('='.repeat(80));
  console.log('');

  // Check cmdb_ci_service table for application services
  const query = `operational_status=1^ORDERBYname`;
  const path = `/api/now/table/cmdb_ci_service?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=50&sysparm_display_value=all&sysparm_fields=sys_id,name,owned_by,company,operational_status,service_classification`;

  const data = await snowRequest<{ result: Array<any> }>(path);
  const services = data.result || [];

  console.log(`Found ${services.length} application services in DEV`);
  console.log('');

  if (services.length === 0) {
    console.log('No application services found in DEV!');
    console.log('This means the dynamic application service feature cannot be tested.');
    return;
  }

  // Group by company
  const byCompany = new Map<string, Array<any>>();

  for (const service of services) {
    const companyName = service.company?.display_value || service.company?.value || 'No Company';
    if (!byCompany.has(companyName)) {
      byCompany.set(companyName, []);
    }
    byCompany.get(companyName)!.push(service);
  }

  console.log('Application Services by Company:');
  console.log('-'.repeat(80));

  for (const [companyName, companyServices] of byCompany) {
    console.log('');
    console.log(`Company: ${companyName} (${companyServices.length} services)`);

    for (const service of companyServices.slice(0, 10)) {
      const name = service.name?.display_value || service.name || 'Unnamed';
      const sysId = service.sys_id?.display_value || service.sys_id || '';
      const classification = service.service_classification?.display_value || service.service_classification || 'N/A';

      console.log(`  - ${name}`);
      console.log(`    Classification: ${classification}`);
      console.log(`    sys_id: ${sysId}`);
    }

    if (companyServices.length > 10) {
      console.log(`  ... and ${companyServices.length - 10} more`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('To test with application services, find a case from one of these companies.');
}

checkApplicationServices()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
