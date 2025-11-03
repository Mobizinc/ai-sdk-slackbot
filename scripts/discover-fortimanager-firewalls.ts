/**
 * Discover FortiManager Firewalls
 *
 * Connects to FortiManager API and discovers all managed FortiGate firewalls
 * Exports firewall data to JSON and CSV formats for review and import
 *
 * PREREQUISITES:
 * - FortiManager credentials in .env.local:
 *   FORTIMANAGER_URL=https://fortimanager-ip-or-hostname
 *   FORTIMANAGER_USERNAME=api-username
 *   FORTIMANAGER_PASSWORD=api-password
 *
 * USAGE:
 *   npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare
 *   npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare --output custom-name
 *
 * OUTPUTS:
 * - backup/fortimanager-discovery/<customer>-firewalls.json
 * - backup/fortimanager-discovery/<customer>-firewalls.csv
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { FortiManagerHttpClient, FortiManagerFirewallRepository } from '../lib/infrastructure/fortimanager';
import type { Firewall, DiscoverySummary } from '../lib/infrastructure/fortimanager';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function discoverFortiManagerFirewalls(customerName: string, outputName?: string) {
  console.log('🔥 FortiManager Firewall Discovery');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials from environment
  const fmgUrl = process.env.FORTIMANAGER_URL;
  const fmgUsername = process.env.FORTIMANAGER_USERNAME;
  const fmgPassword = process.env.FORTIMANAGER_PASSWORD;
  const fmgApiKey = process.env.FORTIMANAGER_API_KEY;

  if (!fmgUrl) {
    console.error('❌ FortiManager URL not configured');
    console.error('');
    console.error('Required environment variable:');
    console.error('  FORTIMANAGER_URL=https://fortimanager-ip');
    console.error('');
    process.exit(1);
  }

  if (!fmgApiKey && (!fmgUsername || !fmgPassword)) {
    console.error('❌ FortiManager credentials not configured');
    console.error('');
    console.error('Required environment variables (choose one method):');
    console.error('');
    console.error('Method 1 - API Token (FortiManager 7.2.2+):');
    console.error('  FORTIMANAGER_API_KEY=your-api-token');
    console.error('');
    console.error('Method 2 - Username/Password:');
    console.error('  FORTIMANAGER_USERNAME=api-username');
    console.error('  FORTIMANAGER_PASSWORD=api-password');
    console.error('');
    process.exit(1);
  }

  console.log(`Customer: ${customerName}`);
  console.log(`FortiManager: ${fmgUrl}`);
  console.log('');

  try {
    // Initialize FortiManager client
    console.log('Connecting to FortiManager...');

    const clientConfig: any = {
      url: fmgUrl,
      defaultTimeout: 30000,
      maxRetries: 3
    };

    if (fmgApiKey) {
      console.log('Using API token authentication');
      clientConfig.apiKey = fmgApiKey;
    } else {
      console.log('Using username/password authentication');
      clientConfig.username = fmgUsername;
      clientConfig.password = fmgPassword;
    }

    const client = new FortiManagerHttpClient(clientConfig);

    const repository = new FortiManagerFirewallRepository(client);

    // Discover all firewalls
    console.log('');
    console.log('─'.repeat(70));
    console.log('Discovering Firewalls');
    console.log('─'.repeat(70));
    console.log('');

    const firewalls = await repository.getAllFirewalls();

    if (firewalls.length === 0) {
      console.log('⚠️  No firewalls found');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - No FortiGate devices managed by this FortiManager');
      console.log('  - Insufficient permissions');
      console.log('  - Devices not yet authorized/promoted');
      console.log('');
      await repository.disconnect();
      process.exit(0);
    }

    // Build discovery summary from fetched firewalls (don't re-fetch)
    const summary = {
      totalFirewalls: firewalls.length,
      onlineFirewalls: firewalls.filter(f => f.status === 'online').length,
      offlineFirewalls: firewalls.filter(f => f.status === 'offline').length,
      models: {} as Record<string, number>,
      discoveredAt: new Date().toISOString(),
      fortimanagerUrl: fmgUrl
    };

    // Count models
    for (const firewall of firewalls) {
      const model = firewall.model || 'Unknown';
      summary.models[model] = (summary.models[model] || 0) + 1;
    }

    console.log('─'.repeat(70));
    console.log('📊 Discovery Summary');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`Total Firewalls: ${summary.totalFirewalls}`);
    console.log(`  Online: ${summary.onlineFirewalls}`);
    console.log(`  Offline: ${summary.offlineFirewalls}`);
    console.log('');
    console.log('Models:');
    for (const [model, count] of Object.entries(summary.models)) {
      console.log(`  ${model}: ${count}`);
    }
    console.log('');

    // Display firewall details
    console.log('─'.repeat(70));
    console.log('Firewall Details');
    console.log('─'.repeat(70));
    console.log('');

    for (const firewall of firewalls) {
      console.log(`${firewall.name}`);
      console.log(`  Model: ${firewall.model}`);
      console.log(`  Serial Number: ${firewall.serialNumber}`);
      console.log(`  Status: ${firewall.status} (${firewall.connectionStatus})`);
      console.log(`  Management IP: ${firewall.managementIp || '(none)'}`);
      console.log(`  Public IPs: ${firewall.publicIpScope.length > 0 ? firewall.publicIpScope.join(', ') : '(none)'}`);
      console.log(`  Internal IPs: ${firewall.internalIpScope.length > 0 ? firewall.internalIpScope.join(', ') : '(none)'}`);
      console.log(`  Firmware: ${firewall.firmwareVersion || '(unknown)'}`);
      if (firewall.location) {
        console.log(`  Location: ${firewall.location}`);
      }
      console.log('');
    }

    // Prepare output directory
    const outputDir = path.join(process.cwd(), 'backup', 'fortimanager-discovery');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileBaseName = outputName || `${customerName.toLowerCase().replace(/\s+/g, '-')}-firewalls`;

    // Save JSON
    const jsonPath = path.join(outputDir, `${fileBaseName}.json`);
    const jsonOutput = {
      customer: customerName,
      fortimanager_url: fmgUrl,
      discovered_at: summary.discoveredAt,
      summary: {
        total_firewalls: summary.totalFirewalls,
        online_firewalls: summary.onlineFirewalls,
        offline_firewalls: summary.offlineFirewalls,
        models: summary.models
      },
      firewalls: firewalls.map(fw => ({
        name: fw.name,
        serial_number: fw.serialNumber,
        model: fw.model,
        management_ip: fw.managementIp,
        public_ip_scope: fw.publicIpScope,
        internal_ip_scope: fw.internalIpScope,
        status: fw.status,
        connection_status: fw.connectionStatus,
        config_status: fw.configStatus,
        firmware_version: fw.firmwareVersion,
        os_type: fw.osType,
        location: fw.location,
        latitude: fw.latitude,
        longitude: fw.longitude,
        ha_mode: fw.haMode,
        ha_members: fw.haMembers,
        management_mode: fw.managementMode,
        policy_package: fw.policyPackage,
        template_group: fw.templateGroup,
        discovered_at: fw.discoveredAt
      }))
    };

    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`💾 JSON: ${jsonPath}`);

    // Save CSV
    const csvPath = path.join(outputDir, `${fileBaseName}.csv`);
    const csvHeaders = [
      'Name',
      'Serial Number',
      'Model',
      'Management IP',
      'Public IPs',
      'Internal IPs',
      'Status',
      'Connection Status',
      'Config Status',
      'Firmware Version',
      'Location',
      'HA Mode',
      'Policy Package'
    ];

    const csvRows = firewalls.map(fw => [
      fw.name,
      fw.serialNumber,
      fw.model,
      fw.managementIp || '',
      fw.publicIpScope.join('; '),
      fw.internalIpScope.join('; '),
      fw.status,
      fw.connectionStatus,
      fw.configStatus,
      fw.firmwareVersion || '',
      fw.location || '',
      fw.haMode || '',
      fw.policyPackage || ''
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row =>
        row.map(cell => {
          const str = String(cell);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      )
    ].join('\n');

    fs.writeFileSync(csvPath, csvContent);
    console.log(`💾 CSV:  ${csvPath}`);
    console.log('');

    // Disconnect
    await repository.disconnect();

    console.log('─'.repeat(70));
    console.log('💡 Next Steps');
    console.log('─'.repeat(70));
    console.log('');
    console.log('1. Review discovered firewalls:');
    console.log(`   - Open ${fileBaseName}.csv in Excel/Numbers`);
    console.log('   - Verify all expected firewalls are present');
    console.log('   - Check IP scopes are correct');
    console.log('');
    console.log('2. Create ServiceNow CIs:');
    console.log(`   npx tsx scripts/create-fortimanager-firewall-cis.ts backup/fortimanager-discovery/${fileBaseName}.json`);
    console.log('');
    console.log('3. Link firewalls to services:');
    console.log(`   npx tsx scripts/link-fortimanager-firewalls-to-services.ts ${customerName}`);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error.message || error);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
let customerName: string | undefined;
let outputName: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--customer' && args[i + 1]) {
    customerName = args[i + 1];
  } else if (args[i] === '--output' && args[i + 1]) {
    outputName = args[i + 1];
  }
}

if (!customerName) {
  console.error('❌ Usage: npx tsx scripts/discover-fortimanager-firewalls.ts --customer <customer-name>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare');
  console.error('  npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare --output custom-name');
  console.error('');
  process.exit(1);
}

discoverFortiManagerFirewalls(customerName, outputName)
  .catch(console.error)
  .finally(() => process.exit(0));
