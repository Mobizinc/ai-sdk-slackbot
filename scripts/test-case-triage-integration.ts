/**
 * Case Triage Integration Test
 * Tests the complete case triage workflow with real services
 *
 * Run with: npx tsx scripts/test-case-triage-integration.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// IMPORTANT: Load .env.local BEFORE importing any modules that read process.env
config({ path: resolve(process.cwd(), '.env.local') });

// Now import modules (they will read the loaded env vars)
import { getDb, isDatabaseAvailable } from '../lib/db/client';
import { createAzureSearchClient } from '../lib/services/azure-search-client';
import { getCaseTriageService } from '../lib/services/case-triage';
import { validateServiceNowWebhook } from '../lib/schemas/servicenow-webhook';

// Import ServiceNow client dynamically to ensure env vars are loaded
let serviceNowClient: any;

async function testDatabaseConnectivity() {
  console.log('\n📊 Testing Database Connectivity...');

  if (!isDatabaseAvailable()) {
    console.log('❌ Database: DATABASE_URL not configured');
    return false;
  }

  try {
    const db = getDb();
    if (!db) {
      console.log('❌ Database: Failed to initialize');
      return false;
    }

    // Try a simple query
    const result = await db.execute('SELECT 1 as test');
    console.log('✅ Database: Connected and query successful');
    return true;
  } catch (error) {
    console.error('❌ Database error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function testAzureSearchConnectivity() {
  console.log('\n🔍 Testing Azure AI Search Connectivity...');

  const searchClient = createAzureSearchClient();

  if (!searchClient) {
    console.log('❌ Azure Search: Not configured (missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY)');
    return false;
  }

  try {
    const testResult = await searchClient.testConnection();

    if (testResult.success) {
      console.log(`✅ Azure Search: Connected to index "${testResult.indexName}"`);

      // Get index stats
      const stats = await searchClient.getIndexStats();
      if (stats.documentCount !== undefined) {
        console.log(`   Documents indexed: ${stats.documentCount.toLocaleString()}`);
      }

      return true;
    } else {
      console.log(`❌ Azure Search: ${testResult.message}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Azure Search error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function testServiceNowConnectivity() {
  console.log('\n📋 Testing ServiceNow Connectivity...');

  // Import dynamically after env vars are loaded
  const { serviceNowClient: client } = await import('../lib/tools/servicenow');
  serviceNowClient = client;

  if (!serviceNowClient.isConfigured()) {
    console.log('❌ ServiceNow: Not configured (missing credentials)');
    console.log('   URL:', process.env.SERVICENOW_URL || process.env.SERVICENOW_INSTANCE_URL ? '✅' : '❌');
    console.log('   USERNAME:', process.env.SERVICENOW_USERNAME ? '✅' : '❌');
    console.log('   PASSWORD:', process.env.SERVICENOW_PASSWORD ? '✅' : '❌');
    return false;
  }

  try {
    // Try to fetch a test case (use a known case number if available)
    const testCaseNumber = 'SCS0000001'; // Placeholder
    console.log(`   Attempting to fetch case: ${testCaseNumber}...`);

    // This will fail if case doesn't exist, but proves connectivity
    const caseData = await serviceNowClient.getCase(testCaseNumber);

    if (caseData) {
      console.log(`✅ ServiceNow: Connected and case found (${caseData.number})`);
    } else {
      console.log(`✅ ServiceNow: Connected (test case not found, but API is working)`);
    }

    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's just a "case not found" error (which is OK for connectivity test)
    if (errorMsg.includes('404') || errorMsg.includes('not found')) {
      console.log('✅ ServiceNow: Connected (test case not found, but API is reachable)');
      return true;
    }

    console.error('❌ ServiceNow error:', errorMsg);
    return false;
  }
}

async function testSchemaValidation() {
  console.log('\n📝 Testing Schema Validation...');

  // Test with production-like payload
  const testPayload = {
    case_number: 'SCS0048536',
    sys_id: 'test-sys-id-123',
    short_description: 'Test case for integration testing',
    description: 'This is a test case to verify schema validation works',
    priority: '3',
    urgency: '2',
    category: 'Hardware',
    assignment_group: 'L2 Support',
    company: 'test-company-id',
    account_id: 'test-account-id',
  };

  const result = validateServiceNowWebhook(testPayload);

  if (result.success) {
    console.log('✅ Schema Validation: Test payload validated successfully');
    return true;
  } else {
    console.log('❌ Schema Validation: Failed');
    console.error('   Errors:', result.errors);
    return false;
  }
}

async function testTriageServiceInitialization() {
  console.log('\n⚙️  Testing Triage Service Initialization...');

  try {
    // Ensure ServiceNow client is imported
    if (!serviceNowClient) {
      const { serviceNowClient: client } = await import('../lib/tools/servicenow');
      serviceNowClient = client;
    }

    const triageService = getCaseTriageService();
    console.log('✅ Triage Service: Initialized successfully');

    // Test connectivity check
    const connectivity = await triageService.testConnectivity();
    console.log('   Connectivity check results:');
    console.log(`   - Azure Search: ${connectivity.azureSearch ? '✅' : '❌'}`);
    console.log(`   - Database: ${connectivity.database ? '✅' : '❌'}`);
    console.log(`   - ServiceNow: ${connectivity.serviceNow ? '✅' : '❌'}`);

    return true;
  } catch (error) {
    console.error('❌ Triage Service error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function testAzureSearchQuery() {
  console.log('\n🔎 Testing Azure Search Query (BM25 keyword search)...');

  const searchClient = createAzureSearchClient();

  if (!searchClient) {
    console.log('❌ Azure Search: Not configured');
    return false;
  }

  try {
    // Test a real search query
    const results = await searchClient.searchSimilarCases('timeclock not working', {
      topK: 3,
      crossClient: true,
    });

    console.log(`✅ Azure Search: Query executed successfully`);
    console.log(`   Found ${results.length} similar cases`);

    if (results.length > 0) {
      console.log(`   Top result: ${results[0].case_number} (score: ${results[0].similarity_score.toFixed(2)})`);

      // Check MSP attribution
      const sameClientCount = results.filter(r => r.same_client).length;
      console.log(`   MSP Attribution: ${sameClientCount} same client, ${results.length - sameClientCount} different clients`);
    }

    return true;
  } catch (error) {
    console.error('❌ Azure Search query error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 Case Triage Integration Tests');
  console.log('================================\n');
  console.log('Environment: .env.local');
  console.log('Model: Anthropic Claude Sonnet 4.5 (via AI Gateway)\n');

  const results = {
    schema: await testSchemaValidation(),
    database: await testDatabaseConnectivity(),
    azureSearch: await testAzureSearchConnectivity(),
    azureSearchQuery: await testAzureSearchQuery(),
    serviceNow: await testServiceNowConnectivity(),
    triageService: await testTriageServiceInitialization(),
  };

  console.log('\n================================');
  console.log('📊 Test Results Summary');
  console.log('================================\n');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${test.padEnd(20)} ${passed ? 'PASSED' : 'FAILED'}`);
  });

  console.log(`\n${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n🎉 All integration tests passed! Ready to process webhooks.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check configuration above.');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('\n💥 Integration test failed:', error);
  process.exit(1);
});
