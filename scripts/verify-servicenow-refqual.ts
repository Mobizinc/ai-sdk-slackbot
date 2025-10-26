/**
 * ServiceNow Reference Qualifier Verification Script
 *
 * Purpose: Verify current configuration and test reference qualifier logic
 * For: Incident INC0167957 - Gorev selection issue
 */

import { servicenowClient } from '../lib/integrations/servicenow/client';

interface CompanyRecord {
  sys_id: string;
  name: string;
  parent: string;
  active: boolean;
}

interface ServiceRecord {
  sys_id: string;
  name: string;
  sys_class_name: string;
  company: string;
  parent: string;
}

interface DictionaryEntry {
  element: string;
  name: string;
  reference_qual: string;
  reference_qual_condition: string;
}

async function verifyConfiguration() {
  console.log('=== ServiceNow Reference Qualifier Verification ===\n');

  try {
    // 1. Verify Gorev Service Configuration
    console.log('1. Verifying Gorev Service Configuration...');
    const gorevResponse = await servicenowClient.get('/table/cmdb_ci_service_discovered/3100fb9ac320f210ad36b9ff050131c1', {
      params: {
        sysparm_fields: 'sys_id,name,sys_class_name,company,parent,operational_status',
        sysparm_display_value: 'all'
      }
    });

    const gorev = gorevResponse.data.result;
    console.log('   Gorev Service:');
    console.log(`   - Name: ${gorev.name}`);
    console.log(`   - Class: ${gorev.sys_class_name}`);
    console.log(`   - Company: ${gorev.company?.display_value} (${gorev.company?.value})`);
    console.log(`   - Parent: ${gorev.parent?.display_value} (${gorev.parent?.value})`);
    console.log(`   - Status: ${gorev.operational_status?.display_value}\n`);

    // 2. Verify Company Hierarchy
    console.log('2. Verifying Company Hierarchy...');

    // Get Neighbors company
    const neighborsResponse = await servicenowClient.get('/table/core_company', {
      params: {
        sysparm_query: 'name=Neighbors^active=true',
        sysparm_fields: 'sys_id,name,parent,active',
        sysparm_display_value: 'all'
      }
    });

    if (neighborsResponse.data.result.length === 0) {
      console.log('   ❌ ERROR: Neighbors company not found or inactive');
      return;
    }

    const neighbors = neighborsResponse.data.result[0];
    console.log(`   Neighbors: ${neighbors.sys_id}`);
    console.log(`   Parent: ${neighbors.parent?.display_value} (${neighbors.parent?.value})\n`);

    // Get Altus parent company
    const altusResponse = await servicenowClient.get('/table/core_company/c3eec28c931c9a1049d9764efaba10f3', {
      params: {
        sysparm_fields: 'sys_id,name,parent,active',
        sysparm_display_value: 'all'
      }
    });

    const altus = altusResponse.data.result;
    console.log(`   Altus (Parent): ${altus.sys_id}`);
    console.log(`   Name: ${altus.name}`);
    console.log(`   Active: ${altus.active}\n`);

    // 3. Verify Dictionary Entry for incident.business_service
    console.log('3. Verifying Dictionary Entry for incident.business_service...');
    const dictResponse = await servicenowClient.get('/table/sys_dictionary', {
      params: {
        sysparm_query: 'name=incident^element=business_service',
        sysparm_fields: 'element,name,reference_qual,reference_qual_condition,reference',
        sysparm_display_value: 'all'
      }
    });

    if (dictResponse.data.result.length === 0) {
      console.log('   ❌ No dictionary entry found for incident.business_service');
      console.log('   ℹ️  Checking parent table (task)...\n');

      const taskDictResponse = await servicenowClient.get('/table/sys_dictionary', {
        params: {
          sysparm_query: 'name=task^element=business_service',
          sysparm_fields: 'element,name,reference_qual,reference_qual_condition,reference',
          sysparm_display_value: 'all'
        }
      });

      if (taskDictResponse.data.result.length > 0) {
        const taskDict = taskDictResponse.data.result[0];
        console.log('   Dictionary Entry (from task table):');
        console.log(`   - Table: ${taskDict.name}`);
        console.log(`   - Field: ${taskDict.element}`);
        console.log(`   - Reference: ${taskDict.reference}`);
        console.log(`   - Reference Qual: ${taskDict.reference_qual || '(empty)'}`);
        console.log(`   - Reference Qual Condition: ${taskDict.reference_qual_condition || '(empty)'}\n`);
      }
    } else {
      const dict = dictResponse.data.result[0];
      console.log('   Dictionary Entry:');
      console.log(`   - Table: ${dict.name}`);
      console.log(`   - Field: ${dict.element}`);
      console.log(`   - Reference: ${dict.reference}`);
      console.log(`   - Reference Qual: ${dict.reference_qual || '(empty)'}`);
      console.log(`   - Reference Qual Condition: ${dict.reference_qual_condition || '(empty)'}\n`);
    }

    // 4. Test Reference Qualifier Logic
    console.log('4. Testing Reference Qualifier Logic...');

    // Query for services visible to Neighbors
    const servicesResponse = await servicenowClient.get('/table/cmdb_ci_service', {
      params: {
        sysparm_query: `sys_class_name!=service_offering^company=${neighbors.sys_id}`,
        sysparm_fields: 'sys_id,name,sys_class_name,company',
        sysparm_display_value: 'all',
        sysparm_limit: 10
      }
    });

    console.log(`   Services with company=Neighbors (${servicesResponse.data.result.length} found):`);
    servicesResponse.data.result.forEach((svc: ServiceRecord) => {
      console.log(`   - ${svc.name} (${svc.sys_class_name})`);
    });
    console.log();

    // Query for services visible with parent company
    const servicesWithParentResponse = await servicenowClient.get('/table/cmdb_ci_service', {
      params: {
        sysparm_query: `sys_class_name!=service_offering^company=${neighbors.sys_id}^ORcompany=${neighbors.parent.value}`,
        sysparm_fields: 'sys_id,name,sys_class_name,company',
        sysparm_display_value: 'all',
        sysparm_limit: 10
      }
    });

    console.log(`   Services with company=Neighbors OR Altus (${servicesWithParentResponse.data.result.length} found):`);
    servicesWithParentResponse.data.result.forEach((svc: ServiceRecord) => {
      console.log(`   - ${svc.name} (${svc.sys_class_name}) - Company: ${svc.company?.display_value}`);
    });
    console.log();

    // 5. Check if Gorev appears in the results
    const gorevInResults = servicesWithParentResponse.data.result.find(
      (svc: ServiceRecord) => svc.sys_id === '3100fb9ac320f210ad36b9ff050131c1'
    );

    if (gorevInResults) {
      console.log('   ✅ SUCCESS: Gorev appears in results with company hierarchy qualifier');
    } else {
      console.log('   ❌ ISSUE: Gorev does NOT appear even with company hierarchy qualifier');
      console.log('   ℹ️  Checking if Gorev is service_offering...');

      if (gorev.sys_class_name === 'service_offering') {
        console.log('   ❌ ERROR: Gorev is classified as service_offering - this is the problem!');
      }
    }

    // 6. Verify INC0167957
    console.log('\n5. Verifying Incident INC0167957...');
    const incidentResponse = await servicenowClient.get('/table/incident', {
      params: {
        sysparm_query: 'number=INC0167957',
        sysparm_fields: 'number,company,business_service,short_description',
        sysparm_display_value: 'all'
      }
    });

    if (incidentResponse.data.result.length > 0) {
      const incident = incidentResponse.data.result[0];
      console.log(`   Incident: ${incident.number}`);
      console.log(`   Company: ${incident.company?.display_value} (${incident.company?.value})`);
      console.log(`   Current Business Service: ${incident.business_service?.display_value || '(empty)'}`);
      console.log(`   Description: ${incident.short_description}\n`);
    } else {
      console.log('   ⚠️  Incident INC0167957 not found in accessible instance\n');
    }

    // 7. Summary and Recommendations
    console.log('=== SUMMARY & RECOMMENDATIONS ===\n');
    console.log('Root Cause:');
    console.log('- Reference qualifier sys_class_name!=service_offering does NOT filter by company');
    console.log('- ServiceNow implicit filtering does NOT traverse company hierarchy');
    console.log('- Gorev (company=Altus) is not visible when incident has company=Neighbors\n');

    console.log('Solution:');
    console.log('- Implement ApplicationServiceFilter script include');
    console.log('- Update reference qualifier to: javascript:new ApplicationServiceFilter().getQualifier(current)');
    console.log('- This will include parent company services in the dropdown\n');

  } catch (error: any) {
    console.error('Error during verification:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run verification
verifyConfiguration();
