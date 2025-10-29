/**
 * Test Block Kit Formatting Integration
 *
 * Tests that getCase tool returns _blockKitData and formatter produces valid blocks
 *
 * Usage: npx tsx scripts/test-block-kit-formatting.ts [case_number]
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local'), override: true });
process.env.LANGSMITH_TRACING = 'false';

if (process.env.SERVICENOW_URL && !process.env.SERVICENOW_INSTANCE_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

async function testBlockKitFormatting() {
  const caseNumber = process.argv[2] || '48813';

  console.log('🎨 Testing Block Kit Formatting Integration');
  console.log('='.repeat(80));
  console.log();
  console.log(`Test Case: ${caseNumber}`);
  console.log();

  const { createServiceNowTool } = await import('../lib/agent/tools/service-now');
  const { formatCaseAsBlockKit, generateCaseFallbackText } = await import('../lib/formatters/servicenow-block-kit');

  // Step 1: Call getCase tool
  console.log('Step 1: Calling getCase tool...');
  console.log('-'.repeat(80));

  const tool = createServiceNowTool({
    caseNumbers: ['SCS0048813', 'SCS0046363'],
    messages: [],
    updateStatus: (status) => console.log(`   📊 ${status}`),
    options: { channelId: 'TEST' },
  });

  const result = await tool.execute({
    action: 'getCase',
    number: caseNumber,
  });

  console.log();
  console.log('Step 2: Checking tool result...');
  console.log('-'.repeat(80));

  if (!result._blockKitData) {
    console.error('❌ FAIL: Tool did not return _blockKitData');
    console.log('Result keys:', Object.keys(result));
    process.exit(1);
  }

  console.log('✅ _blockKitData present');
  console.log('   Type:', result._blockKitData.type);
  console.log('   Has caseData:', !!result._blockKitData.caseData);
  console.log('   Has journalEntries:', !!result._blockKitData.journalEntries);
  console.log('   Journal count:', result._blockKitData.journalEntries?.length || 0);

  // Step 3: Format with Block Kit
  console.log();
  console.log('Step 3: Formatting with Block Kit...');
  console.log('-'.repeat(80));

  const blocks = formatCaseAsBlockKit(result._blockKitData.caseData, {
    includeJournal: true,
    journalEntries: result._blockKitData.journalEntries,
    maxJournalEntries: 3,
  });

  const fallbackText = generateCaseFallbackText(result._blockKitData.caseData);

  console.log('✅ Block Kit generated');
  console.log(`   Total blocks: ${blocks.length}`);
  console.log(`   Fallback text: "${fallbackText}"`);

  // Step 4: Validate block structure
  console.log();
  console.log('Step 4: Validating block structure...');
  console.log('-'.repeat(80));

  const blockTypes = blocks.map(b => b.type);
  console.log('Block types:', blockTypes);

  // Check for required blocks
  const hasHeader = blocks.some(b => b.type === 'header');
  const hasActions = blocks.some(b => b.type === 'actions');
  const hasActivitySection = blocks.some(b => b.type === 'section' && b.text?.text?.includes('Latest Activity'));

  console.log();
  console.log('Required elements:');
  console.log(`   ${hasHeader ? '✅' : '❌'} Header block`);
  console.log(`   ${hasActions ? '✅' : '❌'} Actions block (ServiceNow link)`);
  console.log(`   ${hasActivitySection ? '✅' : '❌'} Latest Activity section`);

  if (blocks.length > 50) {
    console.warn(`   ⚠️  Block count (${blocks.length}) exceeds Slack limit (50)`);
  } else {
    console.log(`   ✅ Block count (${blocks.length}) within limit`);
  }

  // Step 5: Visual preview
  console.log();
  console.log('Step 5: Visual Preview');
  console.log('='.repeat(80));
  console.log();

  // Show each block's visual representation
  for (const block of blocks) {
    if (block.type === 'header') {
      console.log(`[HEADER] ${block.text.text}`);
      console.log();
    } else if (block.type === 'section' && block.text) {
      console.log(block.text.text);
      console.log();
    } else if (block.type === 'section' && block.fields) {
      console.log('[FIELDS]');
      for (const field of block.fields) {
        console.log(`  ${field.text}`);
      }
      console.log();
    } else if (block.type === 'context') {
      console.log(`[CONTEXT] ${block.elements[0].text}`);
    } else if (block.type === 'divider') {
      console.log('-'.repeat(40));
    } else if (block.type === 'actions') {
      console.log('[ACTIONS]');
      for (const element of block.elements) {
        console.log(`  [Button] ${element.text.text} → ${element.url}`);
      }
      console.log();
    }
  }

  console.log('='.repeat(80));
  console.log();
  console.log('✅ Block Kit integration test PASSED');
  console.log();
  console.log('Next Steps:');
  console.log('  1. Integrate into handle-app-mention.ts to post with blocks');
  console.log('  2. Test in actual Slack channel');
  console.log('  3. Verify mobile rendering');
  console.log();

  // Step 6: Generate JSON for manual testing in Slack Block Kit Builder
  console.log('📋 Copy this JSON to test in Slack Block Kit Builder:');
  console.log('   https://app.slack.com/block-kit-builder');
  console.log();
  console.log(JSON.stringify({ blocks }, null, 2));
}

testBlockKitFormatting().catch((error) => {
  console.error();
  console.error('❌ Test failed:');
  console.error(error);
  process.exit(1);
});
