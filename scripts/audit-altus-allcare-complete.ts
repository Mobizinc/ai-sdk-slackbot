/**
 * Complete Altus & Allcare Data Integrity Audit
 *
 * Comprehensive audit of all CMDB changes for both customers
 * Identifies: duplicates, contamination, incorrect linkages, data quality issues
 *
 * USAGE:
 *   npx tsx scripts/audit-altus-allcare-complete.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function auditAltusAllcareComplete() {
  console.log('🔍 Complete Altus & Allcare Data Integrity Audit');
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

  const issues: string[] = [];
  const warnings: string[] = [];

  // ========================================
  // PHASE 1: ALTUS DATA INTEGRITY
  // ========================================
  console.log('📘 PHASE 1: ALTUS DATA INTEGRITY CHECK');
  console.log('='.repeat(70));
  console.log('');

  // Altus firewalls
  const altusFirewalls = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company=c3eec28c931c9a1049d9764efaba10f3&sysparm_fields=name,sys_id&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusFirewallsData = await altusFirewalls.json();
  const altusFirewallCount = altusFirewallsData.result?.length || 0;

  console.log(`Altus Firewalls: ${altusFirewallCount}`);
  if (altusFirewallCount !== 29) {
    issues.push(`Altus firewall count changed! Expected 29, found ${altusFirewallCount}`);
  }

  // Altus networks
  const altusNetworks = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=company=c3eec28c931c9a1049d9764efaba10f3&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusNetworksData = await altusNetworks.json();
  const altusNetworkCount = altusNetworksData.result?.length || 0;

  console.log(`Altus Networks: ${altusNetworkCount}`);
  if (altusNetworkCount !== 30) {
    issues.push(`Altus network count changed! Expected 30, found ${altusNetworkCount}`);
  }

  // Altus firewall→network relationships
  const altusFirewallNetRels = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.company=c3eec28c931c9a1049d9764efaba10f3^parent.sys_class_name=cmdb_ci_ip_firewall^child.sys_class_name=cmdb_ci_ip_network&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusFirewallNetRelsData = await altusFirewallNetRels.json();
  const altusFirewallNetRelCount = altusFirewallNetRelsData.result?.length || 0;

  console.log(`Altus Firewall→Network Relationships: ${altusFirewallNetRelCount}`);

  // Check for Allcare contamination in Altus
  const altusAllcareContam = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.company=c3eec28c931c9a1049d9764efaba10f3^child.company.nameLIKEAllcare^child.company.nameLIKEFPA^child.company.nameLIKEHospitality^child.company.nameLIKECal Select&sysparm_limit=10`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusAllcareContamData = await altusAllcareContam.json();
  const altusContamCount = altusAllcareContamData.result?.length || 0;

  console.log(`Altus→Allcare Contamination: ${altusContamCount}`);
  if (altusContamCount > 0) {
    issues.push(`CRITICAL: Altus resources linked to Allcare resources (${altusContamCount} relationships)`);
  }

  console.log('');

  // ========================================
  // PHASE 2: ALLCARE FIREWALL AUDIT
  // ========================================
  console.log('📗 PHASE 2: ALLCARE FIREWALL AUDIT');
  console.log('='.repeat(70));
  console.log('');

  // All ACM-* firewalls
  const acmFirewalls = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=nameLIKEACM-&sysparm_fields=name,sys_id,serial_number,company,location&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const acmFirewallsData = await acmFirewalls.json();
  const acmFirewallsList = acmFirewallsData.result || [];

  console.log(`Total ACM-* Firewalls: ${acmFirewallsList.length}`);

  // Check for duplicates (same name)
  const nameCount = new Map();
  for (const fw of acmFirewallsList) {
    nameCount.set(fw.name, (nameCount.get(fw.name) || 0) + 1);
  }
  const duplicates = Array.from(nameCount.entries()).filter(([name, count]) => count > 1);

  console.log(`Duplicate Names: ${duplicates.length}`);
  if (duplicates.length > 0) {
    for (const [name, count] of duplicates) {
      issues.push(`Duplicate firewall: ${name} (${count} entries)`);
    }
  }

  // Check serial numbers
  const withSerial = acmFirewallsList.filter(fw => fw.serial_number && fw.serial_number.trim()).length;
  console.log(`With Serial Numbers: ${withSerial}/${acmFirewallsList.length}`);

  // Check locations
  const withLocation = acmFirewallsList.filter(fw => fw.location && (fw.location.value || fw.location)).length;
  console.log(`With Location: ${withLocation}/${acmFirewallsList.length}`);

  // Check company distribution
  const byCompany = new Map();
  for (const fw of acmFirewallsList) {
    const company = fw.company?.value || fw.company || 'NO_COMPANY';
    byCompany.set(company, (byCompany.get(company) || 0) + 1);
  }

  console.log('');
  console.log('By Company:');
  for (const [company, count] of byCompany) {
    console.log(`  ${company}: ${count}`);
  }
  console.log('');

  // ========================================
  // PHASE 3: ALLCARE NETWORK AUDIT
  // ========================================
  console.log('📗 PHASE 3: ALLCARE NETWORK AUDIT');
  console.log('='.repeat(70));
  console.log('');

  // Allcare networks
  const allcareNetworks = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=company=ebf393e683ab8e1068537cdfeeaad3c6^ORcompany=9aa1454a97571550102c79200153afbb^ORcompany=9c14d3e683ab8e1068537cdfeeaad35a^ORcompany=5231c90a97571550102c79200153af04&sysparm_fields=name,sys_id,company,location,network_address,netmask&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareNetworksData = await allcareNetworks.json();
  const allcareNetworksList = allcareNetworksData.result || [];

  console.log(`Allcare Network CIs: ${allcareNetworksList.length}`);

  // Check for networks without location
  const netsWithoutLocation = allcareNetworksList.filter(n => !n.location || !(n.location.value || n.location)).length;
  console.log(`Networks WITHOUT Location: ${netsWithoutLocation}`);
  if (netsWithoutLocation > 0) {
    warnings.push(`${netsWithoutLocation} Allcare networks have no location field`);
  }

  // Check for corrupted company field
  const netsWithBadCompany = allcareNetworksList.filter(n => {
    const company = n.company?.value || n.company || '';
    return typeof company === 'string' && company.includes('{display_value=');
  }).length;

  console.log(`Networks with Corrupted Company: ${netsWithBadCompany}`);
  if (netsWithBadCompany > 0) {
    issues.push(`CRITICAL: ${netsWithBadCompany} networks have corrupted company field`);
  }
  console.log('');

  // ========================================
  // PHASE 4: RELATIONSHIP AUDIT
  // ========================================
  console.log('📗 PHASE 4: RELATIONSHIP AUDIT');
  console.log('='.repeat(70));
  console.log('');

  // Allcare firewall→network relationships
  const allcareFirewallNetRels = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.nameLIKEACM-^child.sys_class_name=cmdb_ci_ip_network&sysparm_fields=parent,child,parent.location,child.location&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareFirewallNetRelsData = await allcareFirewallNetRels.json();
  const allcareFirewallNetRelsList = allcareFirewallNetRelsData.result || [];

  console.log(`Allcare Firewall→Network Relationships: ${allcareFirewallNetRelsList.length}`);

  // Check for location mismatches
  const locationMismatches = allcareFirewallNetRelsList.filter(rel => {
    const fwLoc = rel.parent?.location?.value || rel.parent?.location;
    const netLoc = rel.child?.location?.value || rel.child?.location;
    return fwLoc && netLoc && fwLoc !== netLoc;
  }).length;

  console.log(`Location Mismatches (FW location ≠ Network location): ${locationMismatches}`);
  if (locationMismatches > 0) {
    issues.push(`${locationMismatches} firewall→network relationships have mismatched locations`);
  }

  // Allcare VPN relationships
  const allcareVPNRels = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.name=ACM-AZ-FW01^child.nameLIKEACM-&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareVPNRelsData = await allcareVPNRels.json();
  const allcareVPNRelCount = allcareVPNRelsData.result?.length || 0;

  console.log(`Allcare VPN Tunnel Relationships: ${allcareVPNRelCount}`);
  if (allcareVPNRelCount < 25) {
    warnings.push(`Low VPN tunnel count: Expected ~30, found ${allcareVPNRelCount}`);
  }
  console.log('');

  // ========================================
  // PHASE 5: CROSS-CONTAMINATION CHECK
  // ========================================
  console.log('🔴 PHASE 5: CROSS-CUSTOMER CONTAMINATION CHECK');
  console.log('='.repeat(70));
  console.log('');

  // Allcare→Altus contamination
  const allcareAltusContam = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.nameLIKEACM-^child.company=c3eec28c931c9a1049d9764efaba10f3&sysparm_limit=50`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareAltusContamData = await allcareAltusContam.json();
  const allcareAltusCount = allcareAltusContamData.result?.length || 0;

  console.log(`Allcare→Altus Contamination: ${allcareAltusCount}`);
  if (allcareAltusCount > 0) {
    issues.push(`CRITICAL: ${allcareAltusCount} Allcare firewalls linked to Altus resources`);
  }

  console.log(`Altus→Allcare Contamination: ${altusContamCount}`);
  if (altusContamCount > 0) {
    issues.push(`CRITICAL: ${altusContamCount} Altus firewalls linked to Allcare resources`);
  }
  console.log('');

  // ========================================
  // SUMMARY & REPORT
  // ========================================
  console.log('='.repeat(70));
  console.log('📊 AUDIT SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  console.log('ALTUS:');
  console.log(`  Firewalls: ${altusFirewallCount} ${altusFirewallCount === 29 ? '✅' : '❌'}`);
  console.log(`  Networks: ${altusNetworkCount} ${altusNetworkCount === 30 ? '✅' : '❌'}`);
  console.log(`  FW→Network Rels: ${altusFirewallNetRelCount}`);
  console.log('');

  console.log('ALLCARE:');
  console.log(`  Firewalls: ${acmFirewalls.length} ${acmFirewalls.length === 34 ? '✅' : '❌'}`);
  console.log(`  Duplicate Names: ${duplicates.length} ${duplicates.length === 0 ? '✅' : '❌'}`);
  console.log(`  With Serial: ${withSerial}/${acmFirewalls.length}`);
  console.log(`  With Location: ${withLocation}/${acmFirewalls.length}`);
  console.log(`  Networks: ${allcareNetworksList.length}`);
  console.log(`  FW→Network Rels: ${allcareFirewallNetRelsList.length}`);
  console.log(`  VPN Tunnels: ${allcareVPNRelCount}`);
  console.log('');

  console.log('CROSS-CONTAMINATION:');
  console.log(`  Allcare→Altus: ${allcareAltusCount} ${allcareAltusCount === 0 ? '✅' : '❌'}`);
  console.log(`  Altus→Allcare: ${altusContamCount} ${altusContamCount === 0 ? '✅' : '❌'}`);
  console.log('');

  // Issues and Warnings
  if (issues.length > 0) {
    console.log('─'.repeat(70));
    console.log('❌ CRITICAL ISSUES FOUND');
    console.log('─'.repeat(70));
    console.log('');
    issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('─'.repeat(70));
    console.log('⚠️  WARNINGS');
    console.log('─'.repeat(70));
    console.log('');
    warnings.forEach((warn, i) => console.log(`${i + 1}. ${warn}`));
    console.log('');
  }

  // Final verdict
  console.log('='.repeat(70));
  console.log('🎯 FINAL VERDICT');
  console.log('='.repeat(70));
  console.log('');

  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ PASS - All data integrity checks passed!');
    console.log('');
    console.log('Altus and Allcare data is clean and properly isolated.');
  } else {
    console.log('❌ FAIL - Data integrity issues detected');
    console.log('');
    console.log(`Critical Issues: ${issues.length}`);
    console.log(`Warnings: ${warnings.length}`);
    console.log('');
    console.log('Remediation required before production sign-off.');
  }
  console.log('');

  // Save audit report
  const reportPath = path.join(process.cwd(), 'backup', 'audit-reports', 'altus-allcare-audit-report.json');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true});
  }

  const report = {
    audit_date: new Date().toISOString(),
    altus: {
      firewalls: altusFirewallCount,
      networks: altusNetworkCount,
      firewall_network_relationships: altusFirewallNetRelCount
    },
    allcare: {
      firewalls: acmFirewallsList.length,
      duplicates: duplicates.length,
      with_serial: withSerial,
      with_location: withLocation,
      networks: allcareNetworksList.length,
      firewall_network_relationships: allcareFirewallNetRelsList.length,
      vpn_tunnels: allcareVPNRelCount,
      location_mismatches: locationMismatches
    },
    contamination: {
      allcare_to_altus: allcareAltusCount,
      altus_to_allcare: altusContamCount
    },
    issues: issues,
    warnings: warnings,
    verdict: issues.length === 0 && warnings.length === 0 ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Audit report saved: ${reportPath}`);
  console.log('');
}

auditAltusAllcareComplete()
  .catch(console.error)
  .finally(() => process.exit(0));
