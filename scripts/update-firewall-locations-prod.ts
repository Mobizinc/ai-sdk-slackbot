/**
 * Update Firewall Locations in PROD
 *
 * Fix location assignments for Amarillo S/W, Riverside, and Livingston firewalls
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

interface FirewallUpdate {
  name: string;
  sys_id: string;
  old_location: string;
  new_location: string;
  new_location_sys_id: string;
}

async function updateFirewallLocationsProd() {
  console.log('🔧 Updating Firewall Locations in PROD');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  console.log(`URL: ${instanceUrl}`);
  console.log('');
  console.log('⚠️  WARNING: Updating firewall locations in PRODUCTION');
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Firewalls to update
  const updates: FirewallUpdate[] = [
    {
      name: 'Altus - Amarillo S',
      sys_id: '69764a89c3226a10a01d5673e40131e2',
      old_location: 'AMA North',
      new_location: 'AMA South',
      new_location_sys_id: '0b14746c8361261068537cdfeeaad3a4',
    },
    {
      name: 'Altus - Amarillo W',
      sys_id: '8296cec9c3226a10a01d5673e4013146',
      old_location: 'AMA North',
      new_location: 'AMA West',
      new_location_sys_id: '0b14746c8361261068537cdfeeaad3a5',
    },
    {
      name: 'Altus - Riversid',
      sys_id: '78d58249c3226a10a01d5673e4013159',
      old_location: 'HDA-Riverside',
      new_location: 'Riverside',
      new_location_sys_id: '8714746c8361261068537cdfeeaad39c',
    },
    {
      name: 'Altus - Livingston',
      sys_id: 'b637424dc3226a10a01d5673e4013144',
      old_location: '(no location)',
      new_location: 'Livingston',
      new_location_sys_id: '8714746c8361261068537cdfeeaad39d',
    },
  ];

  console.log(`Updating ${updates.length} firewall location(s)`);
  console.log('─'.repeat(70));
  console.log('');

  let updated = 0;
  let errors = 0;

  for (const update of updates) {
    console.log(`Updating: ${update.name}`);
    console.log(`  Old location: ${update.old_location}`);
    console.log(`  New location: ${update.new_location} (${update.new_location_sys_id})`);

    const payload = {
      location: update.new_location_sys_id,
    };

    try {
      const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${update.sys_id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${response.status} - ${errorText.substring(0, 200)}`);
        errors++;
      } else {
        console.log(`  ✅ Updated successfully`);
        updated++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      errors++;
    }

    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Updates: ${updates.length}`);
  console.log(`  ✅ Updated: ${updated}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log('');

  if (updated === updates.length) {
    console.log('✅ All firewall locations updated successfully!');
  } else {
    console.log('⚠️  Some updates failed. Review the output above.');
  }
}

updateFirewallLocationsProd()
  .catch(console.error)
  .finally(() => process.exit(0));
