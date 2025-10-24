/**
 * Ultimate Service Offering Diagnostic Script
 *
 * Comprehensive investigation to determine why Service Offerings
 * are not appearing in the incident lookup.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function ultimateDiagnostic() {
  console.log('🔬 ULTIMATE SERVICE OFFERING DIAGNOSTIC');
  console.log('='.repeat(100));
  console.log('');

  const findings: string[] = [];
  const issues: string[] = [];

  // ========================================
  // CHECK 1: Dictionary Entry Status
  // ========================================
  console.log('CHECK 1: Dictionary Entry for task.service_offering');
  console.log('─'.repeat(100));

  const dictUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=task^element=service_offering&sysparm_fields=sys_id,name,element,reference,ref_qual,dependent&sysparm_limit=5`;

  const dictResp = await fetch(dictUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const dictData = await dictResp.json();

  if (!dictData.result || dictData.result.length === 0) {
    issues.push('❌ CRITICAL: No dictionary entry found for task.service_offering');
    console.log('❌ No dictionary entry found!');
  } else {
    console.log(`Found ${dictData.result.length} dictionary entry(ies):`);
    dictData.result.forEach((entry: any, i: number) => {
      console.log(`\nEntry ${i + 1}:`);
      console.log(`  sys_id: ${entry.sys_id}`);
      console.log(`  name (table): ${entry.name}`);
      console.log(`  element (field): ${entry.element}`);
      console.log(`  reference (target table): ${entry.reference}`);
      console.log(`  ref_qual (reference qualifier): ${entry.ref_qual || '(empty)'}`);
      console.log(`  dependent: ${entry.dependent || '(none)'}`);

      if (!entry.ref_qual || entry.ref_qual === '') {
        findings.push('⚠️  Reference qualifier is EMPTY - this will show ALL records from target table');
      } else {
        findings.push(`✅ Reference qualifier is set to: ${entry.ref_qual}`);
      }
    });
  }

  console.log('');

  // ========================================
  // CHECK 2: Incident Current State
  // ========================================
  console.log('CHECK 2: Incident INC0167770 Current State');
  console.log('─'.repeat(100));

  const incUrl = `${instanceUrl}/api/now/table/incident?sysparm_query=number=INC0167770&sysparm_fields=sys_id,number,business_service,service_offering&sysparm_display_value=all&sysparm_limit=1`;

  const incResp = await fetch(incUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const incData = await incResp.json();

  let businessServiceSysId = '';
  let businessServiceName = '';

  if (!incData.result || incData.result.length === 0) {
    issues.push('❌ CRITICAL: Incident INC0167770 not found');
    console.log('❌ Incident not found!');
  } else {
    const incident = incData.result[0];
    businessServiceSysId = incident.business_service?.value || '';
    businessServiceName = incident.business_service?.display_value || '';

    console.log('Incident Details:');
    console.log(`  Number: ${incident.number?.value || incident.number}`);
    console.log(`  business_service (display): ${businessServiceName}`);
    console.log(`  business_service (sys_id): ${businessServiceSysId}`);
    console.log(`  service_offering (current): ${incident.service_offering?.display_value || '(empty)'}`);

    if (!businessServiceSysId) {
      issues.push('⚠️  Incident has NO business_service - reference qualifier will fail');
    } else {
      findings.push(`✅ Incident has business_service: ${businessServiceName}`);
    }
  }

  console.log('');

  // ========================================
  // CHECK 3: ALL Service Offerings
  // ========================================
  console.log('CHECK 3: All Service Offerings in System');
  console.log('─'.repeat(100));

  const allSoUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_fields=sys_id,name,parent,sys_class_name,install_status,operational_status&sysparm_display_value=all&sysparm_limit=50`;

  const allSoResp = await fetch(allSoUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const allSoData = await allSoResp.json();

  if (!allSoData.result || allSoData.result.length === 0) {
    issues.push('❌ CRITICAL: NO Service Offerings found in system');
    console.log('❌ No Service Offerings found!');
  } else {
    console.log(`Found ${allSoData.result.length} Service Offering(s):\n`);

    let managedSupportCount = 0;

    allSoData.result.forEach((so: any, i: number) => {
      const name = so.name?.display_value || so.name;
      const parentName = so.parent?.display_value || so.parent || '(no parent)';
      const parentSysId = so.parent?.value || '';
      const className = so.sys_class_name?.display_value || so.sys_class_name;
      const installStatus = so.install_status?.display_value || so.install_status;
      const operationalStatus = so.operational_status?.display_value || so.operational_status;

      console.log(`${i + 1}. ${name}`);
      console.log(`   Parent: ${parentName}`);
      console.log(`   Parent sys_id: ${parentSysId}`);
      console.log(`   Class: ${className}`);
      console.log(`   Install Status: ${installStatus}`);
      console.log(`   Operational Status: ${operationalStatus}`);
      console.log('');

      if (parentName.includes('Managed Support Services') || parentName.includes('Managed Application Service')) {
        managedSupportCount++;
      }

      // Check for issues
      if (!parentSysId) {
        issues.push(`⚠️  Service Offering "${name}" has NO parent`);
      }
    });

    findings.push(`✅ Found ${managedSupportCount} Service Offerings under Managed Support/Application Services`);
  }

  console.log('');

  // ========================================
  // CHECK 4: Test Reference Qualifier
  // ========================================
  console.log('CHECK 4: Simulate Reference Qualifier');
  console.log('─'.repeat(100));

  if (businessServiceSysId) {
    // Test 1: Original reference qualifier pattern
    console.log('Test 1: Simulating original ref qual pattern (parent=business_service)');
    const test1Url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent=${businessServiceSysId}&sysparm_fields=sys_id,name&sysparm_limit=20`;

    const test1Resp = await fetch(test1Url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    const test1Data = await test1Resp.json();
    console.log(`   Query: parent=${businessServiceSysId}`);
    console.log(`   Result: ${test1Data.result?.length || 0} Service Offerings`);

    if (test1Data.result && test1Data.result.length > 0) {
      test1Data.result.forEach((so: any) => {
        console.log(`     - ${so.name}`);
      });
      findings.push(`✅ Original reference qualifier would return ${test1Data.result.length} offerings`);
    } else {
      issues.push('❌ Original reference qualifier returns NO results - this is the problem!');
    }

    console.log('');

    // Test 2: Static filter pattern
    console.log('Test 2: Simulating static ref qual pattern (parent.name=Managed Support Services)');
    const test2Url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=parent.name=Managed Support Services&sysparm_fields=sys_id,name&sysparm_limit=20`;

    const test2Resp = await fetch(test2Url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    const test2Data = await test2Resp.json();
    console.log(`   Query: parent.name=Managed Support Services`);
    console.log(`   Result: ${test2Data.result?.length || 0} Service Offerings`);

    if (test2Data.result && test2Data.result.length > 0) {
      test2Data.result.forEach((so: any) => {
        console.log(`     - ${so.name}`);
      });
      findings.push(`✅ Static filter would return ${test2Data.result.length} offerings`);
    } else {
      issues.push('❌ Static filter also returns NO results');
    }

    console.log('');
  } else {
    console.log('⚠️  Cannot simulate - incident has no business_service');
  }

  // ========================================
  // CHECK 5: Business Service Details
  // ========================================
  console.log('CHECK 5: Business Service Details');
  console.log('─'.repeat(100));

  if (businessServiceSysId) {
    const bsUrl = `${instanceUrl}/api/now/table/cmdb_ci_service?sysparm_query=sys_id=${businessServiceSysId}&sysparm_fields=sys_id,name,sys_class_name&sysparm_display_value=all&sysparm_limit=1`;

    const bsResp = await fetch(bsUrl, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    const bsData = await bsResp.json();

    if (bsData.result && bsData.result.length > 0) {
      const bs = bsData.result[0];
      console.log('Business Service Details:');
      console.log(`  Name: ${bs.name?.display_value || bs.name}`);
      console.log(`  sys_id: ${bs.sys_id?.value || bs.sys_id}`);
      console.log(`  Class: ${bs.sys_class_name?.display_value || bs.sys_class_name}`);
      findings.push(`✅ Business Service exists: ${bs.name?.display_value || bs.name}`);
    } else {
      issues.push('❌ Business Service sys_id not found in cmdb_ci_service table');
    }
  } else {
    console.log('⚠️  No business_service to look up');
  }

  console.log('');

  // ========================================
  // CHECK 6: Look for "Managed Support Services" parent
  // ========================================
  console.log('CHECK 6: Find "Managed Support Services" Record');
  console.log('─'.repeat(100));

  const mssUrl = `${instanceUrl}/api/now/table/cmdb_ci_service?sysparm_query=nameLIKEManaged Support Services^ORnameLIKEManaged Application Service&sysparm_fields=sys_id,name,sys_class_name&sysparm_display_value=all&sysparm_limit=10`;

  const mssResp = await fetch(mssUrl, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });

  const mssData = await mssResp.json();

  if (!mssData.result || mssData.result.length === 0) {
    issues.push('❌ CRITICAL: "Managed Support Services" Business Service not found');
    console.log('❌ "Managed Support Services" not found!');
  } else {
    console.log(`Found ${mssData.result.length} matching service(s):\n`);
    mssData.result.forEach((service: any) => {
      console.log(`  - ${service.name?.display_value || service.name}`);
      console.log(`    sys_id: ${service.sys_id?.value || service.sys_id}`);
      console.log(`    Class: ${service.sys_class_name?.display_value || service.sys_class_name}`);
      console.log('');
    });
    findings.push('✅ "Managed Support Services" parent record exists');
  }

  console.log('');

  // ========================================
  // SUMMARY
  // ========================================
  console.log('='.repeat(100));
  console.log('DIAGNOSTIC SUMMARY');
  console.log('='.repeat(100));
  console.log('');

  console.log('✅ FINDINGS:');
  findings.forEach(f => console.log(`  ${f}`));
  console.log('');

  console.log('❌ ISSUES FOUND:');
  if (issues.length === 0) {
    console.log('  (none)');
  } else {
    issues.forEach(i => console.log(`  ${i}`));
  }
  console.log('');

  // ========================================
  // RECOMMENDATION
  // ========================================
  console.log('💡 RECOMMENDATION:');
  console.log('─'.repeat(100));

  if (issues.some(i => i.includes('Original reference qualifier returns NO results'))) {
    console.log('ROOT CAUSE: Service Offerings have a different parent than the incident\'s business_service');
    console.log('');
    console.log('SOLUTION OPTIONS:');
    console.log('');
    console.log('Option A (Quick Fix): Update reference qualifier to static filter');
    console.log('  - Change ref_qual to: javascript:\'parent.name=Managed Support Services\'');
    console.log('  - Pros: Shows all 6 offerings immediately');
    console.log('  - Cons: ALL incidents see same offerings (no dynamic filtering)');
    console.log('');
    console.log('Option B (Proper Fix): Update Service Offerings parent field');
    console.log('  - Point Service Offerings parent to incident\'s business_service');
    console.log('  - Pros: Maintains dynamic filtering per incident');
    console.log('  - Cons: May not match your business model');
    console.log('');
    console.log('Option C (Hybrid): Use OR condition in reference qualifier');
    console.log('  - ref_qual: javascript:\'parent=\'+current.business_service+\'^ORparent.name=Managed Support Services\'');
    console.log('  - Pros: Dynamic filtering + fallback to all offerings');
    console.log('  - Cons: More complex logic');
    console.log('');
  } else if (issues.some(i => i.includes('Reference qualifier is EMPTY'))) {
    console.log('ROOT CAUSE: Reference qualifier was removed or never set');
    console.log('');
    console.log('SOLUTION: Set reference qualifier to: javascript:\'parent.name=Managed Support Services\'');
    console.log('');
  } else {
    console.log('No clear root cause identified. Please review findings and issues above.');
  }

  console.log('');
  console.log('Next step: Run intelligent-fix-service-offering.ts with chosen option');
  console.log('');
}

ultimateDiagnostic().catch(console.error);
