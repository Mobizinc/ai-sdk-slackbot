require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const instance = axios.create({
  baseURL: process.env.SERVICENOW_URL,
  auth: {
    username: process.env.SERVICENOW_USERNAME,
    password: process.env.SERVICENOW_PASSWORD
  },
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

async function analyzeServiceHierarchy() {
  console.log('='.repeat(80));
  console.log('ANALYZING: Service vs Service Offering Hierarchy');
  console.log('='.repeat(80));

  try {
    // Get the full hierarchy
    console.log('\n1. INCIDENT BUSINESS SERVICE:');
    const incidentResponse = await instance.get('/api/now/table/incident', {
      params: {
        sysparm_query: 'number=INC0167770',
        sysparm_fields: 'sys_id,number,business_service',
        sysparm_display_value: 'all'
      }
    });

    const businessServiceSysId = incidentResponse.data.result[0].business_service.value;
    const businessServiceName = incidentResponse.data.result[0].business_service.display_value;
    console.log(`   ${businessServiceName} (${businessServiceSysId})`);

    // Get the business service details
    const bsResponse = await instance.get('/api/now/table/cmdb_ci_service', {
      params: {
        sysparm_query: `sys_id=${businessServiceSysId}`,
        sysparm_fields: 'sys_id,name,parent,sys_class_name,service_classification',
        sysparm_display_value: 'all'
      }
    });

    const businessService = bsResponse.data.result[0];
    console.log(`   Class: ${businessService.sys_class_name.display_value}`);
    console.log(`   Classification: ${businessService.service_classification?.display_value || 'N/A'}`);
    console.log(`   Parent: ${businessService.parent.display_value} (${businessService.parent.value})`);

    // Walk up the hierarchy
    console.log('\n2. SERVICE HIERARCHY (bottom to top):');
    let currentService = businessService;
    let level = 0;
    const hierarchy = [];

    while (currentService && currentService.parent.value) {
      const indent = '   ' + '  '.repeat(level);
      console.log(`${indent}${level}. ${currentService.name.display_value} (${currentService.sys_class_name.display_value})`);
      hierarchy.push(currentService);

      // Get parent
      const parentResponse = await instance.get('/api/now/table/cmdb_ci_service', {
        params: {
          sysparm_query: `sys_id=${currentService.parent.value}`,
          sysparm_fields: 'sys_id,name,parent,sys_class_name,service_classification',
          sysparm_display_value: 'all'
        }
      });

      if (parentResponse.data.result.length > 0) {
        currentService = parentResponse.data.result[0];
        level++;
      } else {
        break;
      }
    }

    // Print final level
    if (currentService) {
      const indent = '   ' + '  '.repeat(level);
      console.log(`${indent}${level}. ${currentService.name.display_value} (${currentService.sys_class_name.display_value})`);
    }

    // Check if any of these are Service Offerings
    console.log('\n3. CHECKING HIERARCHY FOR SERVICE OFFERINGS:');
    for (const service of hierarchy) {
      const isServiceOffering = service.sys_class_name.value === 'service_offering';
      console.log(`   ${service.name.display_value}: ${isServiceOffering ? 'SERVICE OFFERING' : 'Business Service'}`);

      if (isServiceOffering) {
        console.log(`      >> This is one of our 6 Service Offerings!`);
      }
    }

    // Check: How should Service Offerings relate to Business Services?
    console.log('\n4. SERVICENOW DATA MODEL:');
    console.log('   In ServiceNow SPM (Service Portfolio Management):');
    console.log('   - Business Services represent WHAT services are provided to customers');
    console.log('   - Service Offerings represent HOW those services are packaged/sold');
    console.log('   - Typically: Service Offerings point to Business Services via "parent" field');
    console.log('   - The reference qualifier shows: Offerings WHERE parent = current.business_service');
    console.log('');
    console.log('   EXPECTED RELATIONSHIP:');
    console.log('   Business Service: "Altus Health - TSheet Account"');
    console.log('      └─ Service Offering: "Application Administration" (package/tier)');
    console.log('      └─ Service Offering: "Helpdesk and Endpoint - Standard" (package/tier)');
    console.log('      └─ etc...');

    // Show what Flex SC looks like (successful example)
    console.log('\n5. SUCCESSFUL EXAMPLE - Flex SC Business Service:');
    const flexResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'parent.name=Flex SC',
        sysparm_fields: 'name,parent',
        sysparm_display_value: 'all',
        sysparm_limit: 5
      }
    });

    if (flexResponse.data.result.length > 0) {
      console.log(`   Parent Business Service: Flex SC`);
      console.log('   Service Offerings under it:');
      flexResponse.data.result.forEach(offering => {
        console.log(`      - ${offering.name.display_value}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('ROOT CAUSE IDENTIFIED:');
    console.log('='.repeat(80));
    console.log('PROBLEM: The Service Offerings have the WRONG parent.');
    console.log('');
    console.log('CURRENT STATE:');
    console.log('   - Service Offerings point to "Managed Support Services" (generic parent)');
    console.log('   - Incident has business_service = "Altus Health - TSheet Account"');
    console.log('   - Reference qualifier filters: parent = current.business_service');
    console.log('   - NO MATCH → "No records to display"');
    console.log('');
    console.log('INCORRECT ARCHITECTURE:');
    console.log('   "Application Administration" is BOTH:');
    console.log('   1. A Service Offering (in service_offering table)');
    console.log('   2. The parent of "Altus Health - TSheet Account" (Business Service)');
    console.log('   This circular/confused hierarchy is causing the issue.');
    console.log('');
    console.log('CORRECT ARCHITECTURE SHOULD BE:');
    console.log('   Business Service: "Altus Health - TSheet Account"');
    console.log('      ├─ Service Offering: "Application Administration"');
    console.log('      ├─ Service Offering: "Helpdesk and Endpoint - Standard"');
    console.log('      ├─ Service Offering: "Cybersecurity Management"');
    console.log('      └─ etc...');
    console.log('');
    console.log('FIX: Update the 6 Service Offerings to have parent = "Altus Health - TSheet Account"');
    console.log(`     (sys_id: ${businessServiceSysId})`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error during analysis:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

analyzeServiceHierarchy();
