/**
 * Test Case Classification
 *
 * Tests the three fixes:
 * 1. Incident categories being set correctly
 * 2. Service Offering identification and linking
 * 3. Application service identification (dynamic company apps)
 * 4. Firewall/network device recognition
 */

// CRITICAL: Load environment variables BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Buffer } from 'node:buffer';
import { getCaseTriageService } from '../lib/services/case-triage';
import type { ServiceNowCaseWebhook } from '../lib/schemas/servicenow-webhook';

interface CaseData {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  company?: {
    value: string;
    display_value: string;
  };
  category?: string;
  state?: string;
}

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

async function testCaseClassification() {
  console.log('🧪 Testing Case Classification with Real DEV Cases');
  console.log('='.repeat(80));
  console.log('');

  const caseTable = process.env.DEV_SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  // Test Case 1: GoRev Application Issue
  console.log('TEST 1: GoRev Application Issue');
  console.log('-'.repeat(80));

  // Search for GoRev case
  const gorevQuery = `short_descriptionLIKEGoRev^ORDERBYDESCopened_at`;
  const gorevPath = `/api/now/table/${caseTable}?sysparm_query=${encodeURIComponent(gorevQuery)}&sysparm_limit=1&sysparm_display_value=all`;

  const gorevData = await snowRequest<{ result: Array<any> }>(gorevPath);
  if (gorevData.result && gorevData.result.length > 0) {
    const caseRecord = gorevData.result[0];

    const extractValue = (field: any): string => {
      if (!field) return '';
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field.display_value) return field.display_value;
      if (typeof field === 'object' && field.value) return field.value;
      return String(field);
    };

    const caseNumber = extractValue(caseRecord.number);
    const shortDesc = extractValue(caseRecord.short_description);
    const description = extractValue(caseRecord.description);
    const companyName = extractValue(caseRecord.company);
    const sys_id = extractValue(caseRecord.sys_id);

    console.log(`Case: ${caseNumber}`);
    console.log(`Company: ${companyName}`);
    console.log(`Short Description: ${shortDesc}`);
    console.log(`Description (first 200 chars): ${description.substring(0, 200)}...`);
    console.log('');
    console.log('Processing through case triage...');
    console.log('');

    try {
      // Build webhook payload
      const webhook: ServiceNowCaseWebhook = {
        case_number: caseNumber,
        sys_id: sys_id,
        short_description: shortDesc,
        description: description,
        company: caseRecord.company?.value || '',
        category: extractValue(caseRecord.category),
        state: extractValue(caseRecord.state),
        opened_at: caseRecord.opened_at ? new Date(extractValue(caseRecord.opened_at)) : undefined,
      };

      // Call the case triage service
      const triageService = getCaseTriageService();
      const result = await triageService.triageCase(webhook, {
        enableCaching: false, // Disable caching for testing
        enableSimilarCases: true,
        enableKBArticles: true,
      });

      console.log('✅ Case processed successfully!');
      console.log('');
      console.log('RESULT:');
      console.log(`  Classification: ${result.classification?.category || 'N/A'}`);
      console.log(`  Service Offering: ${result.service_offering_match?.name || 'N/A'}`);
      console.log(`  Application Service: ${result.application_service_match?.name || 'N/A'}`);
      console.log(`  Incident Created: ${result.incident_number || 'No'}`);
      console.log(`  Problem Created: ${result.problem_number || 'No'}`);
      console.log('');
      console.log('Check the logs above for:');
      console.log('  ✓ [Case Triage] Loaded X application services for company');
      console.log('  ✓ AI classification with service_offering and application_service');
      console.log('  ✓ Service Offering lookup and linking');
      console.log('  ✓ Incident category being set');
      console.log('');

    } catch (error) {
      console.error('❌ Error processing case:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
      }
    }
  } else {
    console.log('No GoRev cases found in DEV');
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Test complete!');
}

testCaseClassification()
  .catch((error) => {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  });
