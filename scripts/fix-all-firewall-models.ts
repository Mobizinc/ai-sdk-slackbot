/**
 * Fix All Firewall Model References in PROD
 *
 * Update all firewalls to use correct cmdb_model sys_id references
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function fixAllFirewallModels() {
  console.log('🔧 Fixing All Firewall Model References');
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

  // Model mapping: old string value -> correct cmdb_model sys_id
  const modelMapping: Record<string, string> = {
    // Fortinet models
    '60F': 'fc6db186c3c06658a01d5673e401317a',        // FortiGate-60F (existing)
    '60D': '4fd6e3d6c328721066d9bdb4e4013104',        // FortiGate-60D (newly created)
    '100D': '0fd6a3d6c328721066d9bdb4e40131ff',       // FortiGate-100D (newly created)
    '100F': '386db186c3c06658a01d5673e401317b',       // FortiGate-100F (existing)
    'FG-120G': '53d6a31ac3ecb210ad36b9ff050131f6',    // FortiGate-FG-120G (newly created)
    // Sonicwall models
    'NSA 2650': '87d6e3d6c328721066d9bdb4e4013191',   // SonicWall NSA 2650 (newly created)
    'TZ 350': '97d6a31ac3ecb210ad36b9ff050131fa',     // SonicWall TZ 350 (newly created)
    'TZ 400': '93d6e3d6c328721066d9bdb4e4013195',     // SonicWall TZ 400 (newly created)
  };

  // Get all Altus firewalls
  const query = encodeURIComponent('nameLIKEAltus^ORDERBYname');
  const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${query}&sysparm_limit=50`;

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Failed to fetch firewalls');
    process.exit(1);
  }

  const data = await response.json();
  const firewalls = data.result;

  console.log(`Found ${firewalls.length} Altus firewalls`);
  console.log('');

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const firewall of firewalls) {
    const name = firewall.name || '';
    const sysId = firewall.sys_id || '';
    const currentModelValue = (typeof firewall.model_id === 'object' && firewall.model_id !== null)
      ? firewall.model_id.value || ''
      : firewall.model_id || '';
    const currentModelDisplay = (typeof firewall.model_id === 'object' && firewall.model_id !== null)
      ? firewall.model_id.display_value || ''
      : '';

    // Skip if already has correct reference (sys_id format with dashes and valid display value)
    if (currentModelValue && currentModelValue.includes('-') && currentModelValue.length > 30 && currentModelDisplay) {
      console.log(`  ⏭️  ${name}: Already has valid reference (${currentModelDisplay})`);
      skippedCount++;
      continue;
    }

    // Check if we have a mapping for this model
    const correctModelSysId = modelMapping[currentModelValue];

    if (!correctModelSysId) {
      if (!currentModelValue) {
        console.log(`  ⚠️  ${name}: No model_id set (needs manual intervention)`);
      } else {
        console.log(`  ⚠️  ${name}: Unknown model "${currentModelValue}" (needs manual intervention)`);
      }
      errorCount++;
      continue;
    }

    // Update the firewall
    console.log(`  🔧 ${name}: ${currentModelValue} -> ${correctModelSysId}`);

    try {
      const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_netgear/${sysId}`;
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: correctModelSysId,
        }),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.log(`     ❌ Failed: ${updateResponse.status} - ${errorText.substring(0, 100)}`);
        errorCount++;
        continue;
      }

      console.log(`     ✅ Updated`);
      updatedCount++;
    } catch (error) {
      console.log(`     ❌ Error: ${error}`);
      errorCount++;
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Firewalls: ${firewalls.length}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already valid): ${skippedCount}`);
  console.log(`Errors/Manual intervention needed: ${errorCount}`);
  console.log('');

  if (errorCount === 0 && updatedCount > 0) {
    console.log('🎉 All firewall models have been fixed!');
  } else if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} firewall(s) need manual intervention`);
  } else {
    console.log('✅ All firewalls already have valid model references');
  }
}

fixAllFirewallModels()
  .catch(console.error)
  .finally(() => process.exit(0));
