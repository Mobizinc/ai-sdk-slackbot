/**
 * Discover Allcare VPN Tunnels from FortiManager
 *
 * Queries Azure hub firewall (ACM-AZ-FW01) for all site-to-site IPsec VPN tunnels
 * Extracts tunnel endpoints, protected networks, and encryption details
 *
 * PREREQUISITES:
 * - FortiManager credentials in .env.local
 * - Firewall CIs exist in ServiceNow
 *
 * USAGE:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-allcare-vpn-tunnels.ts
 *
 * OUTPUTS:
 * - backup/vpn-topology/allcare-vpn-tunnels.json
 * - backup/vpn-topology/allcare-vpn-tunnels.csv
 */

import * as dotenv from 'dotenv';
import { FortiManagerHttpClient } from '../lib/infrastructure/fortimanager';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface VPNTunnel {
  tunnel_name: string;
  phase1_name: string;
  remote_gateway_ip: string;
  remote_firewall_name?: string;
  remote_firewall_sys_id?: string;
  local_networks: string[];
  remote_networks: string[];
  encryption: string;
  ike_version: number;
  comments: string;
}

async function discoverAllcareVPNTunnels() {
  console.log('🔐 Discover Allcare VPN Tunnels from FortiManager');
  console.log('='.repeat(70));
  console.log('');

  const hubFirewall = 'ACM-AZ-FW01';
  console.log(`Hub Firewall: ${hubFirewall} (Azure)`);
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

  try {
    // Step 1: Query Phase1 interfaces (tunnel endpoints)
    console.log('Step 1: Querying VPN Phase1 Interfaces...');
    console.log('─'.repeat(70));

    const phase1Response = await client.get(
      `/pm/config/device/${hubFirewall}/vdom/root/vpn/ipsec/phase1-interface`
    );

    const phase1Data = phase1Response.result?.[0]?.data;
    if (!phase1Data || !Array.isArray(phase1Data)) {
      console.error('❌ No Phase1 data returned');
      process.exit(1);
    }

    console.log(`Found ${phase1Data.length} Phase1 tunnel(s)`);
    console.log('');

    // Step 2: Query Phase2 selectors (protected networks)
    console.log('Step 2: Querying VPN Phase2 Selectors...');
    console.log('─'.repeat(70));

    const phase2Response = await client.get(
      `/pm/config/device/${hubFirewall}/vdom/root/vpn/ipsec/phase2-interface`
    );

    const phase2Data = phase2Response.result?.[0]?.data;
    const phase2Array = Array.isArray(phase2Data) ? phase2Data : [];

    console.log(`Found ${phase2Array.length} Phase2 selector(s)`);
    console.log('');

    // Step 3: Match remote gateways to firewall CIs in ServiceNow
    console.log('Step 3: Matching Remote Gateways to Firewall CIs...');
    console.log('─'.repeat(70));

    const instanceUrl = process.env.SERVICENOW_URL;
    const username = process.env.SERVICENOW_USERNAME;
    const password = process.env.SERVICENOW_PASSWORD;

    if (!instanceUrl || !username || !password) {
      console.error('❌ ServiceNow credentials not configured');
      process.exit(1);
    }

    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    // Get all Allcare firewalls for IP matching
    const fwQuery = `company.nameLIKEAllcare^ORcompany.nameLIKEFPA^ORcompany.nameLIKEHospitality^ORcompany.nameLIKECal Select`;
    const fwUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(fwQuery)}&sysparm_fields=name,sys_id,ip_address&sysparm_limit=100`;

    const fwResp = await fetch(fwUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    const fwData = await fwResp.json();
    const firewalls = fwData.result || [];

    // Create IP → Firewall map
    const ipMap = new Map();
    for (const fw of firewalls) {
      if (fw.ip_address) {
        ipMap.set(fw.ip_address, {
          name: fw.name,
          sys_id: fw.sys_id
        });
      }
    }

    console.log(`Firewall CIs loaded: ${firewalls.length}`);
    console.log(`IP mappings: ${ipMap.size}`);
    console.log('');

    // Step 4: Build tunnel data
    console.log('Step 4: Building Tunnel Data...');
    console.log('─'.repeat(70));
    console.log('');

    const tunnels: VPNTunnel[] = [];
    let matched = 0, unmatched = 0;

    for (const phase1 of phase1Data) {
      const tunnelName = phase1.name;
      const remoteGw = phase1['remote-gw'];
      const comments = phase1.comments || '';
      const encryption = Array.isArray(phase1.proposal) ? phase1.proposal.join(', ') : phase1.proposal;
      const ikeVersion = phase1['ike-version'] || 2;

      // Find matching firewall by IP
      const remoteFw = ipMap.get(remoteGw);

      // Find phase2 selectors for this tunnel
      const phase2Selectors = phase2Array.filter((p2: any) => p2.phase1name === tunnelName);
      const localNetworks: string[] = [];
      const remoteNetworks: string[] = [];

      for (const p2 of phase2Selectors) {
        if (p2['src-subnet']) localNetworks.push(p2['src-subnet']);
        if (p2['dst-subnet']) remoteNetworks.push(p2['dst-subnet']);
      }

      const tunnel: VPNTunnel = {
        tunnel_name: tunnelName,
        phase1_name: tunnelName,
        remote_gateway_ip: remoteGw,
        remote_firewall_name: remoteFw?.name,
        remote_firewall_sys_id: remoteFw?.sys_id,
        local_networks: localNetworks,
        remote_networks: remoteNetworks,
        encryption: encryption,
        ike_version: ikeVersion,
        comments: comments
      };

      tunnels.push(tunnel);

      if (remoteFw) {
        console.log(`✅ ${tunnelName}`);
        console.log(`   Remote: ${remoteFw.name} (${remoteGw})`);
        matched++;
      } else {
        console.log(`⚠️  ${tunnelName}`);
        console.log(`   Remote: ${remoteGw} (NOT FOUND in ServiceNow)`);
        unmatched++;
      }
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('📊 Discovery Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Total VPN Tunnels: ${tunnels.length}`);
    console.log(`  Matched to Firewall CIs: ${matched}`);
    console.log(`  Unmatched (remote FW not found): ${unmatched}`);
    console.log('');

    // Save outputs
    const outputDir = path.join(process.cwd(), 'backup', 'vpn-topology');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save JSON
    const jsonPath = path.join(outputDir, 'allcare-vpn-tunnels.json');
    const jsonOutput = {
      discovered_at: new Date().toISOString(),
      hub_firewall: hubFirewall,
      tunnel_count: tunnels.length,
      matched_count: matched,
      unmatched_count: unmatched,
      tunnels: tunnels
    };

    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`💾 JSON: ${jsonPath}`);

    // Save CSV
    const csvPath = path.join(outputDir, 'allcare-vpn-tunnels.csv');
    const csvHeaders = [
      'Tunnel Name',
      'Remote Gateway IP',
      'Remote Firewall',
      'Remote Firewall Sys_ID',
      'Local Networks',
      'Remote Networks',
      'Encryption',
      'IKE Version',
      'Comments'
    ];

    const csvRows = tunnels.map(t => [
      t.tunnel_name,
      t.remote_gateway_ip,
      t.remote_firewall_name || 'NOT FOUND',
      t.remote_firewall_sys_id || '',
      t.local_networks.join('; '),
      t.remote_networks.join('; '),
      t.encryption,
      t.ike_version.toString(),
      t.comments
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
    console.log('1. Review discovered tunnels:');
    console.log('   open backup/vpn-topology/allcare-vpn-tunnels.csv');
    console.log('');
    console.log('2. Create CI relationships:');
    console.log('   npx tsx scripts/create-allcare-vpn-tunnel-relationships.ts');
    console.log('');

    await client.disconnect();

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

discoverAllcareVPNTunnels()
  .catch(console.error)
  .finally(() => process.exit(0));
