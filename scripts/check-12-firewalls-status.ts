/**
 * Check Status of 12 Firewalls with Different Names
 *
 * These firewalls exist in PROD with different names than the template
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function check12FirewallsStatus() {
  console.log('🔍 Status of 12 Firewalls in PROD (Different Naming Convention)');
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

  // All 12 firewalls marked as NEW in template
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

  let needsUpdate = 0;
  let complete = 0;

  for (let i = 0; i < firewalls.length; i++) {
    const fw = firewalls[i];
    const query = encodeURIComponent(`serial_number=${fw.serial}`);
    const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`${i + 1}. ${fw.templateName}: ❌ Query failed`);
      continue;
    }

    const data = await response.json();
    if (!data.result || data.result.length === 0) {
      console.log(`${i + 1}. ${fw.templateName}: ❌ Not found in PROD`);
      continue;
    }

    const existing = data.result[0];
    const prodName = existing.name?.display_value || existing.name;
    const hasFirmware = existing.firmware_version?.display_value || existing.firmware_version;
    const hasComments = existing.comments?.display_value || existing.comments;
    const hasInterfaceCount = existing.physical_interface_count?.display_value || existing.physical_interface_count;
    const hasWarranty = existing.warranty_expiration?.display_value || existing.warranty_expiration;
    const hasSupportGroup = existing.support_group?.display_value || existing.support_group;

    const missing = [];
    if (!hasFirmware) missing.push('Firmware');
    if (!hasComments) missing.push('Comments');
    if (!hasInterfaceCount) missing.push('Interface Count');
    if (!hasWarranty) missing.push('Warranty');
    if (!hasSupportGroup) missing.push('Support Group');

    console.log(`${i + 1}. ${fw.templateName}`);
    console.log(`   PROD Name: ${prodName}`);
    console.log(`   sys_id: ${existing.sys_id?.value || existing.sys_id}`);

    if (missing.length > 0) {
      console.log(`   ❌ NEEDS UPDATE - Missing: ${missing.join(', ')}`);
      needsUpdate++;
    } else {
      console.log(`   ✅ COMPLETE - All fields populated`);
      complete++;
    }

    console.log(`   Firmware: ${hasFirmware ? '✅ ' + hasFirmware : '❌'}`);
    console.log(`   Comments: ${hasComments ? '✅' : '❌'}`);
    console.log(`   Interface Count: ${hasInterfaceCount ? '✅ ' + hasInterfaceCount : '❌'}`);
    console.log(`   Warranty: ${hasWarranty ? '✅ ' + hasWarranty : '❌'}`);
    console.log(`   Support Group: ${hasSupportGroup ? '✅ ' + hasSupportGroup : '❌'}`);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Firewalls: ${firewalls.length}`);
  console.log(`  ✅ Complete: ${complete}`);
  console.log(`  ❌ Needs Update: ${needsUpdate}`);
  console.log('');

  if (needsUpdate > 0) {
    console.log('REQUIRED ACTIONS:');
    console.log('  1. Update template to mark these firewalls as "EXISTS"');
    console.log('  2. Add their PROD sys_ids to the template');
    console.log('  3. Optionally rename them to match "Altus - Location" convention');
    console.log('  4. Re-run PROD import to update all fields');
  }
  console.log('');
}

check12FirewallsStatus()
  .catch(console.error)
  .finally(() => process.exit(0));
