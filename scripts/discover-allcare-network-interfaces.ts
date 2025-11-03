/**
 * Discover Allcare Network Interfaces from FortiManager
 *
 * Queries all Allcare FortiGate firewalls for their interface configurations
 * Extracts IP addresses, netmasks, and calculates network CIDRs
 *
 * PREREQUISITES:
 * - FortiManager credentials in .env.local
 * - FortiManager discovery complete (allcare-firewalls.json)
 *
 * USAGE:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-allcare-network-interfaces.ts
 *
 * OUTPUTS:
 * - backup/network-import/allcare-network-interfaces.json
 * - backup/network-import/allcare-network-cidrs.csv
 */

import * as dotenv from 'dotenv';
import { FortiManagerHttpClient } from '../lib/infrastructure/fortimanager';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface NetworkInterface {
  firewall_name: string;
  interface_name: string;
  ip_address: string;
  netmask: string;
  network_cidr: string;
  network_address: string;
  cidr_bits: number;
  interface_type: 'WAN' | 'LAN' | 'DMZ' | 'VLAN' | 'Unknown';
  status: string;
  mode: number;
  description: string;
  alias: string;
}

interface NetworkSummary {
  network_cidr: string;
  firewalls: string[];
  interface_type: string;
  location?: string;
  company?: string;
}

function calculateNetworkAddress(ip: string, netmask: string): { network: string; cidr: number } {
  const ipParts = ip.split('.').map(Number);
  const maskParts = netmask.split('.').map(Number);

  // Calculate network address
  const networkParts = ipParts.map((octet, i) => octet & maskParts[i]);
  const network = networkParts.join('.');

  // Calculate CIDR bits
  const cidrBits = maskParts
    .map(octet => octet.toString(2).split('1').length - 1)
    .reduce((a, b) => a + b, 0);

  return { network, cidr: cidrBits };
}

