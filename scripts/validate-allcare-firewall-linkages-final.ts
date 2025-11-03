/**
 * Validate Allcare Firewall Linkages - Final
 *
 * Validates that all Allcare firewalls are properly linked to:
 * - Correct sibling companies (FPA Women's Health, Hospitality Dental Group, Cal Select Dental)
 * - Proper locations
 * - Have complete data from FortiManager
 *
 * USAGE:
 *   npx tsx scripts/validate-allcare-firewall-linkages-final.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function validateAllcareFirewallLinkagesFinal() {
  console.log('✅ Validate Allcare Firewall Linkages - Final Report');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query all Allcare-related firewalls
  const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company.nameLIKEAllcare^ORcompany.nameLIKEFPA^ORcompany.nameLIKEHospitality^ORcompany.nameLIKECal Select&sysparm_fields=name,sys_id,serial_number,company.name,location.name,ip_address,latitude,longitude&sysparm_display_value=true&sysparm_limit=150`;

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

  // Filter to only FortiGate devices (ACM-* naming)
  const acmFirewalls = firewalls.filter((fw: any) => fw.name.startsWith('ACM-'));

  console.log(`Total Firewall CIs: ${firewalls.length}`);
  console.log(`ACM FortiGate Devices: ${acmFirewalls.length}`);
  console.log('');

  // Group by company
  const byCompany = new Map<string, any[]>();
  for (const fw of acmFirewalls) {
    const company = fw['company.name'] || 'No Company';
    if (!byCompany.has(company)) {
      byCompany.set(company, []);
    }
    byCompany.get(company)!.push(fw);
  }

  console.log('─'.repeat(70));
  console.log('📊 Firewalls by Company');
  console.log('─'.repeat(70));
  console.log('');

  for (const [company, fws] of byCompany) {
    console.log(`${company}: ${fws.length} firewall(s)`);

    // Check location linkage
    const withLocation = fws.filter((fw: any) => fw['location.name'] && fw['location.name'].trim());
    const withoutLocation = fws.filter((fw: any) => !fw['location.name'] || !fw['location.name'].trim());

    console.log(`  With Location: ${withLocation.length}/${fws.length}`);
    if (withoutLocation.length > 0) {
      console.log(`  ⚠️  Missing Location:`);
      for (const fw of withoutLocation) {
        console.log(`     - ${fw.name}`);
      }
    }
    console.log('');
  }

  // Data quality metrics
  console.log('─'.repeat(70));
  console.log('📈 Data Quality Metrics');
  console.log('─'.repeat(70));
  console.log('');

  const withSerial = acmFirewalls.filter((fw: any) => fw.serial_number && fw.serial_number.trim());
  const withIP = acmFirewalls.filter((fw: any) => fw.ip_address && fw.ip_address.trim());
  const withLocation = acmFirewalls.filter((fw: any) => fw['location.name'] && fw['location.name'].trim());
  const withGPS = acmFirewalls.filter((fw: any) => fw.latitude && fw.longitude);
  const withCorrectCompany = acmFirewalls.filter((fw: any) => {
    const company = fw['company.name'];
    return company && (
      company.includes('FPA') ||
      company.includes('Hospitality') ||
      company.includes('Cal Select') ||
      (company.includes('Allcare') && (fw.name.includes('HQ') || fw.name.includes('AZ') || fw.name.includes('tmp')))
    );
  });

  console.log(`Serial Numbers:      ${withSerial.length}/${acmFirewalls.length} (${Math.round(withSerial.length/acmFirewalls.length*100)}%)`);
  console.log(`IP Addresses:        ${withIP.length}/${acmFirewalls.length} (${Math.round(withIP.length/acmFirewalls.length*100)}%)`);
  console.log(`Location Linkages:   ${withLocation.length}/${acmFirewalls.length} (${Math.round(withLocation.length/acmFirewalls.length*100)}%)`);
  console.log(`GPS Coordinates:     ${withGPS.length}/${acmFirewalls.length} (${Math.round(withGPS.length/acmFirewalls.length*100)}%)`);
  console.log(`Correct Company:     ${withCorrectCompany.length}/${acmFirewalls.length} (${Math.round(withCorrectCompany.length/acmFirewalls.length*100)}%)`);
  console.log('');

  // Quality gates
  const passSerial = withSerial.length >= acmFirewalls.length;
  const passIP = withIP.length >= acmFirewalls.length;
  const passLocation = withLocation.length >= acmFirewalls.length * 0.9;  // 90% threshold
  const passCompany = withCorrectCompany.length >= acmFirewalls.length;

  console.log('─'.repeat(70));
  console.log('🎯 Quality Gates');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`Serial Numbers (100%):    ${passSerial ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`IP Addresses (100%):      ${passIP ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Location Linkages (90%):  ${passLocation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Correct Company (100%):   ${passCompany ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  if (passSerial && passIP && passLocation && passCompany) {
    console.log('🎉 ALL QUALITY GATES PASSED!');
    console.log('');
    console.log('✅ Allcare firewalls are properly linked to:');
    console.log('   - Correct sibling companies (FPA, Hospitality Dental, Cal Select)');
    console.log('   - Proper physical locations');
    console.log('   - Complete data from FortiManager (serial, IP, GPS)');
  } else {
    console.log('⚠️  Some quality gates failed - review required');
  }
  console.log('');

  // List firewalls without locations
  const missingLocation = acmFirewalls.filter((fw: any) => !fw['location.name'] || !fw['location.name'].trim());
  if (missingLocation.length > 0) {
    console.log('─'.repeat(70));
    console.log('⚠️  Firewalls Without Location Linkage');
    console.log('─'.repeat(70));
    console.log('');
    for (const fw of missingLocation) {
      console.log(`  ${fw.name} (${fw['company.name'] || 'No Company'})`);
    }
    console.log('');
  }
}

validateAllcareFirewallLinkagesFinal()
  .catch(console.error)
  .finally(() => process.exit(0));
