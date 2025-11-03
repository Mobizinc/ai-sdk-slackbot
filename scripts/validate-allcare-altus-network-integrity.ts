/**
 * Validate Altus and Allcare Network Data Integrity
 *
 * Ensures no cross-customer contamination after network CI operations
 * Validates both Altus and Allcare have proper network topology
 *
 * USAGE:
 *   npx tsx scripts/validate-allcare-altus-network-integrity.ts
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function validateNetworkIntegrity() {
  console.log('✅ Validate Altus & Allcare Network Data Integrity');
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

  console.log('─'.repeat(70));
  console.log('🔵 ALTUS Data Validation');
  console.log('─'.repeat(70));
  console.log('');

  // Check Altus firewalls
  const altusFirewalls = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=company.nameLIKEAltus Community&sysparm_limit=1`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusFirewallsData = await altusFirewalls.json();
  const altusFirewallCount = altusFirewallsData.result?.length || 0;

  // Check Altus networks
  const altusNetworks = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=company.nameLIKEAltus&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusNetworksData = await altusNetworks.json();
  const altusNetworkCount = altusNetworksData.result?.length || 0;

  // Check Altus firewall→network relationships
  const altusRels = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.company.nameLIKEAltus Community^parent.sys_class_name=cmdb_ci_ip_firewall^child.sys_class_name=cmdb_ci_ip_network&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const altusRelsData = await altusRels.json();
  const altusRelCount = altusRelsData.result?.length || 0;

  console.log(`Altus Firewalls: ${altusFirewallCount}+`);
  console.log(`Altus Networks: ${altusNetworkCount}`);
  console.log(`Altus Firewall→Network Relationships: ${altusRelCount}+`);
  console.log('');

  console.log('─'.repeat(70));
  console.log('🟢 ALLCARE Data Validation');
  console.log('─'.repeat(70));
  console.log('');

  // Check Allcare firewalls (ACM-*)
  const allcareFirewalls = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=nameLIKEACM-^serial_number!=&sysparm_limit=100`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareFirewallsData = await allcareFirewalls.json();
  const allcareFirewallCount = allcareFirewallsData.result?.length || 0;

  // Check Allcare networks (by company: FPA, Hospitality, Cal Select, Allcare parent)
  const allcareNetworks = await fetch(
    `${instanceUrl}/api/now/table/cmdb_ci_ip_network?sysparm_query=company.nameLIKEFPA Women^ORcompany.nameLIKEHospitality Dental Group^ORcompany.nameLIKECal Select Dental^ORcompany=5231c90a97571550102c79200153af04&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareNetworksData = await allcareNetworks.json();
  const allcareNetworkCount = allcareNetworksData.result?.length || 0;

  // Check Allcare firewall→network relationships
  const allcareRels = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.nameLIKEACM-^child.sys_class_name=cmdb_ci_ip_network&sysparm_limit=200`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const allcareRelsData = await allcareRels.json();
  const allcareRelCount = allcareRelsData.result?.length || 0;

  console.log(`Allcare Firewalls (ACM-*): ${allcareFirewallCount}`);
  console.log(`Allcare Networks (FPA/HDG/CSD/Allcare): ${allcareNetworkCount}`);
  console.log(`Allcare Firewall→Network Relationships: ${allcareRelCount}`);
  console.log('');

  // Check for cross-contamination
  console.log('─'.repeat(70));
  console.log('🔍 Cross-Contamination Check');
  console.log('─'.repeat(70));
  console.log('');

  const crossCheck = await fetch(
    `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=parent.nameLIKEACM-^child.company.nameLIKEAltus&sysparm_limit=10`,
    { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
  );
  const crossCheckData = await crossCheck.json();
  const crossContamination = crossCheckData.result?.length || 0;

  if (crossContamination > 0) {
    console.log(`❌ CROSS-CONTAMINATION DETECTED: ${crossContamination} Allcare→Altus links`);
  } else {
    console.log(`✅ No cross-contamination: Allcare firewalls NOT linked to Altus networks`);
  }
  console.log('');

  // Quality Gates
  console.log('─'.repeat(70));
  console.log('🎯 Quality Gates');
  console.log('─'.repeat(70));
  console.log('');

  const altusPass = altusNetworkCount >= 25 && altusRelCount >= 25;
  const allcareFirewallsPass = allcareFirewallCount >= 33;
  const allcareNetworksPass = allcareNetworkCount >= 80;
  const allcareRelsPass = allcareRelCount >= 85;
  const noCrossContamination = crossContamination === 0;

  console.log(`Altus Data Intact (≥25 networks): ${altusPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Allcare Firewalls (≥33): ${allcareFirewallsPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Allcare Networks (≥80): ${allcareNetworksPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Allcare Relationships (≥85): ${allcareRelsPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`No Cross-Contamination: ${noCrossContamination ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  if (altusPass && allcareFirewallsPass && allcareNetworksPass && allcareRelsPass && noCrossContamination) {
    console.log('🎉 ALL QUALITY GATES PASSED!');
    console.log('');
    console.log('✅ Altus and Allcare network topology is complete and isolated');
  } else {
    console.log('⚠️  Some quality gates failed - review required');
  }
  console.log('');
}

validateNetworkIntegrity()
  .catch(console.error)
  .finally(() => process.exit(0));
