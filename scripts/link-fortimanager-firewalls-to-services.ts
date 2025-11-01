/**
 * Link FortiManager Firewalls to Services
 *
 * Links discovered FortiManager firewall CIs to Network Management service offering
 * Creates "Contains::Contained by" relationships in ServiceNow CMDB
 *
 * PREREQUISITES:
 * - Firewalls created in ServiceNow via create-fortimanager-firewall-cis.ts
 * - Network Management service offering exists
 *
 * USAGE:
 *   npx tsx scripts/link-fortimanager-firewalls-to-services.ts "Allcare Medical Management, Inc."
 *   npx tsx scripts/link-fortimanager-firewalls-to-services.ts "Allcare Medical Management, Inc." --service "Network Management"
 *
 * OUTPUTS:
 * - Creates CI relationships in ServiceNow
 * - Reports linking summary (linked, existing, errors)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function linkFortiManagerFirewallsToServices(
  companyName: string,
  serviceOfferingName: string = 'Network Management'
) {
  console.log('🔗 Linking FortiManager Firewalls to Services');
  console.log('='.repeat(70));
  console.log('');

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
  console.log(`Company: ${companyName}`);
  console.log(`Service: ${serviceOfferingName}`);
  console.log('');

  try {
    // Find company
    console.log(`Looking up company: ${companyName}...`);
    const companyUrl = `${instanceUrl}/api/now/table/core_company?sysparm_query=name=${encodeURIComponent(companyName)}&sysparm_limit=1&sysparm_fields=sys_id,name`;
    const companyResp = await fetch(companyUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let companySysId: string | null = null;

    if (companyResp.ok) {
      const companyData = await companyResp.json();
      if (companyData.result?.length > 0) {
        companySysId = companyData.result[0].sys_id;
        console.log(`✅ Found company: ${companyData.result[0].name}`);
      }
    }

    if (!companySysId) {
      console.error(`❌ Company not found: ${companyName}`);
      process.exit(1);
    }

    // Find service offering
    console.log(`Looking up service offering: ${serviceOfferingName}...`);
    const serviceUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=${encodeURIComponent(serviceOfferingName)}&sysparm_limit=1&sysparm_fields=sys_id,name`;
    const serviceResp = await fetch(serviceUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    let serviceSysId: string | null = null;

    if (serviceResp.ok) {
      const serviceData = await serviceResp.json();
      if (serviceData.result?.length > 0) {
        serviceSysId = serviceData.result[0].sys_id;
        console.log(`✅ Found service: ${serviceData.result[0].name}`);
      }
    }

    if (!serviceSysId) {
      console.error(`❌ Service offering not found: ${serviceOfferingName}`);
      console.error('');
      console.error('Please create the service offering first or specify correct name');
      process.exit(1);
    }

    console.log('');

    // Find all firewalls for this company
    console.log('Finding firewalls for company...');
    const firewallsUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company=${companySysId}&sysparm_fields=sys_id,name,serial_number,ip_address`;
    const firewallsResp = await fetch(firewallsUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });

    if (!firewallsResp.ok) {
      throw new Error(`Failed to query firewalls: ${firewallsResp.statusText}`);
    }

    const firewallsData = await firewallsResp.json();
    const firewalls = firewallsData.result || [];

    console.log(`Found ${firewalls.length} firewall(s)`);
    console.log('');

    if (firewalls.length === 0) {
      console.log('⚠️  No firewalls found for this company');
      console.log('');
      console.log('Make sure firewalls are created first:');
      console.log('  npx tsx scripts/create-fortimanager-firewall-cis.ts <discovery-file>');
      process.exit(0);
    }

    let linked = 0, existing = 0, errors = 0;

    // Link each firewall to service
    for (const firewall of firewalls) {
      console.log(`${firewall.name}`);

      // Check if relationship already exists
      const checkUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent=${serviceSysId}^child=${firewall.sys_id}&sysparm_limit=1`;
      const checkResp = await fetch(checkUrl, {
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
      });

      if (checkResp.ok) {
        const checkData = await checkResp.json();
        if (checkData.result?.length > 0) {
          console.log(`  🔗 Already linked`);
          existing++;
          continue;
        }
      }

      // Create relationship
      const relPayload = {
        parent: serviceSysId,
        child: firewall.sys_id,
        type: 'Contains::Contained by'
      };

      const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
      const relResp = await fetch(relUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(relPayload)
      });

      if (relResp.ok) {
        console.log(`  ✅ Linked to ${serviceOfferingName}`);
        linked++;
      } else {
        const errorText = await relResp.text();
        console.log(`  ❌ Failed to link: ${errorText}`);
        errors++;
      }
    }

    // Summary
    console.log('');
    console.log('='.repeat(70));
    console.log('📊 Linking Summary');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Total Firewalls: ${firewalls.length}`);
    console.log(`  Linked: ${linked}`);
    console.log(`  Already Linked: ${existing}`);
    console.log(`  Errors: ${errors}`);
    console.log('');

    if (linked > 0) {
      console.log('─'.repeat(70));
      console.log('💡 Verification');
      console.log('─'.repeat(70));
      console.log('');
      console.log('1. Verify in ServiceNow:');
      console.log(`   - Navigate to Service Offerings → ${serviceOfferingName}`);
      console.log(`   - Check "Related Services" or "CI Relationships" tab`);
      console.log(`   - Verify ${linked} firewall(s) appear as contained CIs`);
      console.log('');
      console.log('2. Check CI Relationship Viewer:');
      console.log(`   - Open any firewall CI`);
      console.log(`   - View "CI Relationships" tab`);
      console.log(`   - Verify parent = "${serviceOfferingName}"`);
      console.log('');
    }

  } catch (error: any) {
    console.error('');
    console.error('❌ Linking failed:');
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
let companyName: string | undefined;
let serviceOfferingName: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--service' && args[i + 1]) {
    serviceOfferingName = args[i + 1];
  } else if (!args[i].startsWith('--')) {
    companyName = args[i];
  }
}

if (!companyName) {
  console.error('❌ Usage: npx tsx scripts/link-fortimanager-firewalls-to-services.ts <company-name>');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/link-fortimanager-firewalls-to-services.ts "Allcare Medical Management, Inc."');
  console.error('  npx tsx scripts/link-fortimanager-firewalls-to-services.ts "Allcare Medical Management, Inc." --service "Network Management"');
  console.error('');
  process.exit(1);
}

linkFortiManagerFirewallsToServices(companyName, serviceOfferingName)
  .catch(console.error)
  .finally(() => process.exit(0));
