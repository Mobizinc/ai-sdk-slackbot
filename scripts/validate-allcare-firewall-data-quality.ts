/**
 * Validate Allcare Firewall Data Quality
 *
 * Generates before/after data quality report for Allcare firewalls
 * Validates FortiManager enrichment was successful
 *
 * USAGE:
 *   npx tsx scripts/validate-allcare-firewall-data-quality.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function validateAllcareFirewallDataQuality() {
  console.log('📊 Allcare Firewall Data Quality Validation');
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

  // Query all Allcare firewalls
  const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company.nameLIKEAllcare&sysparm_fields=name,serial_number,ip_address,operational_status,short_description,latitude,longitude,sys_class_name&sysparm_limit=100`;

  const response = await fetch(queryUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error(`❌ Failed to query ServiceNow: ${response.statusText}`);
    process.exit(1);
  }

  const data = await response.json();
  const firewalls = data.result || [];

  console.log(`Total Firewalls: ${firewalls.length}`);
  console.log('');

  // Data quality metrics
  let withSerial = 0;
  let withIP = 0;
  let withCoordinates = 0;
  let withCleanDescription = 0;
  let corrupted = 0;

  const issues: string[] = [];

  for (const fw of firewalls) {
    if (fw.serial_number && fw.serial_number.trim()) withSerial++;
    if (fw.ip_address && fw.ip_address.trim()) withIP++;
    if (fw.latitude && fw.longitude) withCoordinates++;

    if (fw.short_description) {
      if (fw.short_description.includes(':63555')) {
        corrupted++;
      } else if (fw.short_description.length > 10) {
        withCleanDescription++;
      }
    }

    // Flag issues
    if (!fw.serial_number || !fw.serial_number.trim()) {
      issues.push(`${fw.name}: Missing serial number`);
    }
    if (!fw.ip_address || !fw.ip_address.trim()) {
      issues.push(`${fw.name}: Missing IP address`);
    }
  }

  // Report
  console.log('─'.repeat(70));
  console.log('✅ Data Quality Metrics');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`Serial Numbers:      ${withSerial}/${firewalls.length} (${Math.round(withSerial/firewalls.length*100)}%)`);
  console.log(`IP Addresses:        ${withIP}/${firewalls.length} (${Math.round(withIP/firewalls.length*100)}%)`);
  console.log(`GPS Coordinates:     ${withCoordinates}/${firewalls.length} (${Math.round(withCoordinates/firewalls.length*100)}%)`);
  console.log(`Clean Descriptions:  ${withCleanDescription}/${firewalls.length} (${Math.round(withCleanDescription/firewalls.length*100)}%)`);
  console.log(`Corrupted Data:      ${corrupted}/${firewalls.length}`);
  console.log('');

  // FortiGate vs Non-FortiGate
  const fortigate = firewalls.filter((fw: any) => fw.name.includes('ACM-') || fw.name.includes('FortiGate'));
  const nonFortigate = firewalls.filter((fw: any) => !fw.name.includes('ACM-') && !fw.name.includes('FortiGate'));

  console.log('─'.repeat(70));
  console.log('📦 Device Breakdown');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`FortiGate Devices:   ${fortigate.length}`);
  console.log(`Other Devices:       ${nonFortigate.length}`);
  if (nonFortigate.length > 0) {
    console.log('');
    console.log('Non-FortiGate Devices:');
    nonFortigate.forEach((fw: any) => {
      console.log(`  - ${fw.name} (${fw.sys_class_name || 'unknown type'})`);
    });
  }
  console.log('');

  if (issues.length > 0) {
    console.log('─'.repeat(70));
    console.log('⚠️  Data Quality Issues');
    console.log('─'.repeat(70));
    console.log('');
    issues.forEach(issue => console.log(`  ${issue}`));
    console.log('');
  } else {
    console.log('─'.repeat(70));
    console.log('✅ No Data Quality Issues Found!');
    console.log('─'.repeat(70));
    console.log('');
  }

  // Success criteria
  const passSerial = withSerial >= firewalls.length * 0.9;
  const passIP = withIP >= firewalls.length * 0.9;
  const passClean = corrupted === 0;

  console.log('─'.repeat(70));
  console.log('🎯 Quality Gates');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`Serial Numbers ≥90%:  ${passSerial ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`IP Addresses ≥90%:    ${passIP ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`No Corrupted Data:    ${passClean ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  if (passSerial && passIP && passClean) {
    console.log('🎉 ALL QUALITY GATES PASSED!');
  } else {
    console.log('⚠️  Some quality gates failed - review required');
  }
  console.log('');
}

validateAllcareFirewallDataQuality()
  .catch(console.error)
  .finally(() => process.exit(0));
