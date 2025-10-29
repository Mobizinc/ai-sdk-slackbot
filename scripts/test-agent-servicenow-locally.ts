/**
 * Test Agent with ServiceNow Tool Calls Locally
 *
 * Tests the complete agent runner flow with ServiceNow tool integration
 * using actual credentials from .env.local
 *
 * Usage: npx tsx scripts/test-agent-servicenow-locally.ts [case_number]
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local FIRST - with override to ensure .env.local values are used
// This prevents shell environment variables from taking precedence
config({ path: resolve(process.cwd(), '.env.local'), override: true });

// Disable LangSmith for local testing to avoid tracing errors
process.env.LANGSMITH_TRACING = 'false';

// Map SERVICENOW_URL to SERVICENOW_INSTANCE_URL if needed
if (process.env.SERVICENOW_URL && !process.env.SERVICENOW_INSTANCE_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

// Verify credentials loaded
if (!process.env.SERVICENOW_INSTANCE_URL) {
  console.error('❌ SERVICENOW_INSTANCE_URL or SERVICENOW_URL not found in .env.local');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('✅ Credentials loaded from .env.local');
console.log(`   ServiceNow: ${process.env.SERVICENOW_INSTANCE_URL}`);
console.log(`   Anthropic API: ${process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET'}`);
console.log();

async function testAgentLocally() {
  const { runAgent } = await import('../lib/agent/runner');
  const { serviceNowClient } = await import('../lib/tools/servicenow');

  // Get case number from command line or use default
  const caseInput = process.argv[2] || '46363';

  console.log('🧪 Testing Agent with ServiceNow Tool Calls');
  console.log('='.repeat(80));
  console.log();
  console.log(`Test Query: "give me details for ${caseInput}"`);
  console.log();
  console.log('Expected Behavior:');
  console.log('  1. Agent extracts case number from user message');
  console.log('  2. Agent normalizes to ServiceNow format (e.g., 46363 → SCS0046363)');
  console.log('  3. Agent calls servicenow_action tool');
  console.log('  4. Tool retrieves case from mobiz.service-now.com');
  console.log('  5. Agent formats and returns response');
  console.log();
  console.log('='.repeat(80));
  console.log();
  console.log('🔍 Step 1: Verify ServiceNow Connectivity');
  console.log('-'.repeat(80));

  // Test direct ServiceNow call first
  console.log(`Testing direct call to mobiz.service-now.com...`);

  try {
    const testCase = await serviceNowClient.getCase('SCS0046363');
    if (testCase) {
      console.log('✅ ServiceNow connectivity working');
      console.log(`   Retrieved: ${testCase.number} - ${testCase.short_description?.substring(0, 60)}`);
    } else {
      console.log('⚠️  Case SCS0046363 not found (may not exist)');
      console.log('   Testing with different case number...');

      const altCase = await serviceNowClient.getCase('SCS0048813');
      if (altCase) {
        console.log(`✅ Found alternate case: ${altCase.number}`);
      } else {
        console.error('❌ Cannot retrieve any cases - check credentials');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ ServiceNow connection failed:');
    console.error('   ', error instanceof Error ? error.message : String(error));
    console.error();
    console.error('   Check:');
    console.error('   1. SERVICENOW_INSTANCE_URL is correct in .env.local');
    console.error('   2. SERVICENOW_USERNAME and SERVICENOW_PASSWORD are valid');
    console.error('   3. Network connectivity to mobiz.service-now.com');
    process.exit(1);
  }

  console.log();
  console.log('🤖 Step 2: Test Agent Runner with ServiceNow Tool');
  console.log('-'.repeat(80));
  console.log();
  console.log('Running agent with query...');
  console.log();

  const startTime = Date.now();

  try {
    const response = await runAgent({
      messages: [
        {
          role: 'user',
          content: `give me details for ${caseInput}`,
        },
      ],
      caseNumbers: [], // Start empty to test normalization from scratch
      updateStatus: (status) => {
        console.log(`   📊 Status: ${status}`);
      },
      options: {
        channelId: 'TEST_CHANNEL',
      },
    });

    const duration = Date.now() - startTime;

    console.log();
    console.log('✅ Agent completed successfully!');
    console.log('='.repeat(80));
    console.log();
    console.log('📝 Agent Response:');
    console.log('-'.repeat(80));
    console.log(response);
    console.log();
    console.log('-'.repeat(80));
    console.log(`⏱️  Total time: ${duration}ms`);
    console.log();

    // Verify response is not empty
    if (!response || response.trim().length === 0) {
      console.error('❌ FAIL: Agent returned empty response');
      console.error('   This is the staging issue - agent executes but returns nothing');
      process.exit(1);
    }

    console.log('✅ PASS: Agent returned a response');
    console.log();

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log();
    console.error('❌ Agent failed:');
    console.error('='.repeat(80));
    console.error(error);
    console.error();
    console.error(`⏱️  Failed after: ${duration}ms`);
    console.error();
    process.exit(1);
  }
}

testAgentLocally().catch((error) => {
  console.error('💥 Unhandled error:');
  console.error(error);
  process.exit(1);
});
