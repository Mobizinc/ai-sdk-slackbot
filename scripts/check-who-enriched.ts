/**
 * Check Who Enriched the 12 Firewalls
 *
 * Investigate who updated these records and when
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function checkWhoEnriched() {
  console.log('🔍 Checking Who Enriched the 12 Firewalls');
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
    { name: 'Altus - Pearland', serial: 'FGT60FTK23050889' },
    { name: 'Altus - Baytown', serial: 'FGT60FTK23051089' },
    { name: 'Altus - Crosby', serial: 'FGT60FTK23051418' },
  ];

  for (const fw of firewalls) {
    const query = encodeURIComponent(`serial_number=${fw.serial}`);
    const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=true&sysparm_fields=sys_id,name,serial_number,firmware_version,comments,physical_interface_count,warranty_expiration,support_group,sys_updated_by,sys_updated_on,sys_created_by,sys_created_on&sysparm_limit=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`${fw.name}: ❌ Query failed`);
      continue;
    }

    const data = await response.json();
    if (!data.result || data.result.length === 0) {
      console.log(`${fw.name}: ❌ Not found`);
      continue;
    }

    const record = data.result[0];

    console.log(`${fw.name}`);
    console.log(`  PROD Name: ${record.name}`);
    console.log(`  sys_id: ${record.sys_id}`);
    console.log('');
    console.log('  Creation:');
    console.log(`    Created By: ${record.sys_created_by}`);
    console.log(`    Created On: ${record.sys_created_on}`);
    console.log('');
    console.log('  Last Update:');
    console.log(`    Updated By: ${record.sys_updated_by}`);
    console.log(`    Updated On: ${record.sys_updated_on}`);
    console.log('');
    console.log('  Current Data:');
    console.log(`    Firmware: ${record.firmware_version || '(empty)'}`);
    console.log(`    Physical Interface Count: ${record.physical_interface_count || '(empty)'}`);
    console.log(`    Warranty: ${record.warranty_expiration || '(empty)'}`);
    console.log(`    Support Group: ${record.support_group || '(empty)'}`);

    // Show first 200 chars of comments
    const comments = record.comments || '';
    if (comments) {
      const preview = comments.substring(0, 200);
      console.log(`    Comments: ${preview}${comments.length > 200 ? '...' : ''}`);
    } else {
      console.log(`    Comments: (empty)`);
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('');
  }
}

checkWhoEnriched()
  .catch(console.error)
  .finally(() => process.exit(0));
