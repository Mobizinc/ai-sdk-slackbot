/**
 * Create FortiManager Firewall CIs
 *
 * Creates ServiceNow CMDB CIs from FortiManager firewall discovery data
 * Maps discovered firewalls to cmdb_ci_ip_firewall table with all metadata
 *
 * PREREQUISITES:
 * - Run discover-fortimanager-firewalls.ts first
 * - ServiceNow credentials configured in .env.local
 *
 * USAGE:
 *   npx tsx scripts/create-fortimanager-firewall-cis.ts backup/fortimanager-discovery/allcare-firewalls.json
 *   npx tsx scripts/create-fortimanager-firewall-cis.ts backup/fortimanager-discovery/allcare-firewalls.json --company "Allcare Medical Management, Inc."
 *
 * OUTPUTS:
 * - Creates firewall CIs in ServiceNow CMDB
 * - Reports creation summary (created, existing, errors)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function createFortiManagerFirewallCIs(discoveryFilePath: string, companyNameOverride?: string) {
  console.log('🔥 Creating FortiManager Firewall CIs');
  console.log('='.repeat(70));
  console.log('');

  if (!fs.existsSync(discoveryFilePath)) {
    console.error(`❌ Discovery file not found: ${discoveryFilePath}`);
    process.exit(1);
  }

  const discovery = JSON.parse(fs.readFileSync(discoveryFilePath, 'utf-8'));
  const firewalls = discovery.firewalls || [];
  const customerName = companyNameOverride || discovery.customer || 'Unknown';

  console.log(`Customer: ${customerName}`);
  console.log(`Firewalls: ${firewalls.length}`);
  console.log('');

  if (firewalls.length === 0) {
    console.log('⚠️  No firewalls to create');
    process.exit(0);
  }

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // Find company in ServiceNow
    console.log(`Looking up company: ${customerName}...`);
    const companyUrl = `${instanceUrl}/api/now/table/core_company?sysparm_query=nameLIKE${encodeURIComponent(customerName)}&sysparm_limit=5&sysparm_fields=sys_id,name`;
    const companyResp = await fetch(companyUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let companySysId: string | null = null;

    if (companyResp.ok) {
      const companyData = await companyResp.json();
      if (companyData.result?.length > 0) {
        companySysId = companyData.result[0].sys_id;
        const companyFoundName = companyData.result[0].name;
        console.log(`✅ Found company: ${companyFoundName} (${companySysId})`);

        if (companyData.result.length > 1) {
          console.log(`⚠️  Multiple companies found, using first match`);
          companyData.result.forEach((c: any, i: number) => {
            console.log(`   ${i + 1}. ${c.name} (${c.sys_id})`);
          });
        }
      }
    }

    if (!companySysId) {
      console.error(`❌ Company not found: ${customerName}`);
      console.error('');
      console.error('Please specify exact company name with --company flag');
      console.error('Example:');
      console.error('  npx tsx scripts/create-fortimanager-firewall-cis.ts <file> --company "Allcare Medical Management, Inc."');
      process.exit(1);
    }

    console.log('');

    let created = 0, existing = 0, errors = 0;

    // Create each firewall CI
    for (const firewall of firewalls) {
      console.log(`${firewall.name}`);

      // Check if firewall already exists (by serial number)
      const checkUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=serial_number=${encodeURIComponent(firewall.serial_number)}&sysparm_limit=1&sysparm_fields=sys_id,name`;
      const checkResp = await fetch(checkUrl, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      let firewallSysId: string | null = null;

      if (checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData.result?.length > 0) {
          console.log(`  ⏭️  Exists (${checkData.result[0].name})`);
          firewallSysId = checkData.result[0].sys_id;
          existing++;
          continue;
        }
      }

      // Build description with IP scopes
      const ipInfo = [];
      if (firewall.public_ip_scope?.length > 0) {
        ipInfo.push(`Public IPs: ${firewall.public_ip_scope.join(', ')}`);
      }
      if (firewall.internal_ip_scope?.length > 0) {
        ipInfo.push(`Internal IPs: ${firewall.internal_ip_scope.join(', ')}`);
      }

      const description = [
        `FortiGate firewall: ${firewall.name}`,
        `Model: ${firewall.model}`,
        firewall.location ? `Location: ${firewall.location}` : null,
        ipInfo.join('. '),
        firewall.firmware_version ? `Firmware: ${firewall.firmware_version}` : null
      ].filter(Boolean).join('. ');

      // Map status
      let operationalStatus = '1'; // Operational
      if (firewall.status === 'offline') {
        operationalStatus = '2'; // Non-Operational
      } else if (firewall.status === 'unknown') {
        operationalStatus = '6'; // Unknown
      }

      const payload: any = {
        name: firewall.name,
        serial_number: firewall.serial_number,
        ip_address: firewall.management_ip || '',
        short_description: description,
        company: companySysId,
        operational_status: operationalStatus,
        install_status: '1', // Installed
        asset_tag: firewall.serial_number
      };

      // Add manufacturer if we can determine it
      if (firewall.model?.toLowerCase().includes('fortinet') || firewall.model?.toLowerCase().includes('fortigate')) {
        // Query for Fortinet manufacturer
        const mfrUrl = `${instanceUrl}/api/now/table/core_company?sysparm_query=nameLIKEFortinet&sysparm_limit=1&sysparm_fields=sys_id`;
        const mfrResp = await fetch(mfrUrl, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });

        if (mfrResp.ok) {
          const mfrData = await mfrResp.json();
          if (mfrData.result?.length > 0) {
            payload.manufacturer = mfrData.result[0].sys_id;
          }
        }
      }

      // Create firewall CI
      const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (createResp.ok) {
        const createData = await createResp.json();
        firewallSysId = createData.result.sys_id;
        console.log(`  ✅ Created (${firewall.model})`);
        console.log(`     Management IP: ${firewall.management_ip || '(none)'}`);
        if (firewall.public_ip_scope?.length > 0) {
          console.log(`     Public IPs: ${firewall.public_ip_scope.join(', ')}`);
        }
        if (firewall.internal_ip_scope?.length > 0) {
          console.log(`     Internal IPs: ${firewall.internal_ip_scope.join(', ')}`);
        }
        created++;
      } else {
        const errorText = await createResp.text();
        console.log(`  ❌ Failed to create: ${errorText}`);
        errors++;
      }
    }

    // Summary
    console.log('');
    console.log('='.repeat(70));
    console.log('📊 Creation Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Total Firewalls: ${firewalls.length}`);
    console.log(`  Created: ${created}`);
    console.log(`  Already Existing: ${existing}`);
    console.log(`  Errors: ${errors}`);
    console.log('');

    if (created > 0) {
      console.log('─'.repeat(70));
      console.log('💡 Next Steps');
      console.log('─'.repeat(70));
      console.log('');
      console.log('1. Verify in ServiceNow:');
      console.log(`   - Navigate to CMDB → Firewalls`);
      console.log(`   - Filter by company: ${customerName}`);
      console.log(`   - Verify ${created} new firewall(s) appear`);
      console.log('');
      console.log('2. Link firewalls to services:');
      console.log(`   npx tsx scripts/link-fortimanager-firewalls-to-services.ts "${customerName}"`);
      console.log('');
    }

  } catch (error: any) {
    console.error('');
    console.error('❌ CI creation failed:');
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
let discoveryFile: string | undefined;
let companyName: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--company' && args[i + 1]) {
    companyName = args[i + 1];
    i++; // Skip next arg (company name value)
  } else if (!args[i].startsWith('--') && !discoveryFile) {
    discoveryFile = args[i];
  }
}

if (!discoveryFile) {
  console.error('❌ Usage: npx tsx scripts/create-fortimanager-firewall-cis.ts <discovery-file.json>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/create-fortimanager-firewall-cis.ts backup/fortimanager-discovery/allcare-firewalls.json');
  console.error('  npx tsx scripts/create-fortimanager-firewall-cis.ts backup/fortimanager-discovery/allcare-firewalls.json --company "Allcare Medical Management, Inc."');
  console.error('');
  process.exit(1);
}

createFortiManagerFirewallCIs(discoveryFile, companyName)
  .catch(console.error)
  .finally(() => process.exit(0));
