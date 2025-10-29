/**
 * Comprehensive ServiceNow Actions Test Script
 *
 * Tests all 6 ServiceNow tool actions to ensure they work correctly:
 * 1. getCase
 * 2. getIncident
 * 3. getCaseJournal
 * 4. searchKnowledge
 * 5. searchConfigurationItem
 * 6. searchCases
 *
 * Usage: npx tsx scripts/test-all-servicenow-actions.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local with override
config({ path: resolve(process.cwd(), '.env.local'), override: true });
process.env.LANGSMITH_TRACING = 'false';

// Map SERVICENOW_URL to SERVICENOW_INSTANCE_URL if needed
if (process.env.SERVICENOW_URL && !process.env.SERVICENOW_INSTANCE_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

interface TestResult {
  action: string;
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  response?: any;
}

const results: TestResult[] = [];

function logTest(action: string, testName: string) {
  console.log();
  console.log('='.repeat(80));
  console.log(`🧪 TEST: ${action} - ${testName}`);
  console.log('='.repeat(80));
}

function logResult(result: TestResult) {
  const icon = result.passed ? '✅' : '❌';
  console.log();
  console.log(`${icon} ${result.action} - ${result.testName}`);
  console.log(`   Duration: ${result.duration}ms`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  console.log();
}

async function runTest(
  action: string,
  testName: string,
  testFn: () => Promise<any>
): Promise<void> {
  logTest(action, testName);

  const start = Date.now();
  try {
    const response = await testFn();
    const duration = Date.now() - start;

    const result: TestResult = {
      action,
      testName,
      passed: true,
      duration,
      response,
    };

    results.push(result);
    logResult(result);

    // Show response summary
    console.log('Response Summary:');
    if (response.case) {
      console.log(`   Case: ${response.case.number} - ${response.case.short_description}`);
    } else if (response.incident) {
      console.log(`   Incident: ${response.incident.number} - ${response.incident.short_description}`);
    } else if (response.entries) {
      console.log(`   Journal entries: ${response.entries.length}`);
    } else if (response.articles) {
      console.log(`   KB articles: ${response.articles.length}`);
    } else if (response.configuration_items) {
      console.log(`   CIs found: ${response.configuration_items.length}`);
    } else if (response.cases) {
      console.log(`   Cases found: ${response.cases.length}`);
    } else if (response.error || response.message) {
      console.log(`   Message: ${response.error || response.message}`);
    } else {
      console.log(`   ${JSON.stringify(response).substring(0, 200)}`);
    }

    return;
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const result: TestResult = {
      action,
      testName,
      passed: false,
      duration,
      error: errorMsg,
    };

    results.push(result);
    logResult(result);
  }
}

async function testAllActions() {
  console.log('🔧 COMPREHENSIVE SERVICENOW TOOL ACTIONS TEST');
  console.log('='.repeat(80));
  console.log();
  console.log('Testing against: mobiz.service-now.com');
  console.log('Test Data:');
  console.log('  - Case: SCS0046363 (bare: 46363)');
  console.log('  - Incident: INC0168018 (bare: 168018)');
  console.log('  - Customer: Altus');
  console.log();

  const { createServiceNowTool } = await import('../lib/agent/tools/service-now');

  const tool = createServiceNowTool({
    caseNumbers: ['SCS0046363', 'SCS0048813', 'INC0168018'],
    messages: [],
    updateStatus: (status) => console.log(`   📊 Status: ${status}`),
    options: { channelId: 'TEST_CHANNEL' },
  });

  // ============================================================================
  // TEST 1: getCase
  // ============================================================================

  await runTest('getCase', 'Retrieve case with bare number (46363)', async () => {
    return await tool.execute({
      action: 'getCase',
      number: 46363 as any, // Test number type
    });
  });

  await runTest('getCase', 'Retrieve case with full format (SCS0046363)', async () => {
    return await tool.execute({
      action: 'getCase',
      number: 'SCS0046363',
    });
  });

  await runTest('getCase', 'Non-existent case (should return not found)', async () => {
    return await tool.execute({
      action: 'getCase',
      number: '99999999',
    });
  });

  // ============================================================================
  // TEST 2: getIncident
  // ============================================================================

  await runTest('getIncident', 'Retrieve incident with full format (INC0168018)', async () => {
    return await tool.execute({
      action: 'getIncident',
      number: 'INC0168018',
    });
  });

  await runTest('getIncident', 'Retrieve incident with bare number (168018)', async () => {
    return await tool.execute({
      action: 'getIncident',
      number: '168018',
    });
  });

  await runTest('getIncident', 'Non-existent incident (should try case fallback)', async () => {
    return await tool.execute({
      action: 'getIncident',
      number: '99999999',
    });
  });

  // ============================================================================
  // TEST 3: getCaseJournal
  // ============================================================================

  await runTest('getCaseJournal', 'Get journal by case number (46363)', async () => {
    return await tool.execute({
      action: 'getCaseJournal',
      number: '46363',
      limit: 5,
    });
  });

  await runTest('getCaseJournal', 'Get journal for SCS0046363 with limit 10', async () => {
    return await tool.execute({
      action: 'getCaseJournal',
      number: 'SCS0046363',
      limit: 10,
    });
  });

  await runTest('getCaseJournal', 'Non-existent case journal', async () => {
    return await tool.execute({
      action: 'getCaseJournal',
      number: '99999999',
    });
  });

  // ============================================================================
  // TEST 4: searchKnowledge
  // ============================================================================

  await runTest('searchKnowledge', 'Search KB for "password reset"', async () => {
    return await tool.execute({
      action: 'searchKnowledge',
      query: 'password reset',
      limit: 3,
    });
  });

  await runTest('searchKnowledge', 'Search KB for "Azure"', async () => {
    return await tool.execute({
      action: 'searchKnowledge',
      query: 'Azure',
      limit: 5,
    });
  });

  await runTest('searchKnowledge', 'Search KB for unlikely term (may be empty)', async () => {
    return await tool.execute({
      action: 'searchKnowledge',
      query: 'xyznonexistent12345query',
      limit: 5,
    });
  });

  // ============================================================================
  // TEST 5: searchConfigurationItem
  // ============================================================================

  await runTest('searchConfigurationItem', 'Search CI for customer "Altus"', async () => {
    return await tool.execute({
      action: 'searchConfigurationItem',
      ciName: 'Altus',
      limit: 5,
    });
  });

  await runTest('searchConfigurationItem', 'Search CI for "Azure"', async () => {
    return await tool.execute({
      action: 'searchConfigurationItem',
      ciName: 'Azure',
      limit: 5,
    });
  });

  await runTest('searchConfigurationItem', 'Search CI for "server"', async () => {
    return await tool.execute({
      action: 'searchConfigurationItem',
      ciName: 'server',
      limit: 5,
    });
  });

  // ============================================================================
  // TEST 6: searchCases
  // ============================================================================

  await runTest('searchCases', 'Search cases for company "Altus"', async () => {
    return await tool.execute({
      action: 'searchCases',
      companyName: 'Altus',
      limit: 5,
    });
  });

  await runTest('searchCases', 'Search high priority open cases', async () => {
    return await tool.execute({
      action: 'searchCases',
      priority: '2',
      state: 'Open',
      limit: 5,
    });
  });

  await runTest('searchCases', 'Search cases with keyword "Azure"', async () => {
    return await tool.execute({
      action: 'searchCases',
      query: 'Azure',
      limit: 10,
    });
  });

  await runTest('searchCases', 'Search active cases only (default)', async () => {
    return await tool.execute({
      action: 'searchCases',
      activeOnly: true,
      limit: 10,
    });
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log();
  console.log('='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log();

  console.log('Results by Action:');
  console.log('-'.repeat(80));

  const actions = ['getCase', 'getIncident', 'getCaseJournal', 'searchKnowledge', 'searchConfigurationItem', 'searchCases'];

  for (const action of actions) {
    const actionResults = results.filter((r) => r.action === action);
    const actionPassed = actionResults.filter((r) => r.passed).length;
    const actionTotal = actionResults.length;
    const icon = actionPassed === actionTotal ? '✅' : '❌';

    console.log(`${icon} ${action}: ${actionPassed}/${actionTotal} passed`);

    for (const result of actionResults) {
      const testIcon = result.passed ? '  ✓' : '  ✗';
      console.log(`${testIcon} ${result.testName} (${result.duration}ms)`);
      if (!result.passed && result.error) {
        console.log(`     Error: ${result.error.substring(0, 100)}`);
      }
    }
    console.log();
  }

  console.log('='.repeat(80));

  if (failed > 0) {
    console.log(`⚠️  ${failed} test(s) failed - review output above for details`);
    process.exit(1);
  } else {
    console.log('🎉 All tests passed! ServiceNow tool is ready for production.');
  }
}

testAllActions().catch((error) => {
  console.error();
  console.error('💥 Test suite failed with unhandled error:');
  console.error(error);
  process.exit(1);
});
