/**
 * Check what data exists in ServiceNow DEV
 */
import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

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

async function checkDevData() {
  console.log('🔍 Checking ServiceNow DEV Data');
  console.log('='.repeat(80));
  console.log('');

  const caseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  // Check total case count
  console.log('1. Checking total case count...');
  const countQuery = `sysparm_query=&sysparm_limit=1`;
  const countData = await snowRequest<{ result: Array<any> }>(`/api/now/table/${caseTable}?${countQuery}`);
  console.log(`   Found cases in table: ${countData.result ? 'YES' : 'NO'}`);
  console.log('');

  // Get recent 10 cases
  console.log('2. Getting 10 most recent cases...');
  const recentQuery = `sysparm_query=ORDERBYDESCopened_at&sysparm_limit=10&sysparm_display_value=all`;
  const recentData = await snowRequest<{ result: Array<any> }>(`/api/now/table/${caseTable}?${recentQuery}`);
  const recentCases = recentData.result || [];

  console.log(`   Found ${recentCases.length} recent cases`);
  console.log('');

  if (recentCases.length > 0) {
    console.log('3. Sample company names from recent cases:');
    const companies = new Set<string>();

    for (const caseRecord of recentCases) {
      const companyName = caseRecord.company?.display_value || caseRecord.company?.value || 'N/A';
      companies.add(companyName);

      console.log(`   - ${caseRecord.number}: Company = "${companyName}"`);
      console.log(`     Short Description: ${caseRecord.short_description?.display_value || caseRecord.short_description || 'N/A'}`);
    }

    console.log('');
    console.log('4. Unique companies found:');
    companies.forEach(company => console.log(`   - ${company}`));
  }
}

checkDevData()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
