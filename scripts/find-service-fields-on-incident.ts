/**
 * Find All Service-Related Fields on Incident Table
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function findServiceFields() {
  console.log('🔍 Finding Service-Related Fields on Incident Table');
  console.log('='.repeat(80));
  console.log('');

  // Query for any field on incident table that contains "service" or "offering"
  const url = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=incident^elementLIKEservice^ORDERBYelement&sysparm_fields=element,column_label,internal_type,reference&sysparm_display_value=all&sysparm_limit=50`;

  const response = await fetch(url, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const data = await response.json();

  console.log('Fields on Incident table containing "service":');
  if (data.result && data.result.length > 0) {
    data.result.forEach((field: any) => {
      const element = field.element?.value || field.element;
      const label = field.column_label?.display_value || field.column_label;
      const type = field.internal_type?.display_value || field.internal_type;
      const reference = field.reference?.display_value || field.reference;

      console.log(`  ${element}`);
      console.log(`    Label: ${label}`);
      console.log(`    Type: ${type}`);
      if (reference) {
        console.log(`    References: ${reference}`);
      }
      console.log('');
    });
  } else {
    console.log('  (No fields found)');
  }

  // Also query for "offering" fields
  console.log('─'.repeat(80));
  const offeringUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=incident^elementLIKEoffering^ORDERBYelement&sysparm_fields=element,column_label,internal_type,reference&sysparm_display_value=all&sysparm_limit=50`;

  const offeringResp = await fetch(offeringUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const offeringData = await offeringResp.json();

  console.log('Fields on Incident table containing "offering":');
  if (offeringData.result && offeringData.result.length > 0) {
    offeringData.result.forEach((field: any) => {
      const element = field.element?.value || field.element;
      const label = field.column_label?.display_value || field.column_label;
      const type = field.internal_type?.display_value || field.internal_type;
      const reference = field.reference?.display_value || field.reference;

      console.log(`  ${element}`);
      console.log(`    Label: ${label}`);
      console.log(`    Type: ${type}`);
      if (reference) {
        console.log(`    References: ${reference}`);
      }
      console.log('');
    });
  } else {
    console.log('  (No fields found)');
  }

  // Also get ONE incident record to see what fields it actually has
  console.log('─'.repeat(80));
  console.log('Fetching a sample Incident record to see actual fields...');
  console.log('');

  const incUrl = `${instanceUrl}/api/now/table/incident?sysparm_limit=1&sysparm_display_value=all`;

  const incResp = await fetch(incUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const incData = await incResp.json();

  if (incData.result && incData.result.length > 0) {
    const incident = incData.result[0];

    console.log('Fields on actual Incident record containing "service":');
    Object.keys(incident).filter(key => key.toLowerCase().includes('service')).forEach(key => {
      const value = incident[key];
      const display = typeof value === 'object' ? value.display_value : value;
      console.log(`  ${key}: ${display}`);
    });

    console.log('');
    console.log('Fields on actual Incident record containing "offering":');
    Object.keys(incident).filter(key => key.toLowerCase().includes('offering')).forEach(key => {
      const value = incident[key];
      const display = typeof value === 'object' ? value.display_value : value;
      console.log(`  ${key}: ${display}`);
    });
  }
}

findServiceFields().catch(console.error);
