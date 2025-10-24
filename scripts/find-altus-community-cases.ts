/**
 * Find test cases from Altus Community Healthcare company in DEV
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

async function findAltusCases() {
  console.log('🔍 Finding Cases from Altus Community Healthcare');
  console.log('='.repeat(80));
  console.log('');

  const caseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  // Search for Altus Community Healthcare cases with application keywords
  const keywords = ['GoRev', 'NextGen', 'O365', 'Office 365', 'EPD', 'Epowerdocs', 'Azure', 'Active Directory'];

  for (const keyword of keywords) {
    console.log(`Searching for "${keyword}" cases from Altus Community Healthcare...`);

    const query = `company.nameLIKEAltus Community Healthcare^short_descriptionLIKE${keyword}^ORDERBYDESCopened_at`;
    const path = `/api/now/table/${caseTable}?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=3&sysparm_display_value=all`;

    const data = await snowRequest<{ result: Array<any> }>(path);
    const cases = data.result || [];

    if (cases.length > 0) {
      const extractValue = (field: any): string => {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object' && field.display_value) return field.display_value;
        if (typeof field === 'object' && field.value) return field.value;
        return String(field);
      };

      for (const caseRecord of cases) {
        const caseNumber = extractValue(caseRecord.number);
        const shortDesc = extractValue(caseRecord.short_description);
        const description = extractValue(caseRecord.description);
        const companyName = extractValue(caseRecord.company);
        const companySysId = caseRecord.company?.value || '';

        console.log('');
        console.log(`  Case: ${caseNumber}`);
        console.log(`  Company: ${companyName} (${companySysId})`);
        console.log(`  Short Description: ${shortDesc}`);
        console.log(`  Description (first 150 chars): ${description.substring(0, 150)}...`);
      }

      console.log('');
      break; // Found cases, stop searching
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Use one of these cases to test dynamic application service loading.');
}

findAltusCases()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
