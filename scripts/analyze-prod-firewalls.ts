/**
 * Analyze PROD Firewall Export (READ-ONLY)
 *
 * Reads the exported production network_devices.json file and shows:
 * - What fields are populated vs missing
 * - A clean summary of each firewall
 * - What data needs to be added for proper CMDB configuration
 *
 * This script is READ-ONLY and analyzes the export file.
 *
 * Input: backup/altus-export-2025-10-15/production/network_devices.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface NetworkDevice {
  name: any;
  sys_id: any;
  ip_address: any;
  serial_number: any;
  asset_tag: any;
  manufacturer: any;
  model_id: any;
  model_number: any;
  location: any;
  support_group: any;
  managed_by: any;
  company: any;
  operational_status: any;
  install_status: any;
  host_name: any;
  dns_name: any;
  mac_address: any;
  firewall_type: any;
  firmware_version: any;
  short_description: any;
  [key: string]: any;
}

// Helper to extract display value from ServiceNow response field
function getDisplayValue(field: any): string {
  if (!field) return '';
  if (typeof field === 'object' && field.display_value !== undefined) {
    return field.display_value || '';
  }
  return String(field || '');
}

// Helper to extract sys_id value
function getValue(field: any): string {
  if (!field) return '';
  if (typeof field === 'object' && field.value !== undefined) {
    return field.value || '';
  }
  return String(field || '');
}

async function analyzeProdFirewalls() {
  console.log('🔍 Analyzing PROD Firewall Export');
  console.log('='.repeat(70));
  console.log('');

  // Read the exported JSON file
  const exportPath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'production',
    'network_devices.json'
  );

  if (!fs.existsSync(exportPath)) {
    console.error('❌ Export file not found:', exportPath);
    console.log('   Run scripts/export-altus-cmdb-complete.ts first');
    process.exit(1);
  }

  console.log('Reading:', exportPath);
  console.log('');

  const rawData = fs.readFileSync(exportPath, 'utf-8');
  const devices: NetworkDevice[] = JSON.parse(rawData);

  console.log(`Found ${devices.length} network device(s)`);
  console.log('');
  console.log('─'.repeat(70));
  console.log('');

  // Critical fields that should be populated
  const criticalFields = [
    'name',
    'ip_address',
    'company',
    'operational_status',
    'install_status',
    'asset_tag',
    'serial_number',
    'manufacturer',
    'model_id',
    'location',
    'support_group',
    'managed_by',
  ];

  const deviceSummaries: any[] = [];

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];

    const summary = {
      index: i + 1,
      name: getDisplayValue(device.name),
      sys_id: getValue(device.sys_id),
      ip_address: getDisplayValue(device.ip_address),
      serial_number: getDisplayValue(device.serial_number),
      asset_tag: getDisplayValue(device.asset_tag),
      manufacturer: getDisplayValue(device.manufacturer),
      model_id: getDisplayValue(device.model_id),
      model_number: getDisplayValue(device.model_number),
      location: getDisplayValue(device.location),
      support_group: getDisplayValue(device.support_group),
      managed_by: getDisplayValue(device.managed_by),
      company: getDisplayValue(device.company),
      operational_status: getDisplayValue(device.operational_status),
      install_status: getDisplayValue(device.install_status),
      host_name: getDisplayValue(device.host_name),
      dns_name: getDisplayValue(device.dns_name),
      mac_address: getDisplayValue(device.mac_address),
      firewall_type: getDisplayValue(device.firewall_type),
      firmware_version: getDisplayValue(device.firmware_version),
      short_description: getDisplayValue(device.short_description),
      missing_critical: [] as string[],
    };

    // Check for missing critical fields
    for (const field of criticalFields) {
      const value = summary[field as keyof typeof summary];
      if (!value || String(value).trim() === '') {
        summary.missing_critical.push(field);
      }
    }

    deviceSummaries.push(summary);

    console.log(`[${summary.index}] ${summary.name || 'UNNAMED'}`);
    console.log(`    sys_id: ${summary.sys_id}`);
    console.log(`    IP Address: ${summary.ip_address || '❌ MISSING'}`);
    console.log(`    Serial Number: ${summary.serial_number || '❌ MISSING'}`);
    console.log(`    Asset Tag: ${summary.asset_tag || '❌ MISSING'}`);
    console.log(`    Manufacturer: ${summary.manufacturer || '❌ MISSING'}`);
    console.log(`    Model: ${summary.model_id || summary.model_number || '❌ MISSING'}`);
    console.log(`    Location: ${summary.location || '❌ MISSING'}`);
    console.log(`    Support Group: ${summary.support_group || '❌ MISSING'}`);
    console.log(`    Managed By: ${summary.managed_by || '❌ MISSING'}`);
    console.log(`    Company: ${summary.company || '❌ MISSING'}`);
    console.log(`    Operational Status: ${summary.operational_status || '❌ MISSING'}`);
    console.log(`    Install Status: ${summary.install_status || '❌ MISSING'}`);
    console.log('');
    console.log('    Additional Info:');
    console.log(`      Hostname: ${summary.host_name || 'None'}`);
    console.log(`      DNS: ${summary.dns_name || 'None'}`);
    console.log(`      MAC: ${summary.mac_address || 'None'}`);
    console.log(`      Type: ${summary.firewall_type || 'None'}`);
    console.log(`      Firmware: ${summary.firmware_version || 'None'}`);
    console.log(`      Description: ${summary.short_description || 'None'}`);
    console.log('');
    console.log(`    Missing Critical Fields (${summary.missing_critical.length}/${criticalFields.length}):`);
    if (summary.missing_critical.length > 0) {
      console.log(`      ${summary.missing_critical.join(', ')}`);
    } else {
      console.log('      ✅ All critical fields populated');
    }
    console.log('');
    console.log('─'.repeat(70));
    console.log('');
  }

  // ========================================
  // Summary Statistics
  // ========================================
  console.log('📊 SUMMARY STATISTICS');
  console.log('─'.repeat(70));
  console.log('');

  const fieldStats = new Map<string, { populated: number; missing: number }>();

  for (const field of criticalFields) {
    fieldStats.set(field, { populated: 0, missing: 0 });
  }

  for (const summary of deviceSummaries) {
    for (const field of criticalFields) {
      const value = summary[field];
      const stats = fieldStats.get(field)!;
      if (value && String(value).trim() !== '') {
        stats.populated++;
      } else {
        stats.missing++;
      }
    }
  }

  console.log('Field Population:');
  console.log('');

  for (const [field, stats] of fieldStats) {
    const percent = Math.round((stats.populated / devices.length) * 100);
    const status = stats.populated === devices.length ? '✅' : '❌';
    console.log(`  ${status} ${field.padEnd(20)} ${stats.populated}/${devices.length} (${percent}%)`);
  }

  console.log('');

  // ========================================
  // Recommendations
  // ========================================
  console.log('─'.repeat(70));
  console.log('💡 CLEANUP RECOMMENDATIONS');
  console.log('─'.repeat(70));
  console.log('');

  const avgMissing =
    deviceSummaries.reduce((sum, s) => sum + s.missing_critical.length, 0) /
    deviceSummaries.length;

  console.log(`Average Missing Critical Fields: ${avgMissing.toFixed(1)}/${criticalFields.length}`);
  console.log('');

  // Find most commonly missing fields
  const missingCounts = new Map<string, number>();
  for (const summary of deviceSummaries) {
    for (const field of summary.missing_critical) {
      missingCounts.set(field, (missingCounts.get(field) || 0) + 1);
    }
  }

  const sortedMissing = Array.from(missingCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log('Most Commonly Missing Fields:');
  for (const [field, count] of sortedMissing) {
    console.log(`  ${field}: Missing in ${count}/${devices.length} devices`);
  }
  console.log('');

  console.log('📝 NEXT STEPS:');
  console.log('');
  console.log('1. Gather missing information:');
  console.log('   - Physical locations for these firewalls');
  console.log('   - Support group responsible for network devices');
  console.log('   - Managed by (person or team)');
  console.log('   - Manufacturer and model details');
  console.log('   - Proper asset tags');
  console.log('');
  console.log('2. Create enrichment template:');
  console.log('   - Export this data to a template CSV');
  console.log('   - Fill in missing fields');
  console.log('   - Use template to create clean records in DEV');
  console.log('');
  console.log('3. Create DEV records with complete data');
  console.log('');
  console.log('4. Validate in DEV, then replicate to PROD');
  console.log('');

  // ========================================
  // Generate Enrichment Template
  // ========================================
  console.log('─'.repeat(70));
  console.log('📝 GENERATING ENRICHMENT TEMPLATE');
  console.log('─'.repeat(70));
  console.log('');

  const templatePath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'firewall-enrichment-template.csv'
  );

  const headers = [
    'index',
    'name',
    'sys_id',
    'ip_address',
    'serial_number',
    'asset_tag',
    'manufacturer',
    'model_id',
    'location',
    'support_group',
    'managed_by',
    'company',
    'operational_status',
    'install_status',
    'missing_fields',
  ];

  const csvLines = [headers.join(',')];

  for (const summary of deviceSummaries) {
    const row = [
      summary.index,
      `"${summary.name || ''}"`,
      summary.sys_id,
      `"${summary.ip_address || ''}"`,
      `"${summary.serial_number || ''}"`,
      `"${summary.asset_tag || ''}"`,
      `"${summary.manufacturer || ''}"`,
      `"${summary.model_id || summary.model_number || ''}"`,
      `"${summary.location || 'TODO: Add location'}"`,
      `"${summary.support_group || 'TODO: Add support group'}"`,
      `"${summary.managed_by || 'TODO: Add managed by'}"`,
      `"${summary.company || 'TODO: Add company (Altus Health ACCT0010145)'}"`,
      `"${summary.operational_status || 'Operational'}"`,
      `"${summary.install_status || 'Installed'}"`,
      `"${summary.missing_critical.join('; ')}"`,
    ];
    csvLines.push(row.join(','));
  }

  fs.writeFileSync(templatePath, csvLines.join('\n'));

  console.log('✅ Enrichment template created:');
  console.log(`   ${templatePath}`);
  console.log('');
  console.log('Open this file in Excel and fill in the TODO fields.');
  console.log('');
}

analyzeProdFirewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
