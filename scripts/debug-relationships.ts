/**
 * Debug Relationships
 *
 * Check all relationships that were created
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

async function debugRelationships() {
  console.log('🔍 Debug Relationships');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.DEV_SERVICENOW_URL || process.env.SERVICENOW_URL;
  const username = process.env.DEV_SERVICENOW_USERNAME || process.env.SERVICENOW_USERNAME;
  const password = process.env.DEV_SERVICENOW_PASSWORD || process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.DEV_SERVICENOW_URL ? 'DEV' : 'PRODUCTION';
  console.log(`Environment: ${environment}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Read the expected relationships from CSV
  const mappingPath = path.join(
    process.cwd(),
    'backup',
    'network-import',
    'firewall-network-relationships.csv'
  );

  const csvContent = fs.readFileSync(mappingPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  console.log('Expected relationships from CSV:');
  console.log('─'.repeat(70));

  const expectedPairs: Array<{firewall: string, network: string, location: string}> = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 5) {
      const firewallSysId = parts[0];
      const networkSysId = parts[2];
      const location = parts[4].replace(/^"|"$/g, '');

      expectedPairs.push({
        firewall: firewallSysId,
        network: networkSysId,
        location,
      });

      console.log(`${i}. ${location}: FW ${firewallSysId} → NET ${networkSysId}`);
    }
  }

  console.log('');
  console.log(`Total expected: ${expectedPairs.length}`);
  console.log('');

  // Check each relationship individually
  console.log('Checking each relationship in ServiceNow:');
  console.log('─'.repeat(70));

  const relationshipType = '5599a965c0a8010e00da3b58b113d70e';
  let found = 0;
  let notFound = 0;

  for (const pair of expectedPairs) {
    const query = encodeURIComponent(`parent=${pair.firewall}^child=${pair.network}^type=${relationshipType}`);
    const url = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${query}&sysparm_limit=1&sysparm_display_value=all`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        const rel = data.result[0];
        const sysId = rel.sys_id?.value || rel.sys_id;
        console.log(`✅ ${pair.location}: Found (${sysId})`);
        found++;
      } else {
        console.log(`❌ ${pair.location}: NOT FOUND`);
        notFound++;
      }
    } else {
      console.log(`❌ ${pair.location}: Query failed (${response.status})`);
      notFound++;
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total Expected: ${expectedPairs.length}`);
  console.log(`  ✅ Found: ${found}`);
  console.log(`  ❌ Not Found: ${notFound}`);
  console.log('');

  if (found === expectedPairs.length) {
    console.log('✅ All relationships exist!');
  } else {
    console.log(`⚠️  ${notFound} relationships missing or failed`);
  }

  console.log('');
}

debugRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
