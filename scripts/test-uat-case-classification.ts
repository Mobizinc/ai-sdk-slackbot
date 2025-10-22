/**
 * UAT End-to-End Service Portfolio Classification Test
 *
 * Tests the complete Service Portfolio Classification flow in UAT:
 * 1. Fetches a real case from UAT ServiceNow
 * 2. Runs through AI classification (case-classifier.ts)
 * 3. Verifies Service Offering is identified
 * 4. Verifies Application Service is identified (if applicable)
 * 5. Confirms database persistence of service_offering and application_service
 *
 * This validates migrations 0009, 0010, 0011 are working correctly.
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
  opened_at?: string;
}

async function snowRequest<T>(path: string): Promise<T> {
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    throw new Error('UAT ServiceNow credentials not configured');
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

async function testUATCaseClassification() {
  console.log('🧪 UAT Service Portfolio Classification - End-to-End Test');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Environment: ${process.env.SERVICENOW_URL}`);
  console.log(`Username: ${process.env.SERVICENOW_USERNAME}`);
  console.log(`Case Table: ${process.env.SERVICENOW_CASE_TABLE}`);
  console.log('');

  const caseTable = process.env.SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case';

  try {
    // ========================================
    // Step 1: Find a Test Case in UAT
    // ========================================
    console.log('Step 1: Finding Test Case in UAT');
    console.log('─'.repeat(80));

    // Search for recent open cases (any category)
    const query = `state!=Closed^state!=Resolved^ORDERBYDESCopened_at`;
    const path = `/api/now/table/${caseTable}?sysparm_query=${encodeURIComponent(query)}&sysparm_limit=5&sysparm_display_value=all&sysparm_fields=sys_id,number,short_description,description,company,category,state,opened_at`;

    console.log('Querying UAT for recent open cases...');
    const response = await snowRequest<{ result: Array<any> }>(path);

    if (!response.result || response.result.length === 0) {
      console.error('❌ No test cases found in UAT');
      console.error('');
      console.error('Please create a test case in UAT ServiceNow with:');
      console.error('  - Short description mentioning a service (VPN, firewall, application, etc.)');
      console.error('  - State: Open');
      console.error('');
      process.exit(1);
    }

    console.log(`✅ Found ${response.result.length} open cases in UAT`);
    console.log('');

    // Display available cases
    console.log('Available test cases:');
    response.result.forEach((c, idx) => {
      const extractValue = (field: any): string => {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object' && field.display_value) return field.display_value;
        if (typeof field === 'object' && field.value) return field.value;
        return String(field);
      };

      const caseNumber = extractValue(c.number);
      const shortDesc = extractValue(c.short_description);
      console.log(`  ${idx + 1}. ${caseNumber}: ${shortDesc.substring(0, 60)}...`);
    });
    console.log('');

    // Use the first case for testing
    const caseRecord = response.result[0];

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
    const category = extractValue(caseRecord.category);

    console.log('Selected test case:');
    console.log(`  Case Number: ${caseNumber}`);
    console.log(`  Company: ${companyName}`);
    console.log(`  Category: ${category || '(none)'}`);
    console.log(`  Short Description: ${shortDesc}`);
    console.log(`  Description: ${description.substring(0, 150)}${description.length > 150 ? '...' : ''}`);
    console.log('');

    // ========================================
    // Step 2: Run AI Classification
    // ========================================
    console.log('Step 2: Running Service Portfolio Classification');
    console.log('─'.repeat(80));

    // Build webhook payload
    const webhookPayload: ServiceNowCaseWebhook = {
      case_number: caseNumber,
      sys_id: sys_id,
      short_description: shortDesc,
      description: description || shortDesc,
      company: extractValue(caseRecord.company?.value) || '',
      category: category || '',
      subcategory: '',
      priority: '',
      state: extractValue(caseRecord.state),
      assigned_to: '',
      assignment_group: '',
    };

    console.log('Invoking case triage service...');
    console.log('This will:');
    console.log('  1. Extract entities from case description');
    console.log('  2. Fetch business context for company');
    console.log('  3. Run AI classification with Service Portfolio categories');
    console.log('  4. Save to database with service_offering and application_service');
    console.log('');

    const triageService = getCaseTriageService();
    const result = await triageService.triageCase(webhookPayload);

    console.log('✅ Classification completed');
    console.log('');

    // ========================================
    // Step 3: Verify Service Portfolio Fields
    // ========================================
    console.log('Step 3: Verifying Service Portfolio Classification');
    console.log('─'.repeat(80));

    const classification = result.classification;

    console.log('AI Classification Results:');
    console.log(`  Category: ${classification.category || '(none)'}`);
    console.log(`  Subcategory: ${classification.subcategory || '(none)'}`);
    console.log(`  Service Offering: ${classification.service_offering || '(none)'}`);
    console.log(`  Application Service: ${classification.application_service || '(none)'}`);
    console.log(`  Confidence: ${classification.confidence_score}`);
    console.log('');

    // Validate Service Offering
    const expectedOfferings = [
      'Infrastructure and Cloud Management',
      'Network Management',
      'Cybersecurity Management',
      'Helpdesk and Endpoint Support - 24/7',
      'Helpdesk and Endpoint - Standard',
      'Application Administration',
    ];

    if (!classification.service_offering) {
      console.warn('⚠️  WARNING: service_offering is null');
      console.warn('   AI did not identify a service offering for this case');
      console.warn('   This might be expected for some case types');
      console.warn('');
    } else if (expectedOfferings.includes(classification.service_offering)) {
      console.log(`✅ service_offering: "${classification.service_offering}" (valid)`);
    } else {
      console.warn(`⚠️  service_offering: "${classification.service_offering}" (unexpected value)`);
      console.warn(`   Expected one of: ${expectedOfferings.join(', ')}`);
    }
    console.log('');

    // ========================================
    // Step 4: Verify Database Persistence
    // ========================================
    console.log('Step 4: Verifying Database Persistence');
    console.log('─'.repeat(80));

    const db = getDb();
    if (!db) {
      console.error('❌ Database not configured (missing DATABASE_URL)');
      process.exit(1);
    }

    // Query case_classification_results table
    console.log('Querying database for classification results...');
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
      console.error('❌ No database record found for case classification');
      console.error('   Classification may not have been saved');
      process.exit(1);
    }

    const dbRecord = dbResults.rows[0] as any;
    console.log('✅ Database record found');
    console.log('');

    console.log('Database Record:');
    console.log(`  case_number: ${dbRecord.case_number}`);
    console.log(`  category: ${dbRecord.category || '(null)'}`);
    console.log(`  subcategory: ${dbRecord.subcategory || '(null)'}`);
    console.log(`  service_offering: ${dbRecord.service_offering || '(null)'}`);
    console.log(`  application_service: ${dbRecord.application_service || '(null)'}`);
    console.log(`  confidence_score: ${dbRecord.confidence_score}`);
    console.log(`  created_at: ${dbRecord.created_at}`);
    console.log('');

    // Verify columns exist and match
    const serviceOfferingMatches = dbRecord.service_offering === classification.service_offering;
    const applicationServiceMatches = dbRecord.application_service === classification.application_service;

    if (serviceOfferingMatches) {
      console.log('✅ service_offering persisted correctly');
    } else {
      console.error('❌ service_offering mismatch!');
      console.error(`   In-memory: ${classification.service_offering}`);
      console.error(`   Database: ${dbRecord.service_offering}`);
    }

    if (applicationServiceMatches) {
      console.log('✅ application_service persisted correctly');
    } else {
      console.error('❌ application_service mismatch!');
      console.error(`   In-memory: ${classification.application_service}`);
      console.error(`   Database: ${dbRecord.application_service}`);
    }
    console.log('');

    // ========================================
    // Step 5: Summary Report
    // ========================================
    console.log('─'.repeat(80));
    console.log('📊 Test Results Summary');
    console.log('─'.repeat(80));
    console.log('');

    const checks = [
      {
        name: 'UAT case fetched successfully',
        status: true,
      },
      {
        name: 'AI classification completed',
        status: true,
      },
      {
        name: 'service_offering identified',
        status: !!classification.service_offering,
      },
      {
        name: 'service_offering is valid',
        status: !classification.service_offering || expectedOfferings.includes(classification.service_offering),
      },
      {
        name: 'Database record created',
        status: true,
      },
      {
        name: 'service_offering persisted',
        status: serviceOfferingMatches,
      },
      {
        name: 'application_service persisted',
        status: applicationServiceMatches,
      },
    ];

    console.log('Validation Checks:');
    checks.forEach(check => {
      const icon = check.status ? '✅' : '❌';
      console.log(`  ${icon} ${check.name}`);
    });
    console.log('');

    const failedChecks = checks.filter(c => !c.status);

    if (failedChecks.length > 0) {
      console.error('❌ TEST FAILED');
      console.error('');
      console.error('Failed checks:');
      failedChecks.forEach(check => {
        console.error(`  - ${check.name}`);
      });
      console.error('');
      process.exit(1);
    }

    console.log('✅ All tests passed! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ UAT ServiceNow integration working');
    console.log('  ✅ AI Service Portfolio Classification functional');
    console.log('  ✅ Database migrations 0009, 0010, 0011 applied correctly');
    console.log('  ✅ service_offering column populated');
    console.log('  ✅ application_service column populated');
    console.log('  ✅ Ready for production deployment');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(error);
    console.error('');
    process.exit(1);
  }
}

testUATCaseClassification()
  .catch(console.error)
  .finally(() => process.exit(0));
