/**
 * Get sys_ids for All 12 Firewalls
 *
 * Systematically retrieve sys_ids from PROD for CSV update
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function get12SysIds() {
  console.log('🔍 Getting sys_ids for 12 Firewalls from PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const firewalls = [
    { templateName: 'Altus - Pearland', serial: 'FGT60FTK23050889' },
    { templateName: 'Altus - Baytown', serial: 'FGT60FTK23051089' },
    { templateName: 'Altus - Crosby', serial: 'FGT60FTK23051418' },
    { templateName: 'Altus - Kingwood', serial: 'FGT60FTK23055496' },
    { templateName: 'Altus - Pasadena', serial: 'FGT60FTK23054832' },
    { templateName: 'Altus - Porter', serial: 'FGT60FTK23057140' },
    { templateName: 'Altus - Anderson Mill', serial: 'FGT60FTK2209JZ6K' },
    { templateName: 'Altus - Arboretum', serial: 'FGT60FTK2209C5KG' },
    { templateName: 'Altus - Mueller', serial: 'FGT60FTK2209C54S' },
    { templateName: 'Altus - Pflugerville', serial: 'FGT60FTK2209C5NH' },
    { templateName: 'Altus - Riversid', serial: 'FGT60FTK23005728' },
    { templateName: 'Altus - South Lamar', serial: 'FGT60FTK2209C5AV' },
  ];

  const results = [];

  for (const fw of firewalls) {
    const query = encodeURIComponent(`serial_number=${fw.serial}`);
    const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=true&sysparm_fields=sys_id,name&sysparm_limit=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`❌ ${fw.templateName}: Query failed`);
      continue;
    }

    const data = await response.json();
    if (!data.result || data.result.length === 0) {
      console.log(`❌ ${fw.templateName}: Not found`);
      continue;
    }

    const record = data.result[0];
    results.push({
      templateName: fw.templateName,
      serial: fw.serial,
      prodName: record.name,
      sysId: record.sys_id,
    });

    console.log(`✅ ${fw.templateName}`);
    console.log(`   PROD Name: ${record.name}`);
    console.log(`   sys_id: ${record.sys_id}`);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('CSV UPDATE MAPPING:');
  console.log('─'.repeat(70));
  console.log('');

  for (const r of results) {
    console.log(`${r.serial} → status=EXISTS, sys_id=${r.sysId}, name=${r.templateName}`);
  }

  console.log('');
  console.log(`Total: ${results.length} firewalls ready for template update`);
  console.log('');
}

get12SysIds()
  .catch(console.error)
  .finally(() => process.exit(0));
