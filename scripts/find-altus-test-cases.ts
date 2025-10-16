/**
 * Find Application Test Cases from ServiceNow DEV
 *
 * Searches for cases mentioning specific applications like GoRev, NextGen, O365, etc.
 * Used for testing Service Offering and Application identification features.
 *
 * ENVIRONMENT VARIABLES:
 * - DEV_SERVICENOW_URL: ServiceNow DEV instance URL
 * - DEV_SERVICENOW_USERNAME: DEV API username
 * - DEV_SERVICENOW_PASSWORD: DEV API password
 *
 * USAGE:
 * pnpm tsx scripts/find-altus-test-cases.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface TestCase {
  number: string;
  shortDescription: string;
  description?: string;
  category?: string;
  state?: string;
  openedAt?: string;
  url?: string;
}

const APPLICATION_KEYWORDS = [
  'GoRev',
  'NextGen',
  'O365',
  'Office 365',
  'Epowerdocs',
  'EPD',
  'Novarad',
  'Qgenda',
  'TSheet',
  'Paylocity',
  'Availity',
  'Imagine',
  'Medicus',
  'OnePACS',
  'TruBridge',
  'ViaTrack',
  'VizTech',
  'WayStar',
  'Azure',
  'Active Directory',
  'Vonage',
];

// Helper function to make ServiceNow API requests with DEV credentials
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

async function findAltusTestCases() {
  console.log('🔍 Finding Application Test Cases from ServiceNow DEV');
  console.log('='.repeat(80));
  console.log('');

  // Check configuration
  const instanceUrl = process.env.DEV_SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD;
  const caseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  if (!instanceUrl || !username || !password) {
    console.error('❌ DEV ServiceNow credentials not configured!');
    console.error('');
    console.error('Required environment variables in .env.local:');
    console.error('  - DEV_SERVICENOW_URL');
    console.error('  - DEV_SERVICENOW_USERNAME');
    console.error('  - DEV_SERVICENOW_PASSWORD');
    console.error('');
    process.exit(1);
  }

  console.log(`Instance: ${instanceUrl} (DEV)`);
  console.log(`Case Table: ${caseTable}`);
  console.log('');

  const allTestCases: Map<string, TestCase> = new Map();

  // Search for cases with each application keyword
  for (const keyword of APPLICATION_KEYWORDS) {
    try {
      console.log(`Searching for "${keyword}" cases...`);

      // Search query: short_description OR description contains keyword
      // Using OR to search both short_description and description fields
      const query = `short_descriptionLIKE${keyword}^ORdescriptionLIKE${keyword}^ORDERBYDESCopened_at`;
      const searchPath = `/api/now/table/${caseTable}?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=5&sysparm_display_value=all`;

      const searchData = await snowRequest<{ result: Array<any> }>(searchPath);
      const cases = searchData.result || [];

      for (const caseRecord of cases) {
        const caseNumber = caseRecord.number;

        if (!allTestCases.has(caseNumber)) {
          // Extract display values
          const extractValue = (field: any): string => {
            if (!field) return '';
            if (typeof field === 'string') return field;
            if (typeof field === 'object' && field.display_value) return field.display_value;
            if (typeof field === 'object' && field.value) return field.value;
            return String(field);
          };

          allTestCases.set(caseNumber, {
            number: caseNumber,
            shortDescription: extractValue(caseRecord.short_description) || 'N/A',
            description: extractValue(caseRecord.description),
            category: extractValue(caseRecord.category),
            state: extractValue(caseRecord.state),
            openedAt: extractValue(caseRecord.opened_at),
            url: `${instanceUrl}/nav_to.do?uri=${caseTable}.do?sys_id=${extractValue(caseRecord.sys_id)}`,
          });
        }
      }

      console.log(`  Found ${cases.length} cases`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`  Error searching for "${keyword}":`, error instanceof Error ? error.message : error);
    }
  }

  console.log('');
  console.log('━'.repeat(80));
  console.log(`📊 SUMMARY: Found ${allTestCases.size} unique test cases`);
  console.log('━'.repeat(80));
  console.log('');

  if (allTestCases.size === 0) {
    console.log('No test cases found. Try:');
    console.log('  1. Verify DEV_SERVICENOW_URL points to DEV instance');
    console.log('  2. Check that cases with application keywords exist in DEV');
    console.log('  3. Verify credentials have read access to cases');
    return;
  }

  // Display all test cases
  let caseIndex = 1;
  for (const testCase of allTestCases.values()) {
    console.log('━'.repeat(80));
    console.log(`TEST CASE #${caseIndex}: ${testCase.number}`);
    console.log('━'.repeat(80));
    console.log('');
    console.log(`Short Description:`);
    console.log(`  ${testCase.shortDescription}`);
    console.log('');

    if (testCase.description) {
      console.log(`Full Description:`);
      const descriptionLines = testCase.description.split('\n').slice(0, 10); // First 10 lines
      descriptionLines.forEach(line => console.log(`  ${line}`));
      if (testCase.description.split('\n').length > 10) {
        console.log(`  ... (truncated)`);
      }
      console.log('');
    }

    console.log(`Category: ${testCase.category || 'N/A'}`);
    console.log(`State: ${testCase.state || 'N/A'}`);
    console.log(`Opened: ${testCase.openedAt || 'N/A'}`);
    console.log('');
    console.log(`URL: ${testCase.url || 'N/A'}`);
    console.log('');

    // Suggest expected classification
    const text = `${testCase.shortDescription} ${testCase.description || ''}`.toLowerCase();
    let suggestedOffering = 'Unknown';
    let suggestedApp = 'Unknown';

    if (text.includes('gorev')) {
      suggestedOffering = 'Application Administration';
      suggestedApp = 'Altus Health - Gorev Production';
    } else if (text.includes('nextgen')) {
      suggestedOffering = 'Application Administration';
      suggestedApp = 'Altus Health - NextGen Production';
    } else if (text.includes('o365') || text.includes('office 365') || text.includes('outlook') || text.includes('teams')) {
      suggestedOffering = 'Infrastructure and Cloud Management';
      suggestedApp = 'Altus Health - O365 Production';
    } else if (text.includes('epd') || text.includes('epowerdocs')) {
      suggestedOffering = 'Application Administration';
      suggestedApp = 'Altus Health - Epowerdocs (EPD) Production';
    } else if (text.includes('novarad')) {
      suggestedOffering = 'Application Administration';
      suggestedApp = 'Altus Health - Novarad Production';
    } else if (text.includes('qgenda')) {
      suggestedOffering = 'Application Administration';
      suggestedApp = 'Altus Health - Qgenda Account';
    } else if (text.includes('azure')) {
      suggestedOffering = 'Infrastructure and Cloud Management';
      suggestedApp = 'Altus Health - Azure Environment';
    } else if (text.includes('active directory') || text.includes(' ad ') || text.includes('domain')) {
      suggestedOffering = 'Infrastructure and Cloud Management';
      suggestedApp = 'Altus Health - Active Directory';
    } else if (text.includes('vpn') || text.includes('network') || text.includes('firewall')) {
      suggestedOffering = 'Network Management' || 'Helpdesk and Endpoint Support';
    } else if (text.includes('password') || text.includes('login') || text.includes('access')) {
      suggestedOffering = 'Helpdesk and Endpoint Support';
    }

    console.log(`Expected AI Classification:`);
    console.log(`  service_offering: "${suggestedOffering}"`);
    if (suggestedApp !== 'Unknown') {
      console.log(`  application_service: "${suggestedApp}"`);
    }
    console.log('');

    caseIndex++;
  }

  console.log('━'.repeat(80));
  console.log('');
  console.log('✅ Test case search complete!');
  console.log('');
  console.log('NEXT STEPS:');
  console.log('  1. Pick a test case from above');
  console.log('  2. Send it through the webhook to trigger classification');
  console.log('  3. Check logs for:');
  console.log('     - [Case Triage] Loaded X application services for company');
  console.log('     - AI classification with service_offering and application_service');
  console.log('     - Service Offering lookup and linking');
  console.log('  4. Verify in ServiceNow that Incident has correct Service Offering');
  console.log('');
}

// Run the script
findAltusTestCases()
  .catch((error) => {
    console.error('');
    console.error('❌ Script failed:');
    console.error(error);
    process.exit(1);
  });