function classifyInterface(name: string, ip: string): 'WAN' | 'LAN' | 'DMZ' | 'VLAN' | 'Unknown' {
  const nameLower = name.toLowerCase();

  if (nameLower.match(/wan|port1|external/)) return 'WAN';
  if (nameLower.match(/lan|port[2-9]|internal/)) return 'LAN';
  if (nameLower.match(/dmz/)) return 'DMZ';
  if (nameLower.match(/vlan/)) return 'VLAN';

  // Classify by IP type
  if (isPrivateIP(ip)) return 'LAN';
  if (!ip.startsWith('0.0.0.0')) return 'WAN';

  return 'Unknown';
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;

  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

async function discoverAllcareNetworkInterfaces() {
  console.log('🌐 Discover Allcare Network Interfaces from FortiManager');
  console.log('='.repeat(70));
  console.log('');

  // Load FortiManager discovery
  const discoveryPath = path.join(process.cwd(), 'backup', 'fortimanager-discovery', 'allcare-firewalls.json');
  if (!fs.existsSync(discoveryPath)) {
    console.error(`❌ FortiManager discovery not found: ${discoveryPath}`);
    console.error('Run first: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare');
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'));
  const firewalls = discovery.firewalls || [];

  console.log(`Firewalls to Query: ${firewalls.length}`);
  console.log('');

  // Initialize FortiManager client
  const fmgUrl = process.env.FORTIMANAGER_URL;
  const fmgApiKey = process.env.FORTIMANAGER_API_KEY;

  if (!fmgUrl || !fmgApiKey) {
    console.error('❌ FortiManager credentials not configured');
    process.exit(1);
  }

  const client = new FortiManagerHttpClient({
    url: fmgUrl,
    apiKey: fmgApiKey,
    defaultTimeout: 30000,
    maxRetries: 2
  });

  const allInterfaces: NetworkInterface[] = [];
  let successCount = 0, errorCount = 0;

  // Query each firewall for interface configuration
  for (const firewall of firewalls) {
    console.log(`${firewall.name}...`);

    try {
      const response = await client.get(
        `/cli/global/system/interface`,
        undefined,
        { skipRetry: false }
      );

      // Note: This endpoint doesn't support target parameter
      // We need to use a different approach - query via device-specific URL
      const deviceResponse = await client.get(
        `/pm/config/device/${firewall.name}/global/system/interface`,
        undefined
      );

      const interfaceData = deviceResponse.result?.[0]?.data;
      if (!interfaceData || !Array.isArray(interfaceData)) {
        console.log(`  ⚠️  No interface data`);
        errorCount++;
        continue;
      }

      let interfaceCount = 0;

      for (const iface of interfaceData) {
        const ipArray = iface.ip;
        if (!ipArray || !Array.isArray(ipArray) || ipArray.length < 2) continue;

        const [ipAddress, netmask] = ipArray;

        // Skip unconfigured interfaces
        if (ipAddress === '0.0.0.0' || !ipAddress) continue;

        // Calculate network CIDR
        const { network, cidr } = calculateNetworkAddress(ipAddress, netmask);
        const networkCIDR = `${network}/${cidr}`;

        // Classify interface
        const interfaceType = classifyInterface(iface.name, ipAddress);

        allInterfaces.push({
          firewall_name: firewall.name,
          interface_name: iface.name,
          ip_address: ipAddress,
          netmask: netmask,
          network_cidr: networkCIDR,
          network_address: network,
          cidr_bits: cidr,
          interface_type: interfaceType,
          status: iface.status?.toString() || 'unknown',
          mode: iface.mode || 0,
          description: iface.description || '',
          alias: iface.alias || ''
        });

        interfaceCount++;
      }

      console.log(`  ✅ ${interfaceCount} interface(s)`);
      successCount++;

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Discovery Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Firewalls Queried: ${firewalls.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`Total Interfaces: ${allInterfaces.length}`);
  console.log('');

  // Group by network CIDR
  const networkMap = new Map<string, NetworkSummary>();
  for (const iface of allInterfaces) {
    if (!networkMap.has(iface.network_cidr)) {
      networkMap.set(iface.network_cidr, {
        network_cidr: iface.network_cidr,
        firewalls: [],
        interface_type: iface.interface_type
      });
    }
    const summary = networkMap.get(iface.network_cidr)!;
    if (!summary.firewalls.includes(iface.firewall_name)) {
      summary.firewalls.push(iface.firewall_name);
    }
  }

  console.log(`Unique Networks: ${networkMap.size}`);
  console.log('');

  // By type
  const byType = new Map<string, number>();
  for (const iface of allInterfaces) {
    byType.set(iface.interface_type, (byType.get(iface.interface_type) || 0) + 1);
  }

  console.log('Interfaces by Type:');
  for (const [type, count] of byType) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');

  // Save outputs
  const outputDir = path.join(process.cwd(), 'backup', 'network-import');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save JSON
  const jsonPath = path.join(outputDir, 'allcare-network-interfaces.json');
  const jsonOutput = {
    discovered_at: new Date().toISOString(),
    firewall_count: firewalls.length,
    interface_count: allInterfaces.length,
    network_count: networkMap.size,
    interfaces: allInterfaces,
    networks: Array.from(networkMap.values())
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`💾 JSON: ${jsonPath}`);

  // Save CSV
  const csvPath = path.join(outputDir, 'allcare-network-cidrs.csv');
  const csvHeaders = [
    'Firewall',
    'Interface',
    'IP Address',
    'Netmask',
    'Network CIDR',
    'Type',
    'Description',
    'Alias'
  ];

  const csvRows = allInterfaces.map(iface => [
    iface.firewall_name,
    iface.interface_name,
    iface.ip_address,
    iface.netmask,
    iface.network_cidr,
    iface.interface_type,
    iface.description,
    iface.alias
  ]);

  const csvContent = [
    csvHeaders.join(','),
    ...csvRows.map(row =>
      row.map(cell => {
        const str = String(cell);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    )
  ].join('\n');

  fs.writeFileSync(csvPath, csvContent);
  console.log(`💾 CSV:  ${csvPath}`);
  console.log('');

  console.log('─'.repeat(70));
  console.log('💡 Next Steps');
  console.log('─'.repeat(70));
  console.log('');
  console.log('1. Review discovered networks:');
  console.log('   open backup/network-import/allcare-network-cidrs.csv');
  console.log('');
  console.log('2. Create IP Network CIs:');
  console.log('   npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts');
  console.log('');

  await client.disconnect();
}

discoverAllcareNetworkInterfaces()
  .catch(console.error)
  .finally(() => process.exit(0));
