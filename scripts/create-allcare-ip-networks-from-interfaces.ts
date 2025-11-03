/**
 * Create Allcare IP Network CIs from Interface Discovery
 *
 * Creates IP Network CIs for:
 * 1. Branch office LAN networks (192.168.x.0/24 - Class C)
 * 2. WAN public IP networks (/29 and /30 - point-to-point)
 *
 * Filters out shared infrastructure VLANs (NAC, FortiLink, guest, etc.)
 *
 * PREREQUISITES:
 * - Interface discovery complete (allcare-network-interfaces.json)
 * - ServiceNow credentials in .env.local
 *
 * USAGE:
 *   npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts
 *   npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface NetworkToCreate {
  network_cidr: string;
  network_address: string;
  netmask: string;
  cidr_bits: number;
  type: 'LAN' | 'WAN';
  firewall_name: string;
  firewall_sys_id?: string;
  interface_name: string;
  interface_alias: string;
  company_name?: string;
  company_sys_id?: string;
  location_name?: string;
  location_sys_id?: string;
}

async function createAllcareIPNetworksFromInterfaces(dryRun: boolean = false) {
  console.log('🌐 Create Allcare IP Network CIs');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No changes will be made');
    console.log('');
  }

  // Load interface discovery
  const interfacePath = path.join(process.cwd(), 'backup', 'network-import', 'allcare-network-interfaces.json');
  if (!fs.existsSync(interfacePath)) {
    console.error(`❌ Interface discovery not found: ${interfacePath}`);
    console.error('Run first: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-allcare-network-interfaces.ts');
    process.exit(1);
  }

  const interfaceData = JSON.parse(fs.readFileSync(interfacePath, 'utf-8'));
  const allInterfaces = interfaceData.interfaces || [];

  console.log(`Total Interfaces Discovered: ${allInterfaces.length}`);

  // Filter to active interfaces only
  const activeInterfaces = allInterfaces.filter((i: any) => i.status === '1');
  console.log(`Active Interfaces (status=1): ${activeInterfaces.length}`);
  console.log('');

  // Filter Type 1: Branch Office LAN /24 networks
  const lanInterfaces = activeInterfaces
    .filter((i: any) => i.interface_type === 'LAN')
    .filter((i: any) => i.network_cidr.endsWith('/24'))
    .filter((i: any) => i.interface_name.match(/AllCare Data|internal|lan|port[2-9]/i));

  // Group by network CIDR
  const lanByNetwork = new Map<string, any[]>();
  for (const iface of lanInterfaces) {
    if (!lanByNetwork.has(iface.network_cidr)) {
      lanByNetwork.set(iface.network_cidr, []);
    }
    lanByNetwork.get(iface.network_cidr)!.push(iface);
  }

  // Filter to location-specific only (used by <= 2 firewalls)
  const lanNetworksToCreate = Array.from(lanByNetwork.entries())
    .filter(([cidr, ifaces]) => {
      const uniqueFirewalls = new Set(ifaces.map(i => i.firewall_name));
      return uniqueFirewalls.size <= 2;
    })
    .map(([cidr, ifaces]) => ifaces[0]); // Take first interface as representative

  console.log(`LAN /24 Networks (location-specific): ${lanNetworksToCreate.length}`);

  // Filter Type 2: WAN /29-30 public IP networks
  const wanInterfaces = activeInterfaces
    .filter((i: any) => i.interface_type === 'WAN')
    .filter((i: any) => i.network_cidr.match(/\/29$|\/30$/));

  const wanByNetwork = new Map<string, any[]>();
  for (const iface of wanInterfaces) {
    if (!wanByNetwork.has(iface.network_cidr)) {
      wanByNetwork.set(iface.network_cidr, []);
    }
    wanByNetwork.get(iface.network_cidr)!.push(iface);
  }

  const wanNetworksToCreate = Array.from(wanByNetwork.entries())
    .map(([cidr, ifaces]) => ifaces[0]); // Take first as representative

  console.log(`WAN /29-30 Networks: ${wanNetworksToCreate.length}`);
  console.log('');
  console.log(`Total Networks to Create: ${lanNetworksToCreate.length + wanNetworksToCreate.length}`);
  console.log('');

  // ServiceNow credentials
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get firewall CIs to lookup company and location
  console.log('Looking up firewall CIs for company/location mapping...');
  const firewallQuery = `nameLIKEACM-^serial_number!=`;
  // Don't use sysparm_display_value - we need raw sys_ids
  const firewallUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(firewallQuery)}&sysparm_fields=name,sys_id,company,location&sysparm_limit=100`;

  const firewallResp = await fetch(firewallUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const firewallData = await firewallResp.json();
  const firewalls = firewallData.result || [];

  // Create firewall lookup map
  const firewallMap = new Map();
  for (const fw of firewalls) {
    firewallMap.set(fw.name, {
      sys_id: fw.sys_id,
      company_sys_id: fw.company?.value || fw.company,  // Extract sys_id from reference
      location_sys_id: fw.location?.value || fw.location
    });
  }

  // Also get display names separately for nice output
  const firewallDisplayUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(firewallQuery)}&sysparm_fields=name,company,location&sysparm_display_value=true&sysparm_limit=100`;
  const firewallDisplayResp = await fetch(firewallDisplayUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });
  const firewallDisplayData = await firewallDisplayResp.json();
  const firewallsDisplay = firewallDisplayData.result || [];

  // Merge display names
  for (const fw of firewallsDisplay) {
    const existing = firewallMap.get(fw.name);
    if (existing) {
      existing.company_name = fw.company?.display_value || fw.company;
      existing.location_name = fw.location?.display_value || fw.location;
    }
  }

  console.log(`Firewall CIs loaded: ${firewallMap.size}`);
  console.log('');

  let created = 0, existing = 0, errors = 0;

  // Create LAN networks
  console.log('─'.repeat(70));
  console.log('Creating LAN /24 Networks');
  console.log('─'.repeat(70));
  console.log('');

  for (const iface of lanNetworksToCreate) {
    const fwData = firewallMap.get(iface.firewall_name);
    if (!fwData) {
      console.log(`⚠️  ${iface.network_cidr} - Firewall ${iface.firewall_name} not found in ServiceNow`);
      continue;
    }

    const networkName = `${fwData.location_name || iface.firewall_name} - Primary LAN`;

    console.log(`${networkName}`);
    console.log(`  Network: ${iface.network_cidr}`);

    // Check if exists FOR THIS LOCATION (critical - same CIDR can exist at different locations)
    // Following Altus pattern: network is scoped by location, not just CIDR
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=network_address=${encodeURIComponent(iface.network_address)}^netmask=${encodeURIComponent(iface.netmask)}^location=${fwData.location_sys_id}&sysparm_limit=1`;
    const checkResp = await fetch(checkUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  ⏭️  Already exists for ${fwData.company_name}`);
        existing++;
        continue;
      }
    }

    if (dryRun) {
      console.log(`  🧪 Would create`);
      created++;
      continue;
    }

    // Create network CI (following Altus pattern - location field is CRITICAL)
    const payload: any = {
      name: networkName,
      network_address: iface.network_address,
      netmask: iface.netmask,
      short_description: `Branch office LAN network. Interface: ${iface.interface_name} on ${iface.firewall_name}`,
      company: fwData.company_sys_id,
      location: fwData.location_sys_id  // CRITICAL - ties network to specific location
    };

    // Validate payload
    if (!payload.company || !payload.location) {
      console.log(`  ⚠️  Missing company or location data - skipping`);
      errors++;
      continue;
    }

    const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (createResp.ok) {
      console.log(`  ✅ Created`);
      created++;
    } else {
      const errorText = await createResp.text();
      console.log(`  ❌ Failed: ${errorText.substring(0, 100)}`);
      errors++;
    }
  }

  // Create WAN networks
  console.log('');
  console.log('─'.repeat(70));
  console.log('Creating WAN /29-30 Networks');
  console.log('─'.repeat(70));
  console.log('');

  for (const iface of wanNetworksToCreate) {
    const fwData = firewallMap.get(iface.firewall_name);
    if (!fwData) continue;

    const provider = iface.interface_alias || 'ISP';
    const networkName = `${fwData.location_name || iface.firewall_name} - ${provider} WAN`;

    console.log(`${networkName}`);
    console.log(`  Network: ${iface.network_cidr}`);

    // Check if exists FOR THIS LOCATION (critical - same CIDR can exist at different locations)
    // Following Altus pattern: network is scoped by location, not just CIDR
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=network_address=${encodeURIComponent(iface.network_address)}^netmask=${encodeURIComponent(iface.netmask)}^location=${fwData.location_sys_id}&sysparm_limit=1`;
    const checkResp = await fetch(checkUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      if (checkData.result?.length > 0) {
        console.log(`  ⏭️  Already exists for ${fwData.company_name}`);
        existing++;
        continue;
      }
    }

    if (dryRun) {
      console.log(`  🧪 Would create`);
      created++;
      continue;
    }

    // Create network CI
    const payload: any = {
      name: networkName,
      network_address: iface.network_address,
      netmask: iface.netmask,
      short_description: `WAN ${provider} network. Interface: ${iface.interface_name} on ${iface.firewall_name}`,
      company: fwData.company_sys_id || undefined,
      location: fwData.location_sys_id || undefined
    };

    const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (createResp.ok) {
      console.log(`  ✅ Created`);
      created++;
    } else {
      const errorText = await createResp.text();
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
  console.log(`LAN /24 Networks: ${lanNetworksToCreate.length}`);
  console.log(`WAN /29-30 Networks: ${wanNetworksToCreate.length}`);
  console.log(`Total: ${lanNetworksToCreate.length + wanNetworksToCreate.length}`);
  console.log('');
  console.log(`Created: ${created}`);
  console.log(`Already Existing: ${existing}`);
  console.log(`Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To create networks:');
    console.log('  npx tsx scripts/create-allcare-ip-networks-from-interfaces.ts');
  } else if (created > 0) {
    console.log('✅ Network CIs created!');
    console.log('');
    console.log('Next: Link firewalls to networks');
    console.log('  npx tsx scripts/link-allcare-firewalls-to-ip-networks.ts');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

createAllcareIPNetworksFromInterfaces(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
