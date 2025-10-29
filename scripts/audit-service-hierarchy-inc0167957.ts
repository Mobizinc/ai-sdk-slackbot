/**
 * Audit Service Hierarchy Configuration for INC0167957
 * Verify ServiceNow setup for Neighbors/Altus/Gorev issue
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function auditServiceHierarchy() {
  console.log('🔍 AUDITING SERVICE HIERARCHY FOR INC0167957');
  console.log('='.repeat(80));
  console.log('');

  // 1. Check Business Service (Managed Support Services)
  console.log('1️⃣  BUSINESS SERVICE: Managed Support Services');
  console.log('-'.repeat(80));
  try {
    const bsResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/cmdb_ci_service_business/e24d6752c368721066d9bdb4e40131a8?sysparm_display_value=all',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const bsData = await bsResponse.json();
    if (bsData.result) {
      console.log(`   Name: ${bsData.result.name?.display_value || bsData.result.name}`);
      console.log(`   sys_id: ${bsData.result.sys_id}`);
      console.log(`   Vendor: ${bsData.result.vendor?.display_value || 'NOT SET'}`);
      console.log(`   Parent: ${bsData.result.parent?.display_value || '(none)'}`);
      console.log(`   ✅ Business Service exists`);
    }
  } catch (error) {
    console.log(`   ❌ Error fetching Business Service: ${error}`);
  }
  console.log('');

  // 2. Check Service Offering (Application Administration)
  console.log('2️⃣  SERVICE OFFERING: Application Administration');
  console.log('-'.repeat(80));
  try {
    const soResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/service_offering/7abe6bd6c320f210ad36b9ff05013112?sysparm_display_value=all',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const soData = await soResponse.json();
    if (soData.result) {
      console.log(`   Name: ${soData.result.name?.display_value || soData.result.name}`);
      console.log(`   sys_id: ${soData.result.sys_id}`);
      console.log(`   Parent: ${soData.result.parent?.display_value || 'NOT SET'}`);
      console.log(`   Vendor: ${soData.result.vendor?.display_value || 'NOT SET'}`);
      console.log(`   Company: ${soData.result.company?.display_value || '(none)'}`);

      if (soData.result.parent?.display_value === 'Managed Support Services') {
        console.log(`   ✅ Correctly linked to Business Service`);
      } else {
        console.log(`   ❌ NOT linked to Business Service!`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Error fetching Service Offering: ${error}`);
  }
  console.log('');

  // 3. Check Application Service (Gorev)
  console.log('3️⃣  APPLICATION SERVICE: Altus Health - Gorev Production');
  console.log('-'.repeat(80));
  try {
    const asResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/cmdb_ci_service_discovered/3100fb9ac320f210ad36b9ff050131c1?sysparm_display_value=all',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const asData = await asResponse.json();
    if (asData.result) {
      console.log(`   Name: ${asData.result.name?.display_value || asData.result.name}`);
      console.log(`   sys_id: ${asData.result.sys_id}`);
      console.log(`   Parent: ${asData.result.parent?.display_value || 'NOT SET'}`);
      console.log(`   Company: ${asData.result.company?.display_value || 'NOT SET'}`);
      console.log(`   Vendor: ${asData.result.vendor?.display_value || 'NOT SET'}`);

      const issues = [];
      if (!asData.result.parent?.display_value) {
        issues.push('❌ Parent not set (should be Application Administration)');
      } else if (asData.result.parent.display_value !== 'Application Administration') {
        issues.push(`❌ Wrong parent: ${asData.result.parent.display_value}`);
      }

      if (!asData.result.company?.display_value) {
        issues.push('❌ Company not set');
      } else if (asData.result.company.display_value !== 'Altus Community Healthcare') {
        issues.push(`⚠️  Company: ${asData.result.company.display_value}`);
      }

      if (issues.length === 0) {
        console.log(`   ✅ Configuration looks correct`);
      } else {
        issues.forEach(issue => console.log(`   ${issue}`));
      }
    }
  } catch (error) {
    console.log(`   ❌ Error fetching Application Service: ${error}`);
  }
  console.log('');

  // 4. Check Neighbors company record
  console.log('4️⃣  COMPANY RECORD: Neighbors');
  console.log('-'.repeat(80));
  try {
    const companyResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/core_company?sysparm_query=name=Neighbors&sysparm_display_value=all&sysparm_limit=1',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const companyData = await companyResponse.json();
    if (companyData.result && companyData.result.length > 0) {
      const neighbors = companyData.result[0];
      console.log(`   Name: ${neighbors.name?.display_value || neighbors.name}`);
      console.log(`   sys_id: ${neighbors.sys_id}`);
      console.log(`   Parent: ${neighbors.parent?.display_value || '(none)'}`);
      console.log(`   Active: ${neighbors.active?.display_value || neighbors.active}`);

      if (neighbors.parent?.display_value === 'Altus Community Healthcare') {
        console.log(`   ✅ Correctly linked to parent company`);
      } else {
        console.log(`   ❌ Parent company mismatch!`);
      }
    } else {
      console.log(`   ❌ Neighbors company not found!`);
    }
  } catch (error) {
    console.log(`   ❌ Error fetching Neighbors company: ${error}`);
  }
  console.log('');

  // 5. Check Altus Community Healthcare company record
  console.log('5️⃣  COMPANY RECORD: Altus Community Healthcare (Parent)');
  console.log('-'.repeat(80));
  try {
    const altusResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/core_company/c3eec28c931c9a1049d9764efaba10f3?sysparm_display_value=all',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const altusData = await altusResponse.json();
    if (altusData.result) {
      console.log(`   Name: ${altusData.result.name?.display_value || altusData.result.name}`);
      console.log(`   sys_id: ${altusData.result.sys_id}`);
      console.log(`   Parent: ${altusData.result.parent?.display_value || '(none - is parent)'}`);
      console.log(`   Active: ${altusData.result.active?.display_value || altusData.result.active}`);
      console.log(`   ✅ Parent company exists`);
    }
  } catch (error) {
    console.log(`   ❌ Error fetching Altus company: ${error}`);
  }
  console.log('');

  // 6. Check incident INC0167957
  console.log('6️⃣  INCIDENT: INC0167957');
  console.log('-'.repeat(80));
  try {
    const incidentResponse = await fetch(
      'https://mobiz.service-now.com/api/now/table/incident?sysparm_query=number=INC0167957&sysparm_display_value=all&sysparm_limit=1',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );
    const incidentData = await incidentResponse.json();
    if (incidentData.result && incidentData.result.length > 0) {
      const incident = incidentData.result[0];
      console.log(`   Number: ${incident.number}`);
      console.log(`   Short Description: ${incident.short_description?.display_value || incident.short_description}`);
      console.log(`   Company: ${incident.company?.display_value || 'NOT SET'}`);
      console.log(`   Business Service: ${incident.business_service?.display_value || 'NOT SET'}`);
      console.log(`   Service Offering: ${incident.service_offering?.display_value || 'NOT SET'}`);
      console.log(`   Category: ${incident.category?.display_value || 'NOT SET'}`);
      console.log(`   State: ${incident.state?.display_value || 'NOT SET'}`);

      console.log('');
      console.log('   ANALYSIS:');
      if (incident.company?.display_value === 'Neighbors') {
        console.log(`   ✅ Company is Neighbors (child company)`);
      }
      if (incident.service_offering?.display_value === 'Application Administration') {
        console.log(`   ✅ Service Offering correctly set to Application Administration`);
      }
      if (!incident.business_service?.display_value || incident.business_service?.display_value === '') {
        console.log(`   ❌ Business Service NOT SET (should be Gorev)`);
        console.log(`   🔍 This is the issue - can't select Gorev because:`);
        console.log(`      - Gorev has company = Altus Community Healthcare`);
        console.log(`      - Incident has company = Neighbors`);
        console.log(`      - Reference qualifier likely filtering by company match`);
      }
    } else {
      console.log(`   ⚠️  Incident INC0167957 not found (may be in different table or doesn't exist)`);
    }
  } catch (error) {
    console.log(`   ❌ Error fetching incident: ${error}`);
  }
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('📋 AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log('EXPECTED CONFIGURATION:');
  console.log('  Managed Support Services (Business Service)');
  console.log('  └─ Application Administration (Service Offering)');
  console.log('     └─ Altus Health - Gorev Production (Application Service)');
  console.log('        └─ company: Altus Community Healthcare');
  console.log('');
  console.log('ISSUE:');
  console.log('  Incident company: Neighbors (child of Altus)');
  console.log('  Cannot select Gorev because:');
  console.log('    - Gorev.company = Altus Community Healthcare');
  console.log('    - Incident.company = Neighbors');
  console.log('    - Reference qualifier filters by exact company match');
  console.log('');
  console.log('SOLUTION NEEDED:');
  console.log('  Option 1: Update reference qualifier to include parent company services');
  console.log('  Option 2: Duplicate Gorev service with company=Neighbors');
  console.log('  Option 3: Change Gorev company field to null (available to all)');
  console.log('');
}

auditServiceHierarchy()
  .then(() => {
    console.log('✅ Audit complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
