/**
 * Research CMDB Relationship Table
 *
 * Query ServiceNow to understand:
 * 1. cmdb_rel_ci table structure
 * 2. Available relationship types
 * 3. How to create CI-to-CI relationships
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

async function researchCMDBRelationships() {
  console.log('🔍 Researching CMDB Relationship Table');
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
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // 1. Check cmdb_rel_ci table structure
  console.log('1. Checking cmdb_rel_ci table structure');
  console.log('─'.repeat(70));

  const relTableUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_limit=1&sysparm_display_value=all`;
  const relTableResponse = await fetch(relTableUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (relTableResponse.ok) {
    const data = await relTableResponse.json();
    console.log('✅ cmdb_rel_ci table exists');
    if (data.result && data.result.length > 0) {
      const sample = data.result[0];
      console.log('Sample relationship record fields:');
      Object.keys(sample).slice(0, 15).forEach(key => {
        console.log(`  - ${key}`);
      });
    }
  } else {
    console.log('❌ Could not access cmdb_rel_ci table');
  }
  console.log('');

  // 2. Query relationship types
  console.log('2. Querying relationship types (cmdb_rel_type)');
  console.log('─'.repeat(70));

  const relTypeUrl = `${instanceUrl}/api/now/table/cmdb_rel_type?sysparm_limit=20&sysparm_display_value=all`;
  const relTypeResponse = await fetch(relTypeUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (relTypeResponse.ok) {
    const data = await relTypeResponse.json();
    console.log(`Found ${data.result?.length || 0} relationship types:`);
    console.log('');

    if (data.result) {
      for (const relType of data.result) {
        const name = relType.name?.display_value || relType.name;
        const sysId = relType.sys_id?.display_value || relType.sys_id;
        const parent = relType.parent_descriptor?.display_value || relType.parent_descriptor || '';
        const child = relType.child_descriptor?.display_value || relType.child_descriptor || '';

        console.log(`  ${name}`);
        console.log(`    sys_id: ${sysId}`);
        if (parent && child) {
          console.log(`    ${parent} → ${child}`);
        }
        console.log('');
      }
    }
  } else {
    console.log('❌ Could not query relationship types');
  }
  console.log('');

  // 3. Search for relevant relationship types
  console.log('3. Searching for network/firewall relationship types');
  console.log('─'.repeat(70));

  const searchTerms = ['Protects', 'Protected by', 'Connected', 'Network'];

  for (const term of searchTerms) {
    const query = encodeURIComponent(`nameLIKE${term}`);
    const searchUrl = `${instanceUrl}/api/now/table/cmdb_rel_type?sysparm_query=${query}&sysparm_limit=5`;

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        console.log(`\nResults for "${term}":`);
        for (const relType of data.result) {
          const name = relType.name?.display_value || relType.name;
          const sysId = relType.sys_id?.display_value || relType.sys_id;
          console.log(`  - ${name} (${sysId})`);
        }
      }
    }
  }
  console.log('');

  // 4. Check existing firewall-network relationships
  console.log('4. Checking for existing firewall-network relationships');
  console.log('─'.repeat(70));

  const existingRelUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_limit=5&sysparm_display_value=all`;
  const existingRelResponse = await fetch(existingRelUrl, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (existingRelResponse.ok) {
    const data = await existingRelResponse.json();
    console.log(`Found ${data.result?.length || 0} sample relationship records`);

    if (data.result && data.result.length > 0) {
      console.log('\nSample relationships:');
      for (const rel of data.result.slice(0, 3)) {
        const parent = rel.parent?.display_value || 'Unknown';
        const child = rel.child?.display_value || 'Unknown';
        const type = rel.type?.display_value || 'Unknown';
        console.log(`  ${parent} → ${type} → ${child}`);
      }
    }
  }
  console.log('');

  console.log('─'.repeat(70));
  console.log('✅ Research complete');
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Identify appropriate relationship type for firewall→network');
  console.log('  2. Query existing firewalls and networks');
  console.log('  3. Create relationship records');
}

researchCMDBRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
