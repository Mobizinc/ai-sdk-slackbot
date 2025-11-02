/**
 * Create Allcare VPN Tunnel CI Relationships
 *
 * Creates CI relationships for site-to-site VPN tunnels
 * Uses standard "Connects to::Connected by" relationship type
 * Stores tunnel metadata in comments field
 *
 * PREREQUISITES:
 * - VPN discovery complete (allcare-vpn-tunnels.json)
 * - Hub and spoke firewalls exist in ServiceNow
 *
 * USAGE:
 *   npx tsx scripts/create-allcare-vpn-tunnel-relationships.ts
 *   npx tsx scripts/create-allcare-vpn-tunnel-relationships.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function createAllcareVPNTunnelRelationships(dryRun: boolean = false) {
  console.log('🔐 Create Allcare VPN Tunnel CI Relationships');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No relationships will be created');
    console.log('');
  }

  // Load VPN discovery
  const vpnPath = path.join(process.cwd(), 'backup', 'vpn-topology', 'allcare-vpn-tunnels.json');
  if (!fs.existsSync(vpnPath)) {
    console.error(`❌ VPN discovery not found: ${vpnPath}`);
    console.error('Run first: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-allcare-vpn-tunnels.ts');
    process.exit(1);
  }

  const vpnData = JSON.parse(fs.readFileSync(vpnPath, 'utf-8'));
  const tunnels = vpnData.tunnels || [];
  const hubFirewall = vpnData.hub_firewall;

  console.log(`Hub Firewall: ${hubFirewall}`);
  console.log(`Total Tunnels: ${tunnels.length}`);
  console.log(`Matched Tunnels: ${vpnData.matched_count}`);
  console.log('');

  // Filter to matched tunnels only (have remote firewall sys_id)
  const matchedTunnels = tunnels.filter((t: any) => t.remote_firewall_sys_id);
  console.log(`Creating relationships for: ${matchedTunnels.length} tunnels`);
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get hub firewall sys_id - MUST filter by serial to get correct entry
  const hubQuery = `name=${hubFirewall}^serial_number=FGVM4VTM23003310`;
  const hubUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(hubQuery)}&sysparm_fields=sys_id,name&sysparm_limit=1`;

  const hubResp = await fetch(hubUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const hubData = await hubResp.json();
  const hubSysId = hubData.result?.[0]?.sys_id;

  if (!hubSysId) {
    console.error(`❌ Hub firewall not found: ${hubFirewall}`);
    process.exit(1);
  }

  console.log(`Hub Firewall Sys_ID: ${hubSysId}`);
  console.log('');

  let created = 0, existing = 0, errors = 0;

  // Standard "Connects to::Connected by" relationship type
  const CONNECTS_TO_TYPE = '5599a965c0a8010e00da3b58b113d70e';

  for (const tunnel of matchedTunnels) {
    console.log(`${tunnel.tunnel_name}`);
    console.log(`  Hub: ${hubFirewall}`);
    console.log(`  Spoke: ${tunnel.remote_firewall_name}`);

    // Check if relationship exists
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${hubSysId}^child=${tunnel.remote_firewall_sys_id}^type=${CONNECTS_TO_TYPE}&sysparm_limit=1`;
    const checkResp = await fetch(checkUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  🔗 Already exists`);
        existing++;
        continue;
      }
    }

    if (dryRun) {
      console.log(`  🧪 Would create VPN relationship`);
      created++;
      continue;
    }

    // Create tunnel metadata
    const tunnelMetadata = {
      vpn_tunnel_name: tunnel.tunnel_name,
      tunnel_type: 'IPsec Site-to-Site',
      remote_gateway_ip: tunnel.remote_gateway_ip,
      local_networks: tunnel.local_networks,
      remote_networks: tunnel.remote_networks,
      encryption: tunnel.encryption,
      ike_version: tunnel.ike_version,
      description: tunnel.comments,
      discovered_at: vpnData.discovered_at
    };

    // Create CI relationship
    const relPayload = {
      parent: hubSysId,
      child: tunnel.remote_firewall_sys_id,
      type: CONNECTS_TO_TYPE,  // Connects to::Connected by
      comments: JSON.stringify(tunnelMetadata, null, 2)
    };

    const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
    const relResp = await fetch(relUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(relPayload)
    });

    if (relResp.ok) {
      console.log(`  ✅ Created VPN relationship`);
      console.log(`     Local: ${tunnel.local_networks.join(', ') || 'N/A'}`);
      console.log(`     Remote: ${tunnel.remote_networks.join(', ') || 'N/A'}`);
      created++;
    } else {
      const errorText = await relResp.text();
      console.log(`  ❌ Failed: ${errorText.substring(0, 100)}`);
      errors++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Creation Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total Matched Tunnels: ${matchedTunnels.length}`);
  console.log(`  Created: ${created}`);
  console.log(`  Already Existing: ${existing}`);
  console.log(`  Errors: ${errors}`);
  console.log('');
  console.log(`Unmatched Tunnels (skipped): ${tunnels.length - matchedTunnels.length}`);
  console.log('  (Secondary WAN IPs or external partners not in CMDB)');
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To create relationships:');
    console.log('  npx tsx scripts/create-allcare-vpn-tunnel-relationships.ts');
  } else if (created > 0) {
    console.log('✅ VPN tunnel relationships created!');
    console.log('');
    console.log('View in ServiceNow:');
    console.log('  1. Open ACM-AZ-FW01 firewall CI');
    console.log('  2. Go to "CI Relationships" tab');
    console.log('  3. See all VPN connections to branch offices');
    console.log('  4. Click relationship → View tunnel details in comments');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

createAllcareVPNTunnelRelationships(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
