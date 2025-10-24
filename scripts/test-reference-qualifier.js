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

async function testReferenceQualifier() {
  console.log('='.repeat(80));
  console.log('TESTING: Reference Qualifier for Service Offering Lookup');
  console.log('='.repeat(80));

  try {
    // Get the incident's business_service value
    const incidentResponse = await instance.get('/api/now/table/incident', {
      params: {
        sysparm_query: 'number=INC0167770',
        sysparm_fields: 'sys_id,number,business_service',
        sysparm_display_value: 'all'
      }
    });

    const incident = incidentResponse.data.result[0];
    const businessServiceSysId = incident.business_service.value;
    const businessServiceName = incident.business_service.display_value;

    console.log('\n1. INCIDENT BUSINESS SERVICE:');
    console.log(`   Name: ${businessServiceName}`);
    console.log(`   Sys ID: ${businessServiceSysId}`);

    // The reference qualifier is: javascript:'parent='+current.business_service;
    // This means it queries: service_offering WHERE parent = <business_service_sys_id>

    console.log('\n2. APPLYING REFERENCE QUALIFIER:');
    console.log(`   Reference Qualifier: javascript:'parent='+current.business_service;`);
    console.log(`   Translated Query: parent=${businessServiceSysId}`);

    // Query service offerings with the reference qualifier
    const qualifiedResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: `parent=${businessServiceSysId}`,
        sysparm_fields: 'sys_id,name,parent',
        sysparm_display_value: 'all'
      }
    });

    console.log(`\n3. RESULTS WITH REFERENCE QUALIFIER:`);
    console.log(`   Found ${qualifiedResponse.data.result.length} records`);
    if (qualifiedResponse.data.result.length > 0) {
      console.log('   Records:');
      qualifiedResponse.data.result.forEach(record => {
        console.log(`   - ${record.name.display_value} (parent: ${record.parent.display_value})`);
      });
    } else {
      console.log('   No records found!');
    }

    // Now check what parent our 6 Service Offerings actually have
    console.log('\n4. OUR 6 SERVICE OFFERINGS - PARENT VALUES:');
    const ourOfferingsResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'parent.name=Managed Support Services',
        sysparm_fields: 'sys_id,name,parent',
        sysparm_display_value: 'all'
      }
    });

    console.log(`   Found ${ourOfferingsResponse.data.result.length} Service Offerings`);
    ourOfferingsResponse.data.result.forEach(record => {
      console.log(`   - ${record.name.display_value}`);
      console.log(`     Parent: ${record.parent.display_value} (${record.parent.value})`);
    });

    // Get the Managed Support Services sys_id for comparison
    console.log('\n5. BUSINESS SERVICE COMPARISON:');
    const managedSupportResponse = await instance.get('/api/now/table/cmdb_ci_service', {
      params: {
        sysparm_query: 'name=Managed Support Services',
        sysparm_fields: 'sys_id,name',
        sysparm_display_value: 'all'
      }
    });

    if (managedSupportResponse.data.result.length > 0) {
      const managedSupportSysId = managedSupportResponse.data.result[0].sys_id.value;
      console.log(`   Managed Support Services Sys ID: ${managedSupportSysId}`);
      console.log(`   Incident's Business Service Sys ID: ${businessServiceSysId}`);
      console.log(`   MATCH: ${managedSupportSysId === businessServiceSysId ? 'YES' : 'NO'}`);
    }

    // Get the actual business service details
    console.log('\n6. INCIDENT BUSINESS SERVICE HIERARCHY:');
    const businessServiceResponse = await instance.get('/api/now/table/cmdb_ci_service', {
      params: {
        sysparm_query: `sys_id=${businessServiceSysId}`,
        sysparm_fields: 'sys_id,name,parent,service_classification',
        sysparm_display_value: 'all'
      }
    });

    if (businessServiceResponse.data.result.length > 0) {
      const bs = businessServiceResponse.data.result[0];
      console.log(`   Name: ${bs.name.display_value}`);
      console.log(`   Sys ID: ${bs.sys_id.value}`);
      console.log(`   Parent: ${bs.parent.display_value} (${bs.parent.value})`);
      console.log(`   Service Classification: ${bs.service_classification?.display_value || 'N/A'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('ROOT CAUSE ANALYSIS:');
    console.log('='.repeat(80));
    console.log('The reference qualifier on task.service_offering is:');
    console.log('  javascript:\'parent=\'+current.business_service;');
    console.log('');
    console.log('This means the lookup ONLY shows Service Offerings where:');
    console.log('  service_offering.parent = incident.business_service');
    console.log('');
    console.log(`The incident has business_service = "${businessServiceName}"`);
    console.log('But our 6 Service Offerings have parent = "Managed Support Services"');
    console.log('');
    console.log('SOLUTION: Change the parent field on our 6 Service Offerings from');
    console.log(`          "Managed Support Services" to "${businessServiceName}"`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error during testing:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testReferenceQualifier();
