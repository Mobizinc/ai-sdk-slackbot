/**
 * Import Network CIDRs to ServiceNow
 *
 * Read enriched template and create/update IP network CIs in ServiceNow
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

interface NetworkRecord {
  index: string;
  status: string;
  name: string;
  sys_id: string;
  ip_address: string;
  subnet: string;
  cidr_full: string;
  location_name: string;
  location_sys_id: string;
  dns_domain: string;
  dns_primary: string;
  dns_secondary: string;
  company: string;
  company_sys_id: string;
  short_description: string;
  comments: string;
  brand: string;
  short_code: string;
}

function parseCSV(csvContent: string): NetworkRecord[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');

  const records: NetworkRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let char of lines[i]) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    const record: any = {};
    headers.forEach((header, idx) => {
      record[header.trim()] = values[idx] || '';
    });

    records.push(record as NetworkRecord);
  }

  return records;
}

async function importNetworkCIDRs() {
  console.log('🌐 Import Network CIDRs to ServiceNow');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (DEV by default, PROD if explicitly set)
  const instanceUrl = process.env.DEV_SERVICENOW_URL || process.env.SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    process.exit(1);
  }

  const environment = process.env.DEV_SERVICENOW_URL ? 'DEV' : 'PRODUCTION';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  if (environment === 'PRODUCTION') {
    console.log('⚠️  WARNING: Creating records in PRODUCTION environment');
    console.log('');
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Read enriched template
  const templatePath = path.join(
    process.cwd(),
    'backup',
    'network-import',
    'network-cidrs-template.csv'
  );

  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template not found:', templatePath);
    console.log('Run scripts/enrich-network-cidrs.ts first to generate the template.');
    process.exit(1);
  }

  console.log('Reading template:', templatePath);
  console.log('');

  const csvContent = fs.readFileSync(templatePath, 'utf-8');
  const networks = parseCSV(csvContent);

  console.log(`Found ${networks.length} network record(s) in template`);
  console.log('');

  // Check for existing networks
  console.log('Phase 1: Checking for Existing Networks');
  console.log('─'.repeat(70));

  const existingNetworks = new Map<string, any>();

  for (const network of networks) {
    const query = encodeURIComponent(`ip_address=${network.ip_address}^subnet=${network.subnet}`);
    const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=${query}&sysparm_limit=1`;

    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        existingNetworks.set(network.cidr_full, data.result[0]);
      }
    }
  }

  if (existingNetworks.size > 0) {
    console.log(`Found ${existingNetworks.size} existing network(s)`);
    console.log('These will be SKIPPED to avoid duplicates.');
  } else {
    console.log('No existing networks found (clean slate)');
  }
  console.log('');

  // Create/Update Networks
  console.log('Phase 2: Creating Network Records');
  console.log('─'.repeat(70));
  console.log('');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const network of networks) {
    const isNew = network.status === 'NEW';
    const existingRecord = existingNetworks.get(network.cidr_full);

    if (existingRecord) {
      console.log(`⏭️  [${network.index}] Skipping: ${network.name} (already exists)`);
      skipped++;
      continue;
    }

    console.log(`[${network.index}] Creating: ${network.name}`);

    const payload: any = {
      name: network.name,
      ip_address: network.ip_address,
      subnet: network.subnet,
      location: network.location_sys_id,
      company: network.company_sys_id,
      short_description: network.short_description,
      comments: network.comments,
      operational_status: '1', // Operational
      install_status: '1', // Installed
    };

    // Add DNS domain if present
    if (network.dns_domain) {
      payload.dns_domain = network.dns_domain;
    }

    try {
      const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_network`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${response.status} - ${errorText.substring(0, 200)}`);
        errors++;
        continue;
      }

      const responseData = await response.json();
      const sysId = responseData.result.sys_id;

      console.log(`  ✅ Created with sys_id: ${sysId}`);
      console.log(`     Network: ${network.cidr_full}`);
      console.log(`     Location: ${network.location_name}`);
      console.log(`     DNS Domain: ${network.dns_domain || '(none)'}`);
      if (network.dns_primary) {
        console.log(`     Primary DNS: ${network.dns_primary}`);
      }
      console.log('');

      created++;
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      console.log('');
      errors++;
    }
  }

  // Summary
  console.log('─'.repeat(70));
  console.log('📊 IMPORT SUMMARY');
  console.log('─'.repeat(70));
  console.log('');

  console.log(`Total Networks in Template: ${networks.length}`);
  console.log(`  ✅ Created: ${created}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log('');

  if (created > 0) {
    console.log('✅ Network records created successfully!');
    console.log('');
    console.log('Next Steps:');
    console.log(`  1. Review networks in ${environment} ServiceNow`);
    console.log('  2. Validate all fields are correct');
    console.log('  3. Create relationships to firewalls at each location');
    if (environment === 'DEV') {
      console.log('  4. Once validated, replicate to PROD');
    }
  } else if (skipped === networks.length) {
    console.log('ℹ️  All networks already exist.');
    console.log('   No new records were created.');
  } else {
    console.log('⚠️  Some errors occurred. Review the output above.');
  }

  console.log('');
}

importNetworkCIDRs()
  .catch(console.error)
  .finally(() => process.exit(0));
