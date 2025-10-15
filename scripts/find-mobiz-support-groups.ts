/**
 * Find Mobiz Support Groups in ServiceNow
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function findMobizSupportGroups() {
  console.log('🔍 Finding Mobiz Support Groups');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Query for all active Mobiz groups
  const query = encodeURIComponent('active=true^companyLIKEMobiz');
  const url = `${instanceUrl}/api/now/table/sys_user_group?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=200`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to query: ${response.status}`);
    }

    const data = await response.json();
    const groups = data.result || [];

    console.log(`Found ${groups.length} active Mobiz support groups`);
    console.log('');

    // Filter for network/infrastructure/operations groups
    const techGroups = groups.filter((g: any) => {
      const name = (g.name?.display_value || '').toLowerCase();
      return name.includes('network') ||
             name.includes('infrastructure') ||
             name.includes('operations') ||
             name.includes('technical') ||
             name.includes('system') ||
             name.includes('platform') ||
             name.includes('helpdesk') ||
             name.includes('support') ||
             name.includes('noc') ||
             name.includes('soc');
    });

    console.log('🔧 TECHNICAL/OPERATIONS GROUPS:');
    console.log('─'.repeat(70));
    console.log('');

    for (const group of techGroups) {
      console.log(group.name.display_value);
      console.log(`  sys_id: ${group.sys_id.value}`);
      console.log(`  type: ${group.type.display_value || 'N/A'}`);
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('📋 ALL MOBIZ GROUPS:');
    console.log('─'.repeat(70));
    console.log('');

    for (const group of groups) {
      console.log(group.name.display_value);
      console.log(`  sys_id: ${group.sys_id.value}`);
      console.log(`  type: ${group.type.display_value || 'N/A'}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findMobizSupportGroups()
  .catch(console.error)
  .finally(() => process.exit(0));
