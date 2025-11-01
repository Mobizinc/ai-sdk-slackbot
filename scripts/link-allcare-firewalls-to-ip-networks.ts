/**
 * Link Allcare Firewalls to IP Networks
 *
 * Creates CI relationships between firewalls and their LAN/WAN networks
 * Uses interface discovery data to map connections
 *
 * PREREQUISITES:
 * - Interface discovery complete (allcare-network-interfaces.json)
 * - IP Network CIs exist in ServiceNow
 * - Firewall CIs exist in ServiceNow
 *
 * USAGE:
 *   npx tsx scripts/link-allcare-firewalls-to-ip-networks.ts
 *   npx tsx scripts/link-allcare-firewalls-to-ip-networks.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function linkAllcareFirewallsToIPNetworks(dryRun: boolean = false) {
  console.log('🔗 Link Allcare Firewalls to IP Networks');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No relationships will be created');
    console.log('');
  }

  // Load interface discovery
  const interfacePath = path.join(process.cwd(), 'backup', 'network-import', 'allcare-network-interfaces.json');
  const interfaceData = JSON.parse(fs.readFileSync(interfacePath, 'utf-8'));
  const allInterfaces = interfaceData.interfaces || [];

  // Filter to LAN /24 and WAN /29-30 only (active)
  const activeInterfaces = allInterfaces
    .filter((i: any) => i.status === '1')
    .filter((i: any) =>
      (i.interface_type === 'LAN' && i.network_cidr.endsWith('/24') && i.interface_name.match(/AllCare Data|internal|lan/i)) ||
      (i.interface_type === 'WAN' && i.network_cidr.match(/\/29$|\/30$/))
    );

  // Group by firewall to avoid duplicate lookups
  const byFirewall = new Map<string, any[]>();
  for (const iface of activeInterfaces) {
    if (!byFirewall.has(iface.firewall_name)) {
      byFirewall.set(iface.firewall_name, []);
    }
    byFirewall.get(iface.firewall_name)!.push(iface);
  }

  // Filter to location-specific networks (not shared VLANs)
  const networkUsage = new Map<string, Set<string>>();
  for (const iface of activeInterfaces) {
    if (!networkUsage.has(iface.network_cidr)) {
      networkUsage.set(iface.network_cidr, new Set());
    }
    networkUsage.get(iface.network_cidr)!.add(iface.firewall_name);
  }

  const filteredInterfaces = activeInterfaces.filter((i: any) => {
    const usage = networkUsage.get(i.network_cidr);
    // Include if: WAN (always) OR LAN used by <= 2 firewalls
    return i.interface_type === 'WAN' || (usage && usage.size <= 2);
  });

  console.log(`Interfaces to Link: ${filteredInterfaces.length}`);
  console.log(`Firewalls Involved: ${byFirewall.size}`);
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get firewall CIs to lookup company AND location (critical for proper network matching)
  console.log('Loading firewall CIs for company/location filtering...');
  const firewallQuery = `nameLIKEACM-^serial_number!=`;
  const firewallUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(firewallQuery)}&sysparm_fields=name,sys_id,company,location&sysparm_limit=100`;

  const firewallResp = await fetch(firewallUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const firewallData = await firewallResp.json();
  const firewalls = firewallData.result || [];

  // Create firewall lookup map
  const firewallMap = new Map();
  for (const fw of firewalls) {
    const companySysId = fw.company?.value || fw.company;
    const locationSysId = fw.location?.value || fw.location;
    firewallMap.set(fw.name, {
      sys_id: fw.sys_id,
      company_sys_id: companySysId,
      location_sys_id: locationSysId  // CRITICAL - for location matching
    });
  }

  console.log(`Firewall CIs loaded: ${firewallMap.size}`);
  console.log('');

  let linked = 0, existing = 0, errors = 0, networkNotFound = 0;

  // Process each interface
  for (const iface of filteredInterfaces) {
    // Look up firewall CI
    const fwQuery = `name=${encodeURIComponent(iface.firewall_name)}^serial_number!=`;
    const fwUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${fwQuery}&sysparm_limit=1&sysparm_fields=sys_id,name`;
    const fwResp = await fetch(fwUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let firewallSysId: string | null = null;
    if (fwResp.ok) {
      const fwData = await fwResp.json();
      if (fwData.result?.length > 0) {
        firewallSysId = fwData.result[0].sys_id;
      }
    }

    if (!firewallSysId) {
      console.log(`⚠️  Firewall not found: ${iface.firewall_name}`);
      errors++;
      continue;
    }

    // Look up firewall metadata for company AND location filtering
    const fwData = firewallMap.get(iface.firewall_name);
    if (!fwData || !fwData.company_sys_id || !fwData.location_sys_id) {
      // Skip firewalls without location (HQ, Azure, temp devices)
      networkNotFound++;
      continue;
    }

    // Look up network CI - MUST match by location (Altus pattern)
    // Same CIDR at different locations = different networks
    const netQuery = `network_address=${encodeURIComponent(iface.network_address)}^netmask=${encodeURIComponent(iface.netmask)}^location=${fwData.location_sys_id}`;
    const netUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${netQuery}&sysparm_limit=1&sysparm_fields=sys_id,name,company,location&sysparm_display_value=true`;
    const netResp = await fetch(netUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let networkSysId: string | null = null;
    let networkName: string | null = null;
    if (netResp.ok) {
      const netData = await netResp.json();
      if (netData.result?.length > 0) {
        networkSysId = netData.result[0].sys_id;
        networkName = netData.result[0].name;
      }
    }

    if (!networkSysId) {
      // Network doesn't exist - would be created in previous step
      networkNotFound++;
      continue;
    }

    // Check if relationship exists
    const relCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${firewallSysId}^child=${networkSysId}^ORparent=${networkSysId}^child=${firewallSysId}&sysparm_limit=1`;
    const relCheckResp = await fetch(relCheckUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (relCheckResp.ok) {
      const relCheckData = await relCheckResp.json();
      if (relCheckData.result?.length > 0) {
        existing++;
        continue;
      }
    }

    console.log(`${iface.firewall_name} → ${networkName}`);
    console.log(`  ${iface.interface_name} (${iface.network_cidr})`);

    if (dryRun) {
      console.log(`  🧪 Would link`);
      linked++;
      continue;
    }

    // Create relationship: Firewall connects to Network
    const relPayload = {
      parent: firewallSysId,
      child: networkSysId,
      type: 'Connects to::Connected by'
    };

    const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
    const relResp = await fetch(relUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(relPayload)
    });

    if (relResp.ok) {
      console.log(`  ✅ Linked`);
      linked++;
    } else {
      console.log(`  ❌ Failed`);
      errors++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('📊 Linking Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total Interfaces: ${filteredInterfaces.length}`);
  console.log(`  Linked: ${linked}`);
  console.log(`  Already Linked: ${existing}`);
  console.log(`  Network Not Found: ${networkNotFound}`);
  console.log(`  Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To create relationships:');
    console.log('  npx tsx scripts/link-allcare-firewalls-to-ip-networks.ts');
  } else if (linked > 0) {
    console.log('✅ Firewall-Network relationships created!');
    console.log('');
    console.log('Next: Validate topology');
    console.log('  npx tsx scripts/validate-allcare-network-topology.ts');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

linkAllcareFirewallsToIPNetworks(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
