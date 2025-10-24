/**
 * Fix Remaining 3 Firewalls
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

interface FirewallUpdate {
  name: string;
  sys_id: string;
  model_name: string;
  model_sys_id: string;
  manufacturer?: string;
}

async function fixRemaining3Firewalls() {
  console.log('🔧 Fixing Remaining 3 Firewalls');
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

  // Firewalls to fix
  const updates: FirewallUpdate[] = [
    {
      name: 'Altus - Dallas Datacenter',
      sys_id: '4ff1279ec3acb210ad36b9ff0501315f',
      model_name: 'FortiGate FG-120G',
      model_sys_id: '53d6a31ac3ecb210ad36b9ff050131f6',
    },
    {
      name: 'Altus - Livingston',
      sys_id: 'b637424dc3226a10a01d5673e4013144',
      model_name: 'SonicWall TZ 400', // Based on serial 18B169B5ACC4 and URL https://64.201.129.130:444/
      model_sys_id: '93d6e3d6c328721066d9bdb4e4013195',
      manufacturer: 'SonicWall',
    },
  ];

  for (const update of updates) {
    console.log(`Updating ${update.name}...`);
    console.log(`  Setting model to: ${update.model_name}`);

    try {
      const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${update.sys_id}`;
      const payload: any = {
        model_id: update.model_sys_id,
      };
      if (update.manufacturer) {
        payload.manufacturer = update.manufacturer;
      }

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
        continue;
      }

      console.log(`  ✅ Updated successfully`);
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }

    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('✅ Done! Verifying Corporate Office is already correct...');
  console.log('─'.repeat(70));
  console.log('');

  // Verify Corporate Office
  const corpSysId = '56328281c3226a10a01d5673e4013120';
  const corpUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${corpSysId}?sysparm_display_value=all`;

  const corpResponse = await fetch(corpUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (corpResponse.ok) {
    const corpData = await corpResponse.json();
    const corp = corpData.result;

    console.log('Corporate Office Firewall:');
    console.log(`  Model: ${corp.model_id.display_value || '(no display value)'}`);
    console.log(`  Model sys_id: ${corp.model_id.value}`);
    console.log(`  Status: ${corp.model_id.display_value ? '✅ OK' : '⚠️  Missing display value'}`);
  }
}

fixRemaining3Firewalls()
  .catch(console.error)
  .finally(() => process.exit(0));
