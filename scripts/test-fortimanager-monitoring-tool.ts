/**
 * Test FortiManager Monitoring Tool
 *
 * Tests the FortiManager monitoring tool with Allcare firewalls
 *
 * USAGE:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/test-fortimanager-monitoring-tool.ts
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/test-fortimanager-monitoring-tool.ts ACM-HQ-FW01
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/test-fortimanager-monitoring-tool.ts ACM-FPA-BKY-FW01 --interfaces
 */

import * as dotenv from 'dotenv';
import { createFortiManagerMonitorTool } from '../lib/agent/tools/fortimanager-monitor';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function testFortiManagerMonitoringTool() {
  console.log('🧪 Testing FortiManager Monitoring Tool');
  console.log('='.repeat(70));
  console.log('');

  // Parse arguments
  const args = process.argv.slice(2);
  const deviceName = args.find(arg => !arg.startsWith('--')) || 'ACM-HQ-FW01';
  const includeInterfaces = args.includes('--interfaces');

  console.log(`Device: ${deviceName}`);
  console.log(`Include Interfaces: ${includeInterfaces}`);
  console.log('');

  // Create tool (mimicking agent tool factory)
  const tool = createFortiManagerMonitorTool({
    messages: [],
    caseNumbers: [],
    updateStatus: (status: string) => console.log(`📡 ${status}`)
  });

  console.log(`Tool Name: ${tool.name}`);
  console.log(`Tool Description: ${tool.description.substring(0, 150)}...`);
  console.log('');

  console.log('─'.repeat(70));
  console.log('Executing Tool');
  console.log('─'.repeat(70));
  console.log('');

  try {
    const result = await tool.execute({
      deviceName,
      metrics: includeInterfaces ? ['all'] : ['cpu', 'memory', 'sessions'],
      includeInterfaces,
      customerName: 'allcare'
    });

    if (result.error) {
      console.error('❌ Tool Error:');
      console.error(result.error);
      console.error('');
      if (result.troubleshooting) {
        console.error('Troubleshooting:');
        console.error(result.troubleshooting);
      }
      process.exit(1);
    }

    console.log('✅ Tool Execution Successful');
    console.log('');
    console.log('─'.repeat(70));
    console.log('Result');
    console.log('─'.repeat(70));
    console.log('');
    console.log(result.status);
    console.log('');
    console.log('─'.repeat(70));
    console.log('Metadata');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`Device: ${result.device_name}`);
    console.log(`Customer: ${result.customer}`);
    console.log(`Cached: ${result.cached}`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error.message || error);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testFortiManagerMonitoringTool()
  .catch(console.error)
  .finally(() => process.exit(0));
