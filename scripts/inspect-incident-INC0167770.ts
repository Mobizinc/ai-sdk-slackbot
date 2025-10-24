/**
 * Inspect Specific Incident INC0167770
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function inspectIncident() {
  console.log('🔍 Inspecting Incident INC0167770');
  console.log('='.repeat(80));
  console.log('');

  // Fetch the incident with all fields
  const url = `${instanceUrl}/api/now/table/incident?sysparm_query=number=INC0167770&sysparm_display_value=all&sysparm_limit=1`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const data = await response.json();

  if (!data.result || data.result.length === 0) {
    console.log('❌ Incident not found');
    return;
  }

  const incident = data.result[0];

  console.log('Incident Details:');
  console.log(`  Number: ${incident.number?.value || incident.number}`);
  console.log(`  Short Description: ${incident.short_description?.value || incident.short_description}`);
  console.log(`  Company: ${incident.company?.display_value || incident.company}`);
  console.log(`  Caller: ${incident.caller_id?.display_value || incident.caller_id}`);
  console.log('');

  console.log('Service-Related Fields:');
  console.log(`  business_service: ${incident.business_service?.display_value || incident.business_service || '(empty)'}`);
  console.log(`  business_service (sys_id): ${incident.business_service?.value || '(empty)'}`);
  console.log(`  service_offering: ${incident.service_offering?.display_value || incident.service_offering || '(empty)'}`);
  console.log(`  service_offering (sys_id): ${incident.service_offering?.value || '(empty)'}`);
  console.log('');

  console.log('Company Details:');
  console.log(`  Company Name: ${incident.company?.display_value || incident.company}`);
  console.log(`  Company sys_id: ${incident.company?.value || '(empty)'}`);
  console.log('');

  // Now try to query Service Offerings to see what would be available
  console.log('─'.repeat(80));
  console.log('Querying ALL Service Offerings in system:');
  console.log('');

  const soUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_fields=sys_id,name,sys_class_name,parent&sysparm_display_value=all&sysparm_limit=20`;

  const soResp = await fetch(soUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const soData = await soResp.json();

  if (soData.result && soData.result.length > 0) {
    console.log(`Found ${soData.result.length} Service Offerings:`);
    soData.result.forEach((so: any) => {
      const name = so.name?.display_value || so.name;
      const sys_id = so.sys_id?.value || so.sys_id;
      const className = so.sys_class_name?.display_value || so.sys_class_name;
      const parent = so.parent?.display_value || so.parent;

      console.log(`  - ${name}`);
      console.log(`    sys_id: ${sys_id}`);
      console.log(`    Class: ${className}`);
      console.log(`    Parent: ${parent || '(none)'}`);
    });
  } else {
    console.log('  (No Service Offerings found)');
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('Now querying with sys_class_name filter...');
  console.log('');

  // The reference field references "Offering" table - let's check that
  const offeringUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=sys_class_name=Offering&sysparm_fields=sys_id,name,sys_class_name&sysparm_display_value=all&sysparm_limit=20`;

  const offeringResp = await fetch(offeringUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const offeringData = await offeringResp.json();

  if (offeringData.result && offeringData.result.length > 0) {
    console.log(`Found ${offeringData.result.length} records with sys_class_name='Offering':`);
    offeringData.result.forEach((so: any) => {
      const name = so.name?.display_value || so.name;
      const sys_id = so.sys_id?.value || so.sys_id;
      const className = so.sys_class_name?.display_value || so.sys_class_name;

      console.log(`  - ${name} (${sys_id}) [${className}]`);
    });
  } else {
    console.log('  ❌ NO RECORDS with sys_class_name="Offering"');
    console.log('');
    console.log('This is the problem! The service_offering field references "Offering" class,');
    console.log('but our Service Offerings have sys_class_name="Offering" (with capital O)');
  }
}

inspectIncident().catch(console.error);
