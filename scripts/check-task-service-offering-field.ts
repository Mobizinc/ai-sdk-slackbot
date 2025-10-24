/**
 * Check service_offering Field on Task Table
 * (Incident extends Task, so the field might be defined there)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkTaskServiceOfferingField() {
  console.log('🔍 Checking service_offering Field on Task Table');
  console.log('='.repeat(80));
  console.log('');

  // Check task table
  const tables = ['task', 'cmdb_ci_service', 'service_offering'];

  for (const table of tables) {
    console.log(`Table: ${table}`);
    console.log('─'.repeat(80));

    const url = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=${table}^element=service_offering&sysparm_fields=element,column_label,reference,ref_qual,internal_type&sysparm_display_value=all`;

    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (data.result && data.result.length > 0) {
      const entry = data.result[0];

      console.log('Field Configuration:');
      console.log(`  Element: ${entry.element?.value || entry.element}`);
      console.log(`  Label: ${entry.column_label?.display_value || entry.column_label}`);
      console.log(`  Type: ${entry.internal_type?.display_value || entry.internal_type}`);
      console.log(`  Reference Table: ${entry.reference?.display_value || entry.reference || '(none)'}`);
      console.log(`  Reference Qualifier: ${entry.ref_qual?.display_value || entry.ref_qual || '(none)'}`);
      console.log('');
    } else {
      console.log('  (Field not found on this table)');
      console.log('');
    }
  }

  // Also check sys_db_object to understand table inheritance
  console.log('─'.repeat(80));
  console.log('Checking Table Inheritance:');
  console.log('');

  const tableUrl = `${instanceUrl}/api/now/table/sys_db_object?sysparm_query=name=incident&sysparm_fields=name,super_class,label&sysparm_display_value=all`;

  const tableResp = await fetch(tableUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
  });

  const tableData = await tableResp.json();

  if (tableData.result && tableData.result.length > 0) {
    const table = tableData.result[0];
    console.log(`Table: ${table.label?.display_value || table.label}`);
    console.log(`  Name: ${table.name?.value || table.name}`);
    console.log(`  Extends: ${table.super_class?.display_value || table.super_class || '(none)'}`);
  }
}

checkTaskServiceOfferingField().catch(console.error);
