/**
 * Test Journal Entry Formatting
 *
 * Tests that getCaseJournal returns formatted "Latest Activity" section
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local'), override: true });
process.env.LANGSMITH_TRACING = 'false';

if (process.env.SERVICENOW_URL && !process.env.SERVICENOW_INSTANCE_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

async function testJournalFormatting() {
  const { createServiceNowTool } = await import('../lib/agent/tools/service-now');

  const tool = createServiceNowTool({
    caseNumbers: ['SCS0048813'],
    messages: [],
    updateStatus: (status) => console.log(`   📊 ${status}`),
    options: { channelId: 'TEST' },
  });

  console.log('Testing getCaseJournal formatting...\n');

  const result = await tool.execute({
    action: 'getCaseJournal',
    number: '48813',
    limit: 5,
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('\n---\n');

  if (result.latest_activity) {
    console.log('✅ latest_activity field present');
    console.log('\nFormatted for display:');
    console.log(result.latest_activity);
  } else {
    console.log('❌ latest_activity field MISSING');
  }

  console.log('\n---\n');
  console.log(`Total entries: ${result.total || 0}`);

  if (result.entries && result.entries.length > 0) {
    console.log('\nFirst entry raw:');
    console.log(JSON.stringify(result.entries[0], null, 2));
  }
}

testJournalFormatting().catch(console.error);
