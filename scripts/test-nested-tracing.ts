/**
 * Nested Tracing Test
 *
 * Tests that LangSmith tracing produces properly nested spans with the new architecture:
 * - Root span from entry point (simulated Slack handler)
 * - Child spans from orchestrator stages
 * - Child spans from runner steps (LLM calls, tool executions)
 * - Anthropic SDK calls appear as children, not orphaned roots
 *
 * Usage:
 *   LANGSMITH_API_KEY=lsv2_pt_... tsx scripts/test-nested-tracing.ts
 */

import { withLangSmithTrace, createChildSpan } from '../lib/observability';
import { generateResponse } from '../lib/generate-response';
import type { ChatMessage } from '../lib/agent/types';
import { config } from '../lib/config';

async function testNestedTracing() {
  console.log('🧪 Testing Nested LangSmith Tracing\n');

  // Check configuration
  console.log('Configuration:');
  console.log(`  LANGSMITH_API_KEY: ${config.langsmithApiKey ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`  LANGSMITH_PROJECT: ${config.langsmithProject || 'default'}`);
  console.log(`  LANGSMITH_TRACING: ${config.langsmithTracingEnabled ?? 'true (default)'}`);
  console.log(`  ANTHROPIC_API_KEY: ${config.anthropicApiKey ? '✅ SET' : '❌ NOT SET'}`);
  console.log();

  if (!config.langsmithApiKey && !process.env.LANGSMITH_API_KEY) {
    console.error('❌ LANGSMITH_API_KEY not set!');
    console.log('\nTo fix:');
    console.log('  1. Get API key from https://smith.langchain.com/settings');
    console.log('  2. Set: export LANGSMITH_API_KEY="lsv2_pt_..."');
    console.log('  3. Re-run this script\n');
    process.exit(1);
  }

  if (!config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set!');
    console.log('\nTo fix:');
    console.log('  1. Get API key from https://console.anthropic.com/');
    console.log('  2. Set: export ANTHROPIC_API_KEY="sk-ant-..."');
    console.log('  3. Re-run this script\n');
    process.exit(1);
  }

  try {
    console.log('📡 Simulating full agent pipeline with nested tracing...\n');

    // Simulate the full entry point → orchestrator → runner → LLM flow
    const testResult = await simulateSlackHandler();

    console.log('\n✅ Test completed successfully!\n');
    console.log('Response:', testResult.slice(0, 200));
    console.log();

    console.log('🎯 Verification Steps:');
    console.log('  1. Go to: https://smith.langchain.com/');
    console.log(`  2. Select project: "${config.langsmithProject || 'default'}"`);
    console.log('  3. You should see a new trace within 5-10 seconds');
    console.log('  4. Click the trace to view the hierarchy:\n');
    console.log('     Expected structure:');
    console.log('     ├─ simulated_slack_handler (root)');
    console.log('     │  ├─ pre_processing');
    console.log('     │  ├─ agent_orchestrator');
    console.log('     │  │  ├─ load_context');
    console.log('     │  │  ├─ build_prompt');
    console.log('     │  │  ├─ agent_runner');
    console.log('     │  │  │  ├─ anthropic_call_step_1 (LLM)');
    console.log('     │  │  │  │  └─ Anthropic.messages.create (wrapSDK)');
    console.log('     │  │  │  ├─ tool_execution_batch_step_1');
    console.log('     │  │  │  │  ├─ tool_[name1]');
    console.log('     │  │  │  │  └─ tool_[name2]');
    console.log('     │  │  │  └─ anthropic_call_step_2 (LLM)');
    console.log('     │  │  │     └─ Anthropic.messages.create (wrapSDK)');
    console.log('     │  │  └─ format_message');
    console.log('     │  └─ post_processing\n');

    console.log('✅ Nested tracing test complete!');
    console.log('   Verify in LangSmith dashboard that spans are properly nested.\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);

    if (error instanceof Error) {
      console.error('   Error:', error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    }

    console.log('\nTroubleshooting:');
    console.log('  - Verify ANTHROPIC_API_KEY is set');
    console.log('  - Verify LANGSMITH_API_KEY is set');
    console.log('  - Check network connectivity');
    console.log('  - Review logs above for specific errors\n');

    process.exit(1);
  }
}

/**
 * Simulate a Slack message handler with nested operations
 */
const simulateSlackHandler = withLangSmithTrace(
  async (): Promise<string> => {
    // Simulate pre-processing
    const preProcessingSpan = await createChildSpan({
      name: 'pre_processing',
      runType: 'chain',
      metadata: {
        channelId: 'C123456',
        threadTs: '1234567890.123456',
        userId: 'U123456',
      },
      tags: {
        component: 'test-handler',
        operation: 'preprocessing',
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    await preProcessingSpan?.end({ validated: true });

    // Build test messages
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: 'What is the capital of France? Then search the web for current weather there.',
      },
    ];

    // Create an update status function for testing
    const updateStatus = (status: string) => {
      console.log(`  [Status Update] ${status}`);
    };

    // Call the actual agent pipeline (this will create nested spans)
    const response = await generateResponse(messages, updateStatus, {
      channelId: 'C123456',
      threadTs: '1234567890.123456',
    });

    // Simulate post-processing
    const postProcessingSpan = await createChildSpan({
      name: 'post_processing',
      runType: 'chain',
      metadata: {
        responseLength: response.length,
      },
      tags: {
        component: 'test-handler',
        operation: 'postprocessing',
      },
    });

    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
    await postProcessingSpan?.end({ formatted: true });

    return response;
  },
  {
    name: 'simulated_slack_handler',
    runType: 'chain',
    metadata: {
      testMode: true,
      channelId: 'C123456',
      threadTs: '1234567890.123456',
      userId: 'U123456',
      messageId: 'M123456',
    },
    tags: {
      component: 'test-handler',
      operation: 'message_received',
      testType: 'nested-tracing',
    },
  }
);

testNestedTracing();
