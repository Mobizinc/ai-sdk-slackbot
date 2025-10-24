/**
 * Automated UAT Test: Create Case → Classify → Verify
 *
 * This script:
 * 1. Creates a test case in UAT ServiceNow via API
 * 2. Runs AI classification through the full triage flow
 * 3. Verifies service_offering and application_service are populated
 * 4. Checks database persistence
 * 5. Optionally cleans up the test case
 *
 * Test Scenario: GoRev Application Access Issue
 * - Tests Application Administration service offering
 * - Tests application service detection
 * - Uses realistic company with application portfolio
 */

// CRITICAL: Load environment variables BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

// Override to use UAT ServiceNow
if (process.env.UAT_SERVICENOW_URL) {
  process.env.SERVICENOW_URL = process.env.UAT_SERVICENOW_URL;
  process.env.SERVICENOW_INSTANCE_URL = process.env.UAT_SERVICENOW_URL;
}
if (process.env.UAT_SERVICENOW_USERNAME) {
  process.env.SERVICENOW_USERNAME = process.env.UAT_SERVICENOW_USERNAME;
}
if (process.env.UAT_SERVICENOW_PASSWORD) {
  process.env.SERVICENOW_PASSWORD = process.env.UAT_SERVICENOW_PASSWORD;
}
if (process.env.UAT_SERVICENOW_CASE_TABLE) {
  process.env.SERVICENOW_CASE_TABLE = process.env.UAT_SERVICENOW_CASE_TABLE;
}
if (process.env.UAT_SERVICENOW_COMPANY_ID) {
  process.env.SERVICENOW_COMPANY_ID = process.env.UAT_SERVICENOW_COMPANY_ID;
}

import { Buffer } from 'node:buffer';
import { getCaseTriageService } from '../lib/services/case-triage';
import { getDb } from '../lib/db/client';
import type { ServiceNowCaseWebhook } from '../lib/schemas/servicenow-webhook';

const instanceUrl = process.env.SERVICENOW_URL;
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;
const caseTable = process.env.SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

