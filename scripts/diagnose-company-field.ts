/**
 * Diagnostic script to check company field format
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function diagnoseCompanyField() {
  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  // Query one service with display_value=all
  const queryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent('name=Altus Health - NextGen Production')}&sysparm_limit=1&sysparm_display_value=all`;

  const response = await fetch(queryUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  const service = data.result[0];

  console.log('Service:', service.name);
  console.log('');
  console.log('Company field:');
  console.log(JSON.stringify(service.company, null, 2));
  console.log('');
  console.log('Type:', typeof service.company);
}

diagnoseCompanyField();
