/**
 * Check what fields exist on INC0167957 and their values
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function checkIncidentFields() {
  console.log('🔍 CHECKING INCIDENT FIELDS FOR INC0167957');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get ALL fields from the incident
    const response = await fetch(
      'https://mobiz.service-now.com/api/now/table/incident?sysparm_query=number=INC0167957&sysparm_display_value=all&sysparm_limit=1',
      {
        headers: {
          'Authorization': `Basic ${Buffer.from('SVC.Mobiz.Integration.TableAPI.PROD:jOH2NgppZwdSY+I').toString('base64')}`,
          'Accept': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (data.result && data.result.length > 0) {
      const incident = data.result[0];

      console.log('INCIDENT BASIC INFO:');
      console.log(`  Number: ${incident.number}`);
      console.log(`  Short Description: ${incident.short_description?.display_value || incident.short_description}`);
      console.log(`  Company: ${incident.company?.display_value || 'NOT SET'}`);
      console.log(`  State: ${incident.state?.display_value || 'NOT SET'}`);
      console.log('');

      console.log('SERVICE-RELATED FIELDS:');
      console.log('-'.repeat(80));

      // Helper to extract display value
      const extractValue = (field: any) => {
        if (!field) return '(empty)';
        if (typeof field === 'string') return field;
        if (field.display_value) return field.display_value;
        if (field.value) return field.value;
        return JSON.stringify(field);
      };

      const extractSysId = (field: any) => {
        if (!field) return '';
        if (field.value && typeof field.value === 'string') return field.value;
        if (typeof field === 'string' && field.length === 32) return field;
        return '';
      };

      // Check for service_offering field
      if ('service_offering' in incident) {
        const value = extractValue(incident.service_offering);
        const sysId = extractSysId(incident.service_offering);
        console.log(`  service_offering: ${value}`);
        if (sysId) console.log(`    └─ sys_id: ${sysId}`);
      } else {
        console.log('  service_offering: [FIELD DOES NOT EXIST]');
      }

      // Check for business_service field
      if ('business_service' in incident) {
        const value = extractValue(incident.business_service);
        const sysId = extractSysId(incident.business_service);
        console.log(`  business_service: ${value}`);
        if (sysId) console.log(`    └─ sys_id: ${sysId}`);
      } else {
        console.log('  business_service: [FIELD DOES NOT EXIST]');
      }

      // Check for cmdb_ci field (sometimes used for services)
      if ('cmdb_ci' in incident) {
        const value = extractValue(incident.cmdb_ci);
        const sysId = extractSysId(incident.cmdb_ci);
        console.log(`  cmdb_ci: ${value}`);
        if (sysId) console.log(`    └─ sys_id: ${sysId}`);
      } else {
        console.log('  cmdb_ci: [FIELD DOES NOT EXIST]');
      }

      // Check for u_application_service or similar custom fields
      const customFields = Object.keys(incident).filter(k =>
        k.includes('service') || k.includes('application') || k.includes('offering')
      );

      if (customFields.length > 0) {
        console.log('');
        console.log('OTHER SERVICE-RELATED FIELDS:');
        customFields.forEach(field => {
          if (!['service_offering', 'business_service'].includes(field)) {
            const value = incident[field]?.display_value || incident[field] || '(empty)';
            console.log(`  ${field}: ${value}`);
          }
        });
      }

      console.log('');
      console.log('='.repeat(80));
      console.log('FIELD ANALYSIS:');
      console.log('='.repeat(80));

      // Analyze what's set
      const serviceOffering = incident.service_offering?.display_value || incident.service_offering;
      const businessService = incident.business_service?.display_value || incident.business_service;

      console.log('');
      console.log('Current Values:');
      console.log(`  service_offering = "${serviceOffering || 'NOT SET'}"`);
      console.log(`  business_service = "${businessService || 'NOT SET'}"`);
      console.log('');

      console.log('Expected Values:');
      console.log(`  service_offering = "Application Administration" (Service Offering)`);
      console.log(`  business_service = "Altus Health - Gorev Production" (Application Service)`);
      console.log('');

      // Identify the issue
      if (businessService === 'Application Administration') {
        console.log('❌ ISSUE IDENTIFIED:');
        console.log('   "Application Administration" is in business_service field');
        console.log('   but it\'s a SERVICE OFFERING, not a Business Service!');
        console.log('');
        console.log('   This suggests field confusion or misconfiguration.');
      }

      if (!serviceOffering || serviceOffering === 'NOT SET' || serviceOffering === '') {
        console.log('❌ ISSUE: service_offering field is NOT SET');
      }

      console.log('');
      console.log('QUESTION FOR USER:');
      console.log('  Which field on the incident form are you trying to populate?');
      console.log('  - Service Offering field?');
      console.log('  - Business Service field?');
      console.log('  - CMDB CI field?');
      console.log('  - Some other custom field?');

    } else {
      console.log('❌ Incident INC0167957 not found');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkIncidentFields()
  .then(() => {
    console.log('');
    console.log('✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
