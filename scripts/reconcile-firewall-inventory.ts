/**
 * Reconcile Firewall Inventory (READ-ONLY)
 *
 * Comprehensive comparison between:
 * - Altus Master File (29 firewalls)
 * - ServiceNow PROD Reality (what actually exists)
 *
 * Shows:
 * - Which firewalls from master file exist in ServiceNow
 * - Which are missing (should be created)
 * - Which need cleanup/enrichment
 * - Breakdown by manufacturer, location, and completeness
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * Input Files:
 * - /Users/hamadriaz/Documents/Altus master file 1.2.csv
 * - backup/servicenow-reference-data/altus_network_devices.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface MasterFirewall {
  location: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  internalIP: string;
  account: string;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

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

  return values;
}

function getDisplayValue(field: any): string {
  if (!field) return '';
  if (typeof field === 'object' && field.display_value !== undefined) {
    return field.display_value || '';
  }
  return String(field || '');
}

async function reconcileFirewallInventory() {
  console.log('🔍 Reconcile Firewall Inventory');
  console.log('='.repeat(70));
  console.log('');

  // ========================================
  // Step 1: Parse Altus Master CSV
  // ========================================
  console.log('Step 1: Parsing Altus Master CSV');
  console.log('─'.repeat(70));

  const masterPath = '/Users/hamadriaz/Documents/Altus master file 1.2.csv';

  if (!fs.existsSync(masterPath)) {
    console.error('❌ Altus master file not found:', masterPath);
    process.exit(1);
  }

  const masterContent = fs.readFileSync(masterPath, 'utf-8');
  const masterLines = masterContent.split('\n').filter(line => line.trim());

  const masterFirewalls: MasterFirewall[] = [];

  for (let i = 0; i < masterLines.length; i++) {
    const line = masterLines[i];
    const values = parseCSVLine(line);

    // Skip headers and empty lines
    if (values[0] === 'Account' || values[0] === '' || values[1] === '') {
      continue;
    }

    // Skip if no serial number
    if (!values[6] || values[6].trim() === '') {
      continue;
    }

    const firewallName = values[2];
    let manufacturer = '';
    if (firewallName.toLowerCase().includes('fortinet') || firewallName.toLowerCase().includes('fg')) {
      manufacturer = 'Fortinet';
    } else if (firewallName.toLowerCase().includes('sonicwall')) {
      manufacturer = 'Sonicwall';
    }

    masterFirewalls.push({
      account: values[0],
      location: values[1],
      serialNumber: values[6],
      model: values[3],
      manufacturer: manufacturer,
      internalIP: values[7],
    });
  }

  console.log(`Found ${masterFirewalls.length} firewall(s) in master file`);
  console.log('');

  // ========================================
  // Step 2: Load ServiceNow Devices
  // ========================================
  console.log('Step 2: Loading ServiceNow Altus Devices');
  console.log('─'.repeat(70));

  const snDevicesPath = path.join(
    process.cwd(),
    'backup',
    'servicenow-reference-data',
    'altus_network_devices.json'
  );

  let snDevices: any[] = [];

  if (fs.existsSync(snDevicesPath)) {
    const snContent = fs.readFileSync(snDevicesPath, 'utf-8');
    snDevices = JSON.parse(snContent);
    console.log(`Loaded ${snDevices.length} Altus device(s) from ServiceNow`);
  } else {
    console.log('⚠️  ServiceNow devices not found');
    console.log('   Run extract-servicenow-reference-data.ts first');
    console.log('');
  }
  console.log('');

  // ========================================
  // Step 3: Match Master to ServiceNow
  // ========================================
  console.log('Step 3: Matching Firewalls');
  console.log('─'.repeat(70));

  const matched: any[] = [];
  const missing: any[] = [];
  const unmatched: any[] = [];

  for (const master of masterFirewalls) {
    const snDevice = snDevices.find(d => {
      const snSerial = getDisplayValue(d.serial_number);
      return snSerial === master.serialNumber;
    });

    if (snDevice) {
      matched.push({
        master,
        snDevice,
        name: getDisplayValue(snDevice.name),
        sys_id: getDisplayValue(snDevice.sys_id),
      });
    } else {
      missing.push(master);
    }
  }

  // Find devices in ServiceNow that aren't in master file
  for (const snDevice of snDevices) {
    const snSerial = getDisplayValue(snDevice.serial_number);
    const inMaster = masterFirewalls.some(m => m.serialNumber === snSerial);

    if (!inMaster) {
      unmatched.push({
        name: getDisplayValue(snDevice.name),
        serial: snSerial,
        sys_id: getDisplayValue(snDevice.sys_id),
      });
    }
  }

  console.log(`✅ Matched: ${matched.length} (exist in both master and ServiceNow)`);
  console.log(`❌ Missing: ${missing.length} (in master but NOT in ServiceNow)`);
  console.log(`⚠️  Unmatched: ${unmatched.length} (in ServiceNow but NOT in master)`);
  console.log('');

  // ========================================
  // Step 4: Detailed Breakdown
  // ========================================
  console.log('─'.repeat(70));
  console.log('📊 DETAILED BREAKDOWN');
  console.log('─'.repeat(70));
  console.log('');

  // Matched Firewalls
  if (matched.length > 0) {
    console.log(`✅ MATCHED FIREWALLS (${matched.length})`);
    console.log('These exist in ServiceNow and may need enrichment:');
    console.log('');

    for (const match of matched) {
      console.log(`  ${match.name}`);
      console.log(`    Serial: ${match.master.serialNumber}`);
      console.log(`    Location: ${match.master.location}`);
      console.log(`    Model: ${match.master.manufacturer} ${match.master.model}`);
      console.log(`    sys_id: ${match.sys_id}`);
      console.log('');
    }
  }

  // Missing Firewalls
  if (missing.length > 0) {
    console.log('─'.repeat(70));
    console.log(`❌ MISSING FIREWALLS (${missing.length})`);
    console.log('These are in the master file but NOT in ServiceNow:');
    console.log('');

    // Group by location group
    const neighbors = missing.filter(m => m.account.includes('Neighbors'));
    const austin = missing.filter(m => m.account.includes('Austin'));
    const exceptional = missing.filter(m =>
      m.account.includes('Exceptional') ||
      m.location.includes('DataCenter') ||
      (!m.account.includes('Neighbors') && !m.account.includes('Austin'))
    );

    if (neighbors.length > 0) {
      console.log(`  Neighbors Locations (${neighbors.length}):`);
      for (const fw of neighbors) {
        console.log(`    - ${fw.location} (${fw.manufacturer} ${fw.model})`);
      }
      console.log('');
    }

    if (austin.length > 0) {
      console.log(`  Austin Locations (${austin.length}):`);
      for (const fw of austin) {
        console.log(`    - ${fw.location} (${fw.manufacturer} ${fw.model})`);
      }
      console.log('');
    }

    if (exceptional.length > 0) {
      console.log(`  Exceptional/Other Locations (${exceptional.length}):`);
      for (const fw of exceptional) {
        console.log(`    - ${fw.location} (${fw.manufacturer} ${fw.model})`);
      }
      console.log('');
    }
  }

  // Unmatched in ServiceNow
  if (unmatched.length > 0) {
    console.log('─'.repeat(70));
    console.log(`⚠️  UNMATCHED IN SERVICENOW (${unmatched.length})`);
    console.log('These are in ServiceNow but NOT in the master file:');
    console.log('(Might be legacy, decommissioned, or incorrectly named)');
    console.log('');

    for (const device of unmatched) {
      console.log(`  ${device.name}`);
      console.log(`    Serial: ${device.serial}`);
      console.log(`    sys_id: ${device.sys_id}`);
      console.log('');
    }
  }

  // ========================================
  // Step 5: Summary Statistics
  // ========================================
  console.log('─'.repeat(70));
  console.log('📈 SUMMARY STATISTICS');
  console.log('─'.repeat(70));
  console.log('');

  // By manufacturer
  const fortinetMaster = masterFirewalls.filter(m => m.manufacturer === 'Fortinet').length;
  const sonicwallMaster = masterFirewalls.filter(m => m.manufacturer === 'Sonicwall').length;

  const fortinetMatched = matched.filter(m => m.master.manufacturer === 'Fortinet').length;
  const sonicwallMatched = matched.filter(m => m.master.manufacturer === 'Sonicwall').length;

  const fortinetMissing = missing.filter(m => m.manufacturer === 'Fortinet').length;
  const sonicwallMissing = missing.filter(m => m.manufacturer === 'Sonicwall').length;

  console.log('By Manufacturer:');
  console.log(`  Fortinet: ${fortinetMaster} total (${fortinetMatched} in SN, ${fortinetMissing} missing)`);
  console.log(`  Sonicwall: ${sonicwallMaster} total (${sonicwallMatched} in SN, ${sonicwallMissing} missing)`);
  console.log('');

  // Completion percentage
  const completionPct = ((matched.length / masterFirewalls.length) * 100).toFixed(1);
  console.log(`ServiceNow Completeness: ${completionPct}% (${matched.length}/${masterFirewalls.length})`);
  console.log('');

  // ========================================
  // Step 6: Recommendations
  // ========================================
  console.log('─'.repeat(70));
  console.log('💡 RECOMMENDATIONS');
  console.log('─'.repeat(70));
  console.log('');

  console.log('Priority Actions:');
  console.log('');

  if (matched.length > 0) {
    console.log(`1. ✅ ENRICH existing ${matched.length} firewalls:`);
    console.log('   - Run enrich-firewalls-from-master.ts to auto-populate fields');
    console.log('   - Fill in missing support_group and managed_by');
    console.log('   - Update in DEV first, then replicate to PROD');
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`2. ➕ CREATE ${missing.length} missing firewalls:`);
    console.log('   - Use the enriched template to create new records');
    console.log('   - Start in DEV for validation');
    console.log('   - Then replicate to PROD');
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log(`3. 🧹 REVIEW ${unmatched.length} unmatched ServiceNow devices:`);
    console.log('   - Determine if they are legacy/decommissioned');
    console.log('   - Update or remove as appropriate');
    console.log('');
  }

  console.log('📝 NEXT STEPS:');
  console.log('');
  console.log('1. Review the enriched template generated by enrich-firewalls-from-master.ts');
  console.log('2. Fill in TODO fields (support_group, managed_by)');
  console.log('3. Decide: cleanup existing 16 first, or create all 29 fresh?');
  console.log('4. Execute in DEV, validate, then replicate to PROD');
  console.log('');
}

reconcileFirewallInventory()
  .catch(console.error)
  .finally(() => process.exit(0));
