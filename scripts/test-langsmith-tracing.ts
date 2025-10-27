/**
 * LangSmith Tracing Test
 *
 * Tests that LangSmith tracing is properly configured and working.
 * This script makes a simple Anthropic API call and verifies it appears in LangSmith.
 *
 * Usage:
 *   LANGSMITH_API_KEY=lsv2_pt_... tsx scripts/test-langsmith-tracing.ts
 */

import { anthropic, anthropicModel } from '../lib/model-provider';
import { config } from '../lib/config';

async function testLangSmithTracing() {
  console.log('🧪 Testing LangSmith Tracing Integration\n');

  // Check configuration
  console.log('Configuration:');
  console.log(`  LANGSMITH_API_KEY: ${config.langsmithApiKey ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`  LANGSMITH_PROJECT: ${config.langsmithProject || 'default'}`);
  console.log(`  LANGSMITH_TRACING: ${config.langsmithTracingEnabled ?? 'true (default)'}`);
  console.log(`  Anthropic Model: ${anthropicModel}`);
  console.log();

  if (!config.langsmithApiKey && !process.env.LANGSMITH_API_KEY) {
    console.error('❌ LANGSMITH_API_KEY not set!');
    console.log('\nTo fix:');
    console.log('  1. Get API key from https://smith.langchain.com/settings');
    console.log('  2. Set: export LANGSMITH_API_KEY="lsv2_pt_..."');
    console.log('  3. Re-run this script\n');
    process.exit(1);
  }

  try {
    console.log('📡 Making test Anthropic API call...');

    const startTime = Date.now();

    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: 'Respond with "LangSmith tracing is working!" and explain what you are.',
        },
      ],
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ Anthropic API call successful!\n');
    console.log('Response:');
    const textContent = response.content.find(block => block.type === 'text');
    if (textContent && textContent.type === 'text') {
      console.log(`  ${textContent.text}\n`);
    }

    console.log('Usage Metrics:');
    console.log(`  Input tokens: ${response.usage.input_tokens}`);
    console.log(`  Output tokens: ${response.usage.output_tokens}`);

    if (response.usage.cache_creation_input_tokens) {
      console.log(`  Cache write: ${response.usage.cache_creation_input_tokens} tokens`);
    }
    if (response.usage.cache_read_input_tokens) {
      console.log(`  Cache read: ${response.usage.cache_read_input_tokens} tokens`);
    }

    console.log(`  Latency: ${duration}ms`);
    console.log();

    console.log('🎯 Next Steps:');
    console.log('  1. Go to: https://smith.langchain.com/');
    console.log(`  2. Select project: "${config.langsmithProject || 'default'}"`);
    console.log('  3. You should see a new trace within 5-10 seconds');
    console.log('  4. Click the trace to view full details\n');

    console.log('✅ LangSmith tracing test complete!');
    console.log('   If traces appear in dashboard, telemetry is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    if (error instanceof Error) {
      console.error('   Error:', error.message);
    }

    console.log('\nTroubleshooting:');
    console.log('  - Verify ANTHROPIC_API_KEY is set');
    console.log('  - Check network connectivity');
    console.log('  - Review logs above for specific errors\n');

    process.exit(1);
  }
}

testLangSmithTracing();
