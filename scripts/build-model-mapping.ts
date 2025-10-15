/**
 * Build Model Mapping from cmdb_model Table
 *
 * Find all Fortinet and Sonicwall models to create mapping
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

async function buildModelMapping() {
  console.log('🔍 Building Model Mapping from cmdb_model Table');
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

  // Search for Fortinet models
  console.log('Searching for Fortinet models...');
  const fortinetQuery = encodeURIComponent('display_nameLIKEFortinet');
  const fortinetUrl = `${instanceUrl}/api/now/table/cmdb_model?sysparm_query=${fortinetQuery}&sysparm_limit=100`;

  const fortinetResponse = await fetch(fortinetUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  const fortinetData = await fortinetResponse.json();
  const fortinetModels = fortinetData.result;

  console.log(`Found ${fortinetModels.length} Fortinet models`);
  console.log('');

  // Search for Sonicwall models
  console.log('Searching for Sonicwall models...');
  const sonicwallQuery = encodeURIComponent('display_nameLIKESonicwall^ORdisplay_nameLIKESonicWALL');
  const sonicwallUrl = `${instanceUrl}/api/now/table/cmdb_model?sysparm_query=${sonicwallQuery}&sysparm_limit=100`;

  const sonicwallResponse = await fetch(sonicwallUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  const sonicwallData = await sonicwallResponse.json();
  const sonicwallModels = sonicwallData.result;

  console.log(`Found ${sonicwallModels.length} Sonicwall models`);
  console.log('');

  // Build mapping
  const mapping: Record<string, { sys_id: string; name: string; display_name: string }> = {};

  console.log('─'.repeat(70));
  console.log('FORTINET MODELS');
  console.log('─'.repeat(70));
  console.log('');

  for (const model of fortinetModels) {
    const name = model.name || '';
    const displayName = model.display_name || '';
    const sysId = model.sys_id || '';

    // Try to extract short model name from display name
    // e.g., "Fortinet FortiGate-100F" -> "100F"
    // e.g., "Fortinet FortiGate-60F" -> "60F"
    const match = displayName.match(/FortiGate[- ]?(\w+)/i) || displayName.match(/FortiSwitch[- ]?(\w+)/i);
    if (match && match[1]) {
      const shortName = match[1];
      mapping[shortName] = { sys_id: sysId, name: name, display_name: displayName };
      console.log(`  ${shortName} -> ${sysId} (${displayName})`);
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('SONICWALL MODELS');
  console.log('─'.repeat(70));
  console.log('');

  for (const model of sonicwallModels) {
    const name = model.name || '';
    const displayName = model.display_name || '';
    const sysId = model.sys_id || '';

    // Try to extract short model name
    // e.g., "SonicWall TZ 400" -> "TZ 400"
    // e.g., "SonicWall NSA 2650" -> "NSA 2650"
    const match = displayName.match(/SonicWall\s+(.+)/i) || displayName.match(/SonicWALL\s+(.+)/i);
    if (match && match[1]) {
      const shortName = match[1].trim();
      mapping[shortName] = { sys_id: sysId, name: name, display_name: displayName };
      console.log(`  ${shortName} -> ${sysId} (${displayName})`);
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total models mapped: ${Object.keys(mapping).length}`);
  console.log('');

  // Save mapping to file
  const mappingJson = JSON.stringify(mapping, null, 2);
  fs.writeFileSync('backup/model-mapping.json', mappingJson);
  console.log('✅ Mapping saved to backup/model-mapping.json');

  // Also print the mapping in a format we can use
  console.log('');
  console.log('─'.repeat(70));
  console.log('MODEL MAPPING FOR SCRIPT');
  console.log('─'.repeat(70));
  console.log('const modelMapping: Record<string, string> = {');
  for (const [key, value] of Object.entries(mapping)) {
    console.log(`  '${key}': '${value.sys_id}', // ${value.display_name}`);
  }
  console.log('};');
}

buildModelMapping()
  .catch(console.error)
  .finally(() => process.exit(0));
