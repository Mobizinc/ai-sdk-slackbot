/**
 * Auto-Enrich Firewall Template from Altus Master CSV
 *
 * Reads the Altus master file and auto-populates the enrichment template with:
 * - Manufacturer (Fortinet/Sonicwall)
 * - Model ID (60D, 100F, NSA 2650, TZ 400, etc.)
 * - Location name (from master file)
 * - Standardized asset tags
 * - Serial numbers
 *
 * Also attempts to map to ServiceNow location sys_ids where possible.
 *
 * Input Files:
 * - /Users/hamadriaz/Documents/Altus master file 1.2.csv
 * - backup/servicenow-reference-data/locations.json (optional)
 * - backup/altus-export-2025-10-15/production/network_devices.json
 *
 * Output:
 * - backup/altus-export-2025-10-15/firewall-enrichment-template-auto.csv
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface MasterFirewall {
  account: string;
  location: string;
  firewallName: string;
  model: string;
  publicIP: string;
  wanPort: string;
  serialNumber: string;
  internalIP: string;
  lanPort: string;
  firmwareVersion: string;
  license: string;
  username: string;
  password: string;
}

interface ServiceNowLocation {
  name: any;
  sys_id: any;
  city: any;
  state: any;
}

interface ServiceNowDevice {
  name: any;
  sys_id: any;
  serial_number: any;
  ip_address: any;
  manufacturer: any;
  model_id: any;
  location: any;
  support_group: any;
  managed_by: any;
  company: any;
  operational_status: any;
  install_status: any;
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

function getValue(field: any): string {
  if (!field) return '';
  if (typeof field === 'object' && field.value !== undefined) {
    return field.value || '';
  }
  return String(field || '');
}

async function enrichFirewallsFromMaster() {
  console.log('🔥 Auto-Enrich Firewall Template from Altus Master CSV');
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

  // Parse the CSV (skip headers and empty lines)
  for (let i = 0; i < masterLines.length; i++) {
    const line = masterLines[i];
    const values = parseCSVLine(line);

    // Skip if this is a header row or empty
    if (values[0] === 'Account' || values[0] === '' || values[1] === '') {
      continue;
    }

    // Skip if no serial number
    if (!values[6] || values[6].trim() === '') {
      continue;
    }

    masterFirewalls.push({
      account: values[0],
      location: values[1],
      firewallName: values[2],
      model: values[3],
      publicIP: values[4],
      wanPort: values[5],
      serialNumber: values[6],
      internalIP: values[7],
      lanPort: values[8],
      firmwareVersion: values[9],
      license: values[10],
      username: values[11],
      password: values[12] || values[13], // Sometimes password is in column 13
    });
  }

  console.log(`Found ${masterFirewalls.length} firewall(s) in master file`);
  console.log('');

  // ========================================
  // Step 2: Load ServiceNow Export
  // ========================================
  console.log('Step 2: Loading ServiceNow Export');
  console.log('─'.repeat(70));

  const exportPath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'production',
    'network_devices.json'
  );

  let snDevices: ServiceNowDevice[] = [];

  if (fs.existsSync(exportPath)) {
    const exportContent = fs.readFileSync(exportPath, 'utf-8');
    snDevices = JSON.parse(exportContent);
    console.log(`Loaded ${snDevices.length} device(s) from ServiceNow export`);
  } else {
    console.log('⚠️  ServiceNow export not found, will create template for all 29 firewalls');
  }
  console.log('');

  // ========================================
  // Step 3: Load ServiceNow Locations (Optional)
  // ========================================
  console.log('Step 3: Loading ServiceNow Locations');
  console.log('─'.repeat(70));

  const locationsPath = path.join(
    process.cwd(),
    'backup',
    'servicenow-reference-data',
    'locations.json'
  );

  let snLocations: ServiceNowLocation[] = [];

  if (fs.existsSync(locationsPath)) {
    const locationsContent = fs.readFileSync(locationsPath, 'utf-8');
    snLocations = JSON.parse(locationsContent);
    console.log(`Loaded ${snLocations.length} location(s) from ServiceNow`);
  } else {
    console.log('⚠️  ServiceNow locations not found, run extract-servicenow-reference-data.ts first');
  }
  console.log('');

  // ========================================
  // Step 4: Match and Enrich
  // ========================================
  console.log('Step 4: Matching Master File to ServiceNow Export');
  console.log('─'.repeat(70));

  const enrichedRecords: any[] = [];
  let matchedCount = 0;
  let newCount = 0;

  for (let i = 0; i < masterFirewalls.length; i++) {
    const master = masterFirewalls[i];

    // Find matching ServiceNow device by serial number
    const snDevice = snDevices.find(d => {
      const snSerial = getDisplayValue(d.serial_number);
      return snSerial === master.serialNumber;
    });

    // Determine manufacturer from firewall name
    let manufacturer = '';
    if (master.firewallName.toLowerCase().includes('fortinet') || master.firewallName.toLowerCase().includes('fg')) {
      manufacturer = 'Fortinet';
    } else if (master.firewallName.toLowerCase().includes('sonicwall')) {
      manufacturer = 'Sonicwall';
    }

    // Try to find matching ServiceNow location
    let locationSysId = '';
    let locationName = master.location;

    if (snLocations.length > 0) {
      // Handle special naming variations
      let searchTerm = master.location.toLowerCase();

      // Map Amarillo locations to "AMA"
      if (searchTerm.includes('amarillo')) {
        searchTerm = 'ama';
      }

      // Map FortWorth to "Fort Worth" (with space)
      if (searchTerm === 'fortworth (eastchase)') {
        searchTerm = 'fort worth';
      }

      const matchingLocation = snLocations.find(loc => {
        const locName = getDisplayValue(loc.name).toLowerCase();
        const locCity = getDisplayValue(loc.city).toLowerCase();

        return locName.includes(searchTerm) ||
               locCity.includes(searchTerm) ||
               locName.includes(master.location.toLowerCase()) ||
               locCity.includes(master.location.toLowerCase());
      });

      if (matchingLocation) {
        locationSysId = getValue(matchingLocation.sys_id);
        locationName = getDisplayValue(matchingLocation.name);
      }
    }

    // Extract port numbers from URLs
    const publicPort = master.publicIP.match(/:(\d+)/)?.[1] || (master.publicIP.includes(':444') ? '444' : '4316');
    const internalPort = master.internalIP.match(/:(\d+)/)?.[1] || (master.internalIP.includes(':444') ? '444' : '8443');

    // Count physical interfaces from LAN port configuration
    const lanPortCount = master.lanPort ?
      master.lanPort.split(',').filter(p => p.trim()).length : 0;

    // Determine hardware OS
    const hardwareOS = manufacturer === 'Fortinet' ? 'FortiOS' :
                       manufacturer === 'Sonicwall' ? 'SonicOS Enhanced' : '';

    // Build comments field with management access information
    const comments = [
      `Web Management: ${master.publicIP} (external), ${master.internalIP} (internal)`,
      master.wanPort ? `WAN Port: ${master.wanPort}` : '',
      master.lanPort ? `LAN Ports: ${master.lanPort}` : '',
    ].filter(Boolean).join(' | ');

    // Build short description
    const shortDesc = `${manufacturer} ${master.model} firewall - ${master.location || 'Unknown'} location`;

    // Build ports field (Web and SSH)
    // SonicWall uses port 222 for SSH, Fortinet uses standard port 22
    const sshPort = manufacturer === 'Sonicwall' ? '222' : '22';
    const ports = `Web:${publicPort},SSH:${sshPort}`;

    // Parse warranty/license expiration (if available)
    let warrantyExpiration = '';
    if (master.license) {
      // Try to parse date from formats like "12/9/22", "11/18/27", "Expired 3/6/2020"
      const dateMatch = master.license.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (dateMatch) {
        const month = dateMatch[1].padStart(2, '0');
        const day = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        // Convert 2-digit year to 4-digit
        if (year.length === 2) {
          year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
        }
        warrantyExpiration = `${year}-${month}-${day}`;
      }
    }

    // Create enriched record
    const enriched = {
      index: i + 1,
      name: master.location ? `Altus - ${master.location}` : `Altus - Unknown ${i + 1}`,
      sys_id: snDevice ? getValue(snDevice.sys_id) : 'NEW',
      ip_address: master.internalIP.replace('https://', '').replace('http://', '').split(':')[0],
      serial_number: master.serialNumber,
      asset_tag: master.model ? `FW-${master.location || i + 1}` : '',
      manufacturer: manufacturer,
      model_id: master.model,
      location: locationName,
      location_sys_id: locationSysId || 'TODO: Add location sys_id',
      support_group: 'bccc73e7474ad91012702d12736d438c',
      managed_by: '',
      company: 'Altus Community Healthcare',
      operational_status: 'Operational',
      install_status: 'Installed',
      status: snDevice ? 'EXISTS' : 'NEW',
      public_ip: master.publicIP,
      firmware_version: master.firmwareVersion,
      comments: comments,
      short_description: shortDesc,
      ports: ports,
      physical_interface_count: lanPortCount > 0 ? lanPortCount : '',
      warranty_expiration: warrantyExpiration,
      hardware_os: hardwareOS,
      hardware_os_version: master.firmwareVersion,
    };

    enrichedRecords.push(enriched);

    if (snDevice) {
      matchedCount++;
      console.log(`  [${i + 1}] ✅ ${enriched.name} - MATCHED (${manufacturer} ${master.model})`);
    } else {
      newCount++;
      console.log(`  [${i + 1}] 🆕 ${enriched.name} - NEW (${manufacturer} ${master.model})`);
    }
  }

  console.log('');
  console.log(`Matched: ${matchedCount}, New: ${newCount}, Total: ${masterFirewalls.length}`);
  console.log('');

  // ========================================
  // Step 5: Generate Enriched CSV Template
  // ========================================
  console.log('Step 5: Generating Enriched CSV Template');
  console.log('─'.repeat(70));

  const headers = [
    'index',
    'status',
    'name',
    'sys_id',
    'ip_address',
    'public_ip',
    'serial_number',
    'asset_tag',
    'manufacturer',
    'model_id',
    'firmware_version',
    'location',
    'location_sys_id',
    'support_group',
    'managed_by',
    'company',
    'operational_status',
    'install_status',
    'comments',
    'short_description',
    'ports',
    'physical_interface_count',
    'warranty_expiration',
    'hardware_os',
    'hardware_os_version',
  ];

  const csvLines = [headers.join(',')];

  for (const record of enrichedRecords) {
    const row = headers.map(header => {
      const value = record[header] || '';
      // Escape and quote
      if (String(value).includes(',') || String(value).includes('"') || String(value).includes('\n')) {
        return `"${String(value).replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    csvLines.push(row.join(','));
  }

  const outputPath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'firewall-enrichment-template-auto.csv'
  );

  fs.writeFileSync(outputPath, csvLines.join('\n'));

  console.log(`✅ Enriched template created: ${outputPath}`);
  console.log('');

  // ========================================
  // Summary
  // ========================================
  console.log('─'.repeat(70));
  console.log('📊 ENRICHMENT SUMMARY');
  console.log('─'.repeat(70));
  console.log('');

  console.log(`Total Firewalls in Master File: ${masterFirewalls.length}`);
  console.log(`  ✅ Matched to ServiceNow: ${matchedCount}`);
  console.log(`  🆕 New (not in ServiceNow): ${newCount}`);
  console.log('');

  console.log('Auto-Populated Fields:');
  console.log('  ✅ Name');
  console.log('  ✅ IP Address (internal)');
  console.log('  ✅ Public IP');
  console.log('  ✅ Serial Number');
  console.log('  ✅ Manufacturer (Fortinet/Sonicwall)');
  console.log('  ✅ Model ID');
  console.log('  ✅ Firmware Version');
  console.log('  ✅ Asset Tag (standardized)');
  console.log('  ✅ Company (Altus Community Healthcare)');
  console.log('  ✅ Support Group (Network Engineers)');
  console.log('  ✅ Comments (management URLs & port config)');
  console.log('  ✅ Short Description');
  console.log('  ✅ Ports (Web & SSH)');
  console.log('  ✅ Physical Interface Count');
  console.log('  ✅ Warranty Expiration (license dates)');
  console.log('  ✅ Hardware OS & Version');
  console.log(`  ${snLocations.length > 0 ? '✅' : '⚠️ '} Location (mapped where possible)`);
  console.log('');

  console.log('Still Need to Fill In:');
  console.log('  ⚠️  Location sys_id (if not auto-mapped)');
  console.log('');

  console.log('📝 NEXT STEPS:');
  console.log('');
  console.log('1. Review the enriched template:');
  console.log(`   ${outputPath}`);
  console.log('');
  console.log('2. Verify the new fields:');
  console.log('   - comments (management URLs)');
  console.log('   - short_description');
  console.log('   - ports (Web & SSH)');
  console.log('   - physical_interface_count');
  console.log('   - warranty_expiration (license dates)');
  console.log('   - hardware_os & hardware_os_version');
  console.log('');
  console.log('3. Check location mapping:');
  console.log('   - Verify any "TODO: Add location sys_id" entries');
  console.log('');
  console.log('4. Review the NEW firewalls (status=NEW)');
  console.log(`   - ${newCount} firewalls not found in ServiceNow`);
  console.log('   - Ready to create in CMDB');
  console.log('');
  console.log('5. SECURITY NOTE:');
  console.log('   - Credentials NOT included in template (security best practice)');
  console.log('   - Store passwords in approved password vault');
  console.log('');
}

enrichFirewallsFromMaster()
  .catch(console.error)
  .finally(() => process.exit(0));
