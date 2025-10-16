/**
 * Find Open Cases in ServiceNow DEV
 * Used to identify test cases for end-to-end testing
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars from parent directory's .env.local
const envPath = resolve(process.cwd(), '../ai-sdk-slackbot/.env.local');
config({ path: envPath });

async function findOpenCases() {
  const baseUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;
  const table = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  if (!baseUrl || !username || !password) {
    console.error('❌ ServiceNow DEV credentials not configured');
    process.exit(1);
  }

  console.log('🔍 Searching for Open Cases in ServiceNow DEV');
  console.log('═══════════════════════════════════════════════\n');
  console.log(`Instance: ${baseUrl}`);
  console.log(`Table: ${table}\n`);

  try {
    // Query for open cases (state != Closed/Resolved/Cancelled)
    // States: 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed, 8=Cancelled
    const query = 'state!=6^state!=7^state!=8^ORDERBYDESCsys_created_on';
    const fields = [
      'number',
      'short_description',
      'description',
      'state',
      'priority',
      'assignment_group',
      'sys_created_on',
      'account.name',
    ].join(',');

    const url = `${baseUrl}/api/now/table/${table}?sysparm_query=${query}&sysparm_limit=10&sysparm_fields=${fields}`;

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ServiceNow API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.result || data.result.length === 0) {
      console.log('❌ No open cases found\n');
      console.log('💡 You may need to create a test case in ServiceNow DEV');
      return;
    }

    console.log(`✅ Found ${data.result.length} open case(s)\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Display cases
    data.result.forEach((caseRecord: any, index: number) => {
      const stateNames: Record<string, string> = {
        '1': 'New',
        '2': 'In Progress',
        '3': 'On Hold',
        '4': 'Awaiting Info',
        '5': 'Awaiting Evidence',
        '6': 'Resolved',
        '7': 'Closed',
        '8': 'Cancelled',
      };

      const priorityNames: Record<string, string> = {
        '1': '1 - Critical',
        '2': '2 - High',
        '3': '3 - Moderate',
        '4': '4 - Low',
        '5': '5 - Planning',
      };

      console.log(`${index + 1}. ${caseRecord.number}`);
      console.log(`   State: ${stateNames[caseRecord.state] || caseRecord.state}`);
      console.log(`   Priority: ${priorityNames[caseRecord.priority] || caseRecord.priority}`);
      console.log(`   Short Description: ${caseRecord.short_description || 'N/A'}`);

      if (caseRecord.description) {
        const desc = caseRecord.description.length > 100
          ? caseRecord.description.substring(0, 100) + '...'
          : caseRecord.description;
        console.log(`   Description: ${desc}`);
      }

      if (caseRecord.assignment_group) {
        console.log(`   Assignment Group: ${caseRecord.assignment_group}`);
      }

      if (caseRecord['account.name']) {
        console.log(`   Account: ${caseRecord['account.name']}`);
      }

      console.log(`   Created: ${caseRecord.sys_created_on}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 RECOMMENDED TEST CASE\n');

    const recommended = data.result[0];
    console.log(`   Case Number: ${recommended.number}`);
    console.log(`   Description: ${recommended.short_description || 'N/A'}`);
    console.log('\n📝 To test end-to-end:');
    console.log(`   pnpm tsx scripts/test-anthropic-caching-dev.ts ${recommended.number}`);
    console.log('\n🔍 Then check:');
    console.log(`   1. ServiceNow work notes: ${baseUrl}/nav_to.do?uri=x_mobit_serv_case_service_case.do?sysparm_query=number=${recommended.number}`);
    console.log('   2. Vercel logs for Anthropic caching metrics');
    console.log('   3. Azure Search should find similar cases (no errors)');

  } catch (error) {
    console.error('❌ Failed to fetch cases:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

findOpenCases();
