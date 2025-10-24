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

async function diagnoseServiceOfferingLookup() {
  console.log('='.repeat(80));
  console.log('DIAGNOSTIC: Service Offering Lookup Issue on INC0167770');
  console.log('='.repeat(80));

  try {
    // 1. Get the incident details
    console.log('\n1. INCIDENT DETAILS:');
    const incidentResponse = await instance.get('/api/now/table/incident', {
      params: {
        sysparm_query: 'number=INC0167770',
        sysparm_fields: 'sys_id,number,business_service,service_offering,cmdb_ci,u_service',
        sysparm_display_value: 'all'
      }
    });

    const incident = incidentResponse.data.result[0];
    console.log('Incident:', JSON.stringify(incident, null, 2));

    // 2. Get dictionary entry for task.service_offering field
    console.log('\n2. DICTIONARY ENTRY for task.service_offering:');
    const dictResponse = await instance.get('/api/now/table/sys_dictionary', {
      params: {
        sysparm_query: 'name=task^element=service_offering',
        sysparm_fields: 'name,element,reference,reference_qual,reference_qual_condition,reference_cascade_rule,internal_type,sys_id',
        sysparm_display_value: 'all'
      }
    });
    console.log('Dictionary:', JSON.stringify(dictResponse.data.result, null, 2));

    // 3. Check if there's an incident-specific dictionary override
    console.log('\n3. CHECKING for incident-specific dictionary override:');
    const incidentDictResponse = await instance.get('/api/now/table/sys_dictionary', {
      params: {
        sysparm_query: 'name=incident^element=service_offering',
        sysparm_fields: 'name,element,reference,reference_qual,reference_qual_condition,reference_cascade_rule,internal_type,sys_id',
        sysparm_display_value: 'all'
      }
    });
    console.log('Incident Dict Override:', JSON.stringify(incidentDictResponse.data.result, null, 2));

    // 4. Get service_offering table class hierarchy
    console.log('\n4. SERVICE OFFERING TABLE HIERARCHY:');
    const tableResponse = await instance.get('/api/now/table/sys_db_object', {
      params: {
        sysparm_query: 'name=service_offering',
        sysparm_fields: 'name,label,super_class,sys_class_name,extends_table'
      }
    });
    console.log('Table Info:', JSON.stringify(tableResponse.data.result, null, 2));

    // 5. Get ALL our 6 Service Offerings with CMDB-specific fields
    console.log('\n5. OUR 6 SERVICE OFFERINGS - CMDB CI FIELDS:');
    const serviceOfferingsResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'parent.name=Managed Support Services',
        sysparm_fields: 'sys_id,name,sys_class_name,install_status,operational_status,used_for,asset_tag,model_id,manufacturer,location,assigned_to,parent',
        sysparm_display_value: 'all',
        sysparm_limit: 10
      }
    });
    console.log('Service Offerings:', JSON.stringify(serviceOfferingsResponse.data.result, null, 2));

    // 6. Check what columns are in the lookup list layout
    console.log('\n6. LIST LAYOUT for service_offering lookup:');
    const listLayoutResponse = await instance.get('/api/now/table/sys_ui_list', {
      params: {
        sysparm_query: 'name=service_offering^view=Default view',
        sysparm_fields: 'name,view,sys_id'
      }
    });
    console.log('List Layouts:', JSON.stringify(listLayoutResponse.data.result, null, 2));

    if (listLayoutResponse.data.result.length > 0) {
      const listLayoutSysId = listLayoutResponse.data.result[0].sys_id;
      const elementsResponse = await instance.get('/api/now/table/sys_ui_list_element', {
        params: {
          sysparm_query: `list_id=${listLayoutSysId}`,
          sysparm_fields: 'element,position',
          sysparm_display_value: 'true'
        }
      });
      console.log('List Layout Elements:', JSON.stringify(elementsResponse.data.result, null, 2));
    }

    // 7. Check if service_offering extends cmdb_ci
    console.log('\n7. CHECKING CMDB CI INHERITANCE:');
    const cmdbCheckResponse = await instance.get('/api/now/table/sys_db_object', {
      params: {
        sysparm_query: 'name=service_offering^ORsuper_class.name=service_offering',
        sysparm_fields: 'name,label,super_class.name,extends_table',
        sysparm_display_value: 'all'
      }
    });
    console.log('CMDB CI Inheritance:', JSON.stringify(cmdbCheckResponse.data.result, null, 2));

    // 8. Query service_offering AS A CI (what the lookup is actually doing)
    console.log('\n8. QUERY service_offering AS CMDB CI (like the lookup does):');
    const ciQueryResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'install_status=1^operational_status=1',
        sysparm_fields: 'sys_id,name,manufacturer,asset.display_name,location,assigned_to,model_number,parent',
        sysparm_display_value: 'all',
        sysparm_limit: 20
      }
    });
    console.log(`Found ${ciQueryResponse.data.result.length} records with install_status=1 and operational_status=1`);
    console.log('Results:', JSON.stringify(ciQueryResponse.data.result, null, 2));

    // 9. Check what install_status values our Service Offerings have
    console.log('\n9. CHECKING ACTUAL install_status VALUES:');
    const statusCheckResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'parent.name=Managed Support Services',
        sysparm_fields: 'name,install_status,operational_status',
        sysparm_display_value: 'all'
      }
    });
    console.log('Status Values:', JSON.stringify(statusCheckResponse.data.result, null, 2));

    // 10. Get sys_choice entries for install_status
    console.log('\n10. INSTALL_STATUS CHOICE VALUES:');
    const choicesResponse = await instance.get('/api/now/table/sys_choice', {
      params: {
        sysparm_query: 'name=cmdb_ci^element=install_status',
        sysparm_fields: 'label,value,sequence',
        sysparm_display_value: 'false'
      }
    });
    console.log('Install Status Choices:', JSON.stringify(choicesResponse.data.result, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error during diagnosis:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

diagnoseServiceOfferingLookup();