async function snowRequest<T>(method: string, path: string, body?: any): Promise<T> {
  if (!instanceUrl || !username || !password) {
    throw new Error('UAT ServiceNow credentials not configured');
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${instanceUrl}${path}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ServiceNow ${method} failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return (await response.json()) as T;
}

async function createTestCase() {
  console.log('🧪 Automated UAT Classification Test');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Environment: ${instanceUrl}`);
  console.log(`Username: ${username}`);
  console.log('');

  try {
    // ========================================
    // Step 1: Create Test Case
    // ========================================
    console.log('Step 1: Creating Test Case in UAT');
    console.log('─'.repeat(80));

    const timestamp = new Date().toISOString();
    const testCasePayload = {
      short_description: `UAT Test ${timestamp}: Cannot access GoRev application`,
      description: `User is getting an authentication error when trying to log into GoRev application. Error message states "Authentication failed - please contact support". This issue started this morning and is preventing the user from completing their work. The user has tried restarting their computer and clearing browser cache but the issue persists. Test timestamp: ${timestamp}`,
      state: 'Open',
      priority: '3', // Medium
      company: process.env.SERVICENOW_COMPANY_ID, // Mobiz or configured company
    };

    console.log('Creating case with payload:');
    console.log(`  Short Description: ${testCasePayload.short_description}`);
    console.log(`  Description: ${testCasePayload.description.substring(0, 100)}...`);
    console.log('');

    const createResponse = await snowRequest<{ result: any }>(
      'POST',
      `/api/now/table/${caseTable}`,
      testCasePayload
    );

    const createdCase = createResponse.result;
    const caseNumber = createdCase.number;
    const sys_id = createdCase.sys_id;

    console.log('✅ Test case created successfully');
    console.log(`   Case Number: ${caseNumber}`);
    console.log(`   sys_id: ${sys_id}`);
    console.log(`   URL: ${instanceUrl}/nav_to.do?uri=${caseTable}.do?sys_id=${sys_id}`);
    console.log('');

    // ========================================
    // Step 2: Run AI Classification
    // ========================================
    console.log('Step 2: Running AI Classification');
    console.log('─'.repeat(80));

    // Build webhook payload
    const webhookPayload: ServiceNowCaseWebhook = {
      case_number: caseNumber,
      sys_id: sys_id,
      short_description: testCasePayload.short_description,
      description: testCasePayload.description,
      company: testCasePayload.company || '',
      category: '',
      subcategory: '',
      priority: testCasePayload.priority,
      state: testCasePayload.state,
      assigned_to: '',
      assignment_group: '',
      opened_at: new Date(),
    };

    console.log('Invoking case triage service...');
    console.log('');

    const triageService = getCaseTriageService();
    const result = await triageService.triageCase(webhookPayload);

    console.log('✅ Classification completed');
    console.log('');

    // ========================================
    // Step 3: Verify Classification Results
    // ========================================
    console.log('Step 3: Verifying Classification Results');
    console.log('─'.repeat(80));

    const classification = result.classification;

    console.log('AI Classification:');
    console.log(`  Category: ${classification.category || '(none)'}`);
    console.log(`  Subcategory: ${classification.subcategory || '(none)'}`);
    console.log(`  Service Offering: ${classification.service_offering || '(none)'}`);
    console.log(`  Application Service: ${classification.application_service || '(none)'}`);
    console.log(`  Confidence: ${classification.confidence_score}`);
    console.log('');

    // Validate expected results
    const expectedOfferings = [
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint - Standard',
      'Application Administration',
    ];

    const checks: Array<{ name: string; status: boolean; message?: string }> = [];

    // Check 1: service_offering populated
    if (classification.service_offering) {
      checks.push({ name: 'service_offering populated', status: true });

      // Check 2: service_offering is valid
      if (expectedOfferings.includes(classification.service_offering)) {
        checks.push({ name: 'service_offering is valid', status: true });
      } else {
        checks.push({
          name: 'service_offering is valid',
          status: false,
          message: `Got "${classification.service_offering}", expected one of: ${expectedOfferings.join(', ')}`
        });
      }

      // Check 3: For GoRev case, should be Application Administration
      if (classification.service_offering === 'Application Administration') {
        checks.push({ name: 'GoRev case → Application Administration', status: true });
      } else {
        checks.push({
          name: 'GoRev case → Application Administration',
          status: false,
          message: `Expected "Application Administration", got "${classification.service_offering}"`
        });
      }
    } else {
      checks.push({
        name: 'service_offering populated',
        status: false,
        message: 'service_offering is null'
      });
    }

    // Check 4: application_service populated for app cases
    if (classification.service_offering === 'Application Administration') {
      if (classification.application_service) {
        checks.push({ name: 'application_service populated for app case', status: true });
      } else {
        checks.push({
          name: 'application_service populated for app case',
          status: false,
          message: 'service_offering is Application Administration but application_service is null'
        });
      }
    }

    // ========================================
    // Step 4: Verify Database Persistence
    // ========================================
    console.log('Step 4: Verifying Database Persistence');
    console.log('─'.repeat(80));

    const db = getDb();
    if (!db) {
      console.error('❌ Database not configured (missing DATABASE_URL)');
      throw new Error('Database not configured');
    }

    console.log('Querying database for classification record...');

    const dbResults = await db.execute(
      `SELECT
        case_number,
        service_offering,
        application_service,
        confidence_score,
        created_at
      FROM case_classification_results
      WHERE case_number = '${caseNumber}'
      ORDER BY created_at DESC
      LIMIT 1`
    );

    if (!dbResults.rows || dbResults.rows.length === 0) {
      checks.push({
        name: 'Database record created',
        status: false,
        message: 'No database record found'
      });
    } else {
      const dbRecord = dbResults.rows[0] as any;

      console.log('✅ Database record found');
      console.log('');
      console.log('Database Record:');
      console.log(`  case_number: ${dbRecord.case_number}`);
      console.log(`  service_offering: ${dbRecord.service_offering || '(null)'}`);
      console.log(`  application_service: ${dbRecord.application_service || '(null)'}`);
      console.log(`  confidence_score: ${dbRecord.confidence_score}`);
      console.log('');

      checks.push({ name: 'Database record created', status: true });

      // Check persistence matches classification
      if (dbRecord.service_offering === classification.service_offering) {
        checks.push({ name: 'service_offering persisted correctly', status: true });
      } else {
        checks.push({
          name: 'service_offering persisted correctly',
          status: false,
          message: `Mismatch: in-memory="${classification.service_offering}", db="${dbRecord.service_offering}"`
        });
      }

      if (dbRecord.application_service === classification.application_service) {
        checks.push({ name: 'application_service persisted correctly', status: true });
      } else {
        checks.push({
          name: 'application_service persisted correctly',
          status: false,
          message: `Mismatch: in-memory="${classification.application_service}", db="${dbRecord.application_service}"`
        });
      }
    }

    // ========================================
    // Step 5: Summary Report
    // ========================================
    console.log('─'.repeat(80));
    console.log('📊 Test Results Summary');
    console.log('─'.repeat(80));
    console.log('');

    console.log('Validation Checks:');
    checks.forEach(check => {
      const icon = check.status ? '✅' : '❌';
      console.log(`  ${icon} ${check.name}`);
      if (!check.status && check.message) {
        console.log(`      ${check.message}`);
      }
    });
    console.log('');

    const failedChecks = checks.filter(c => !c.status);

    if (failedChecks.length > 0) {
      console.error('❌ TEST FAILED');
      console.error('');
      console.error(`Failed ${failedChecks.length} of ${checks.length} checks`);
      console.error('');
      console.error('Test case created but NOT cleaned up:');
      console.error(`  Case Number: ${caseNumber}`);
      console.error(`  URL: ${instanceUrl}/nav_to.do?uri=${caseTable}.do?sys_id=${sys_id}`);
      console.error('');
      console.error('To clean up manually, close/delete this case in ServiceNow UAT.');
      console.error('');
      process.exit(1);
    }

    console.log('✅ All tests passed! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ Test case created in UAT ServiceNow');
    console.log('  ✅ AI classification completed successfully');
    console.log('  ✅ Service Portfolio Classification working');
    console.log(`  ✅ Service Offering: "${classification.service_offering}"`);
    if (classification.application_service) {
      console.log(`  ✅ Application Service: "${classification.application_service}"`);
    }
    console.log('  ✅ Database persistence verified');
    console.log('  ✅ Ready for production deployment');
    console.log('');

    // ========================================
    // Step 6: Cleanup (Optional)
    // ========================================
    console.log('Step 6: Cleanup');
    console.log('─'.repeat(80));
    console.log('');
    console.log('Test case information:');
    console.log(`  Case Number: ${caseNumber}`);
    console.log(`  sys_id: ${sys_id}`);
    console.log(`  URL: ${instanceUrl}/nav_to.do?uri=${caseTable}.do?sys_id=${sys_id}`);
    console.log('');
    console.log('This test case will remain in UAT for manual inspection.');
    console.log('To clean up, you can close/delete it in ServiceNow UAT.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

createTestCase();
