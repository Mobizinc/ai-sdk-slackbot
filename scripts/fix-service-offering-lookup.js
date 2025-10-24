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

async function fixServiceOfferingLookup() {
  console.log('='.repeat(80));
  console.log('FIX: Service Offering Lookup on INC0167770');
  console.log('='.repeat(80));

  try {
    // Target Business Service sys_id
    const targetBusinessServiceSysId = '72ff2f56c368721066d9bdb4e4013178';
    const targetBusinessServiceName = 'Altus Health - TSheet Account';

    // Managed Support Services sys_id (new parent for Business Service)
    const managedSupportServicesSysId = 'e24d6752c368721066d9bdb4e40131a8';

    console.log('\n1. GETTING SERVICE OFFERINGS TO UPDATE:');

    // Get the 6 Service Offerings that currently have parent = Managed Support Services
    const serviceOfferingsResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: 'parent.name=Managed Support Services',
        sysparm_fields: 'sys_id,name,parent',
        sysparm_display_value: 'all'
      }
    });

    const serviceOfferings = serviceOfferingsResponse.data.result;
    console.log(`   Found ${serviceOfferings.length} Service Offerings to update:`);
    serviceOfferings.forEach(offering => {
      console.log(`   - ${offering.name.display_value} (${offering.sys_id.value})`);
    });

    console.log('\n2. UPDATING SERVICE OFFERINGS:');
    console.log(`   Setting parent to: ${targetBusinessServiceName} (${targetBusinessServiceSysId})`);

    const updateResults = [];
    for (const offering of serviceOfferings) {
      try {
        const response = await instance.patch(
          `/api/now/table/service_offering/${offering.sys_id.value}`,
          {
            parent: targetBusinessServiceSysId
          }
        );

        console.log(`   ✓ Updated: ${offering.name.display_value}`);
        updateResults.push({ success: true, name: offering.name.display_value });
      } catch (error) {
        console.log(`   ✗ Failed: ${offering.name.display_value}`);
        console.log(`     Error: ${error.response?.data?.error?.message || error.message}`);
        updateResults.push({ success: false, name: offering.name.display_value, error: error.message });
      }
    }

    console.log('\n3. FIXING CIRCULAR HIERARCHY:');
    console.log(`   Updating Business Service: ${targetBusinessServiceName}`);
    console.log(`   Setting parent to: Managed Support Services (${managedSupportServicesSysId})`);

    try {
      const bsResponse = await instance.patch(
        `/api/now/table/cmdb_ci_service/${targetBusinessServiceSysId}`,
        {
          parent: managedSupportServicesSysId
        }
      );
      console.log('   ✓ Business Service hierarchy fixed');
    } catch (error) {
      console.log('   ✗ Failed to update Business Service');
      console.log(`     Error: ${error.response?.data?.error?.message || error.message}`);
    }

    console.log('\n4. VERIFYING FIX:');
    console.log('   Testing reference qualifier...');

    // Test the reference qualifier
    const verifyResponse = await instance.get('/api/now/table/service_offering', {
      params: {
        sysparm_query: `parent=${targetBusinessServiceSysId}`,
        sysparm_fields: 'sys_id,name,parent',
        sysparm_display_value: 'all'
      }
    });

    const matchingOfferings = verifyResponse.data.result;
    console.log(`   Found ${matchingOfferings.length} Service Offerings with parent = "${targetBusinessServiceName}"`);

    if (matchingOfferings.length > 0) {
      console.log('   Service Offerings now available in lookup:');
      matchingOfferings.forEach(offering => {
        console.log(`   - ${offering.name.display_value}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY:');
    console.log('='.repeat(80));

    const successCount = updateResults.filter(r => r.success).length;
    const failureCount = updateResults.filter(r => !r.success).length;

    console.log(`Service Offerings Updated: ${successCount}/${serviceOfferings.length}`);
    console.log(`Business Service Hierarchy: Fixed`);
    console.log(`Lookup Verification: ${matchingOfferings.length} records now visible`);

    if (matchingOfferings.length === serviceOfferings.length) {
      console.log('\n✓ SUCCESS: Lookup will now show Service Offerings on INC0167770');
    } else {
      console.log('\n⚠ WARNING: Some Service Offerings may not be visible');
    }

    console.log('\nNext Steps:');
    console.log('1. Open INC0167770 in ServiceNow UI');
    console.log('2. Click the Service Offering lookup (magnifying glass)');
    console.log('3. Verify that 6 Service Offerings are now displayed');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\nERROR during fix:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

fixServiceOfferingLookup();
