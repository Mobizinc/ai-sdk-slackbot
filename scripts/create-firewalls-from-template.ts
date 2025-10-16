/**
 * Create Firewalls from Enrichment Template
 *
 * Reads the enriched firewall-enrichment-template.csv and creates
 * properly configured network device records in the target environment.
 *
 * This script will:
 * 1. Read the enriched CSV template
 * 2. Validate all critical fields are populated
 * 3. Create firewall records in cmdb_ci_netgear table
 * 4. Link to Altus Customer Account
 * 5. Set proper operational and install status
 *
 * ENVIRONMENT VARIABLES:
 * - DEV_SERVICENOW_URL: DEV instance URL (default for testing)
 * - DEV_SERVICENOW_USERNAME: DEV API username
 * - DEV_SERVICENOW_PASSWORD: DEV API password
 * - SERVICENOW_URL: PROD instance URL (use for production deployment)
 * - SERVICENOW_USERNAME: PROD API username
 * - SERVICENOW_PASSWORD: PROD API password
 *
 * Target: DEV by default (or PROD if SERVICENOW_* vars are set)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface FirewallRecord {
  index: string;
  status: string; // EXISTS or NEW
  name: string;
  sys_id: string; // Original PROD sys_id or NEW
  ip_address: string;
  public_ip: string;
  serial_number: string;
  asset_tag: string;
  manufacturer: string;
  model_id: string;
  firmware_version: string;
  location: string;
  location_sys_id: string;
  support_group: string;
  managed_by: string;
  company: string;
  operational_status: string;
  install_status: string;
  comments: string;
  short_description: string;
  ports: string;
  physical_interface_count: string;
  warranty_expiration: string;
  hardware_os: string;
  hardware_os_version: string;
}

function parseCSV(csvContent: string): FirewallRecord[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');

  const records: FirewallRecord[] = [];

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

    records.push(record as FirewallRecord);
  }

  return records;
}

async function createFirewallsFromTemplate() {
  console.log('🔥 Create Firewalls from Enrichment Template');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (DEV by default, PROD if explicitly set)
  const instanceUrl = process.env.DEV_SERVICENOW_URL || process.env.SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\\nRequired variables (use DEV for testing, PROD for production):');
    console.log('  - DEV_SERVICENOW_URL or SERVICENOW_URL');
    console.log('  - DEV_SERVICENOW_USERNAME or SERVICENOW_USERNAME');
    console.log('  - DEV_SERVICENOW_PASSWORD or SERVICENOW_PASSWORD');
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

  // ========================================
  // Phase 0: Read Enrichment Template
  // ========================================
  console.log('Phase 0: Reading Enrichment Template');
  console.log('─'.repeat(70));

  const templatePath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'firewall-enrichment-template-auto.csv'
  );

  if (!fs.existsSync(templatePath)) {
    console.error('❌ Enrichment template not found:', templatePath);
    console.log('\\nRun scripts/analyze-prod-firewalls.ts first to generate the template.');
    process.exit(1);
  }

  const csvContent = fs.readFileSync(templatePath, 'utf-8');
  const firewalls = parseCSV(csvContent);

  console.log(`Found ${firewalls.length} firewall record(s) in template`);
  console.log('');

  // ========================================
  // Phase 1: Validate Template Data
  // ========================================
  console.log('Phase 1: Validating Template Data');
  console.log('─'.repeat(70));

  const criticalFields = [
    'name',
    'ip_address',
    'serial_number',
    'manufacturer',
    'model_id',
    'location_sys_id',
    'support_group',
  ];

  const validationErrors: string[] = [];

  for (const firewall of firewalls) {
    for (const field of criticalFields) {
      const value = firewall[field as keyof FirewallRecord];
      if (!value || value.startsWith('TODO:') || value.trim() === '') {
        validationErrors.push(`[${firewall.index}] ${firewall.name}: Missing ${field}`);
      }
    }
  }

  if (validationErrors.length > 0) {
    console.log('❌ Validation failed! Please complete the template:');
    console.log('');
    for (const error of validationErrors) {
      console.log(`  ${error}`);
    }
    console.log('');
    console.log(`Edit: ${templatePath}`);
    console.log('Fill in all TODO fields and remove "TODO:" prefixes.');
    process.exit(1);
  }

  console.log('✅ Template validation passed');
  console.log('');

  // ========================================
  // Phase 2: Query Customer Account
  // ========================================
  console.log('Phase 2: Querying Customer Account');
  console.log('─'.repeat(70));

  const customerAccountNumber = 'ACCT0010145';
  const customerQueryUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent(`number=${customerAccountNumber}`)}&sysparm_limit=1`;

  const customerResponse = await fetch(customerQueryUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!customerResponse.ok) {
    throw new Error(`Failed to query customer_account: ${customerResponse.status}`);
  }

  const customerData = await customerResponse.json();

  if (!customerData.result || customerData.result.length === 0) {
    console.error(`❌ Customer account not found: ${customerAccountNumber}`);
    console.log('   Create the customer account first.');
    process.exit(1);
  }

  const customerAccount = customerData.result[0];
  const customerSysId = customerAccount.sys_id;
  const customerName = customerAccount.name;

  console.log(`✅ Found customer account: ${customerName}`);
  console.log(`   Number: ${customerAccountNumber}`);
  console.log(`   sys_id: ${customerSysId}`);
  console.log('');

  // ========================================
  // Phase 3: Check for Existing Firewalls
  // ========================================
  console.log('Phase 3: Checking for Existing Firewalls');
  console.log('─'.repeat(70));

  const existingFirewalls = new Map<string, any>();

  for (const firewall of firewalls) {
    const query = encodeURIComponent(`name=${firewall.name}^ORserial_number=${firewall.serial_number}`);
    const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_limit=1`;

    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        existingFirewalls.set(firewall.name, data.result[0]);
      }
    }
  }

  if (existingFirewalls.size > 0) {
    console.log(`⚠️  Found ${existingFirewalls.size} existing firewall(s) with matching names/serial numbers:`);
    console.log('');
    for (const [name, record] of existingFirewalls) {
      console.log(`  - ${name} (sys_id: ${record.sys_id})`);
    }
    console.log('');
    console.log('These records will be SKIPPED to avoid duplicates.');
    console.log('');
  } else {
    console.log('✅ No existing firewalls found (clean slate)');
    console.log('');
  }

  // ========================================
  // Phase 4: Create/Update Firewall Records
  // ========================================
  console.log('Phase 4: Creating/Updating Firewall Records');
  console.log('─'.repeat(70));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const firewall of firewalls) {
    const isNew = firewall.status === 'NEW';
    const existingRecord = existingFirewalls.get(firewall.name);

    if (!isNew && !existingRecord) {
      console.log(`⏭️  [${firewall.index}] Skipping: ${firewall.name} (marked EXISTS but not found in ${environment})`);
      skipped++;
      continue;
    }

    if (isNew && existingRecord) {
      console.log(`⏭️  [${firewall.index}] Skipping: ${firewall.name} (marked NEW but already exists)`);
      skipped++;
      continue;
    }

    console.log(`[${firewall.index}] ${isNew ? 'Creating' : 'Updating'}: ${firewall.name}`);

    // Map operational_status text to value
    let operationalStatusValue = '1'; // Default: Operational
    if (firewall.operational_status.toLowerCase().includes('non')) {
      operationalStatusValue = '2'; // Non-Operational
    }

    // Map install_status text to value
    let installStatusValue = '1'; // Default: Installed
    if (firewall.install_status.toLowerCase().includes('retired')) {
      installStatusValue = '7'; // Retired
    } else if (firewall.install_status.toLowerCase().includes('in stock')) {
      installStatusValue = '6'; // In Stock
    }

    const payload: any = {
      name: firewall.name,
      ip_address: firewall.ip_address,
      serial_number: firewall.serial_number,
      asset_tag: firewall.asset_tag,
      manufacturer: firewall.manufacturer,
      model_id: firewall.model_id,
      firmware_version: firewall.firmware_version,
      location: firewall.location_sys_id,
      support_group: firewall.support_group,
      company: customerSysId, // Link to Altus Customer Account
      operational_status: operationalStatusValue,
      install_status: installStatusValue,
      comments: firewall.comments,
      short_description: firewall.short_description,
      ports: firewall.ports,
      warranty_expiration: firewall.warranty_expiration || '',
    };

    // Add optional fields if they have values
    if (firewall.managed_by && firewall.managed_by.trim()) {
      payload.managed_by = firewall.managed_by;
    }

    if (firewall.physical_interface_count && firewall.physical_interface_count.trim()) {
      payload.physical_interface_count = parseInt(firewall.physical_interface_count);
    }

    try {
      let response;
      let url;

      if (isNew) {
        // CREATE
        url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall`;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        // UPDATE
        url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${existingRecord.sys_id}`;
        response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${response.status} - ${errorText}`);
        continue;
      }

      const responseData = await response.json();
      const sysId = responseData.result.sys_id;

      console.log(`  ✅ ${isNew ? 'Created' : 'Updated'} with sys_id: ${sysId}`);
      console.log(`     IP: ${firewall.ip_address}`);
      console.log(`     Serial: ${firewall.serial_number}`);
      console.log(`     Manufacturer: ${firewall.manufacturer} ${firewall.model_id}`);
      console.log(`     Firmware: ${firewall.firmware_version}`);
      console.log(`     Location: ${firewall.location}`);
      console.log(`     Ports: ${firewall.ports}`);
      console.log('');

      if (isNew) {
        created++;
      } else {
        updated++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      console.log('');
    }
  }

  // ========================================
  // Summary
  // ========================================
  console.log('─'.repeat(70));
  console.log('📊 CREATION SUMMARY');
  console.log('─'.repeat(70));
  console.log('');

  console.log(`Total Firewalls in Template: ${firewalls.length}`);
  console.log(`  ✅ Created: ${created}`);
  console.log(`  ✏️  Updated: ${updated}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log('');

  if (created > 0 || updated > 0) {
    console.log('✅ Firewall records processed successfully!');
    console.log('');
    console.log('Next Steps:');
    console.log(`  1. Review firewalls in ${environment} ServiceNow`);
    console.log('  2. Validate all fields are correct:');
    console.log('     - Management URLs in comments');
    console.log('     - Port configurations (Web & SSH)');
    console.log('     - Physical interface counts');
    console.log('     - License expiration dates');
    console.log('  3. Test management access to firewalls');
    if (environment === 'DEV') {
      console.log('  4. Once validated, replicate to PROD using SERVICENOW_* env vars');
    }
  } else if (skipped === firewalls.length) {
    console.log('ℹ️  All firewalls skipped.');
    console.log('   No new records were created or updated.');
  } else {
    console.log('⚠️  Some errors occurred. Review the output above.');
  }

  console.log('');
}

createFirewallsFromTemplate()
  .catch(console.error)
  .finally(() => process.exit(0));
