/**
 * Audit All Firewall Models in PROD
 *
 * Check that all firewalls have model_id properly set to reference cmdb_model records
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

interface FirewallAudit {
  name: string;
  sys_id: string;
  manufacturer: string;
  model_display: string;
  model_value: string;
  status: 'OK' | 'MISSING' | 'INVALID';
  issue?: string;
}

async function auditFirewallModels() {
  console.log('🔍 Auditing All Firewall Models in PROD');
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

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Get all Altus firewalls
  const query = encodeURIComponent('nameLIKEAltus^ORDERBYname');
  const url = `${instanceUrl}/api/now/table/cmdb_ci_netgear?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=50`;

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
  console.log('Auditing model fields...');
  console.log('');

  const results: FirewallAudit[] = [];

  for (const firewall of firewalls) {
    const modelDisplay = firewall.model_id?.display_value || '';
    const modelValue = firewall.model_id?.value || '';
    const manufacturer = firewall.manufacturer?.display_value || '';

    let status: 'OK' | 'MISSING' | 'INVALID' = 'OK';
    let issue: string | undefined;

    if (!modelValue) {
      status = 'MISSING';
      issue = 'No model_id set';
    } else if (!modelDisplay) {
      status = 'INVALID';
      issue = `Invalid reference: ${modelValue} (model record not found in cmdb_model)`;
    }

    results.push({
      name: firewall.name?.display_value || firewall.name || '',
      sys_id: firewall.sys_id?.value || firewall.sys_id || '',
      manufacturer: manufacturer,
      model_display: modelDisplay,
      model_value: modelValue,
      status: status,
      issue: issue,
    });
  }

  // Display results
  const okCount = results.filter(r => r.status === 'OK').length;
  const missingCount = results.filter(r => r.status === 'MISSING').length;
  const invalidCount = results.filter(r => r.status === 'INVALID').length;

  console.log('─'.repeat(70));
  console.log('AUDIT RESULTS');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`✅ OK: ${okCount}/${firewalls.length}`);
  console.log(`❌ MISSING: ${missingCount}/${firewalls.length}`);
  console.log(`⚠️  INVALID: ${invalidCount}/${firewalls.length}`);
  console.log('');

  // Show OK firewalls
  if (okCount > 0) {
    console.log('─'.repeat(70));
    console.log('✅ FIREWALLS WITH VALID MODELS');
    console.log('─'.repeat(70));
    console.log('');

    for (const result of results.filter(r => r.status === 'OK')) {
      console.log(`  ✅ ${result.name}`);
      console.log(`     Manufacturer: ${result.manufacturer}`);
      console.log(`     Model: ${result.model_display}`);
      console.log('');
    }
  }

  // Show problematic firewalls
  if (missingCount > 0 || invalidCount > 0) {
    console.log('─'.repeat(70));
    console.log('❌ FIREWALLS WITH MODEL ISSUES');
    console.log('─'.repeat(70));
    console.log('');

    for (const result of results.filter(r => r.status !== 'OK')) {
      console.log(`  ${result.status === 'MISSING' ? '❌' : '⚠️'} ${result.name}`);
      console.log(`     sys_id: ${result.sys_id}`);
      console.log(`     Manufacturer: ${result.manufacturer}`);
      console.log(`     Issue: ${result.issue}`);
      console.log('');
    }
  }

  console.log('─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));

  if (missingCount === 0 && invalidCount === 0) {
    console.log('🎉 All firewalls have valid model references!');
  } else {
    console.log(`⚠️  ${missingCount + invalidCount} firewall(s) need model updates`);
  }
}

auditFirewallModels()
  .catch(console.error)
  .finally(() => process.exit(0));
