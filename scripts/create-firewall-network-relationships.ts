/**
 * Create Firewall-Network Relationships
 *
 * Create CMDB relationship records linking firewalls to their networks
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

interface RelationshipRecord {
  firewall_sys_id: string;
  firewall_name: string;
  network_sys_id: string;
  network_name: string;
  location_name: string;
}

function parseCSV(csvPath: string): RelationshipRecord[] {
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  // Skip header
  const records: RelationshipRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let char of lines[i]) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());

    if (values.length >= 5) {
      records.push({
        firewall_sys_id: values[0],
        firewall_name: values[1].replace(/^"|"$/g, ''),
        network_sys_id: values[2],
        network_name: values[3].replace(/^"|"$/g, ''),
        location_name: values[4].replace(/^"|"$/g, ''),
      });
    }
  }

  return records;
}

async function createFirewallNetworkRelationships() {
  console.log('🔗 Create Firewall-Network Relationships');
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

  if (environment === 'PRODUCTION') {
    console.log('⚠️  WARNING: Creating relationships in PRODUCTION environment');
    console.log('');
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Read relationship mapping
  const mappingPath = path.join(
    process.cwd(),
    'backup',
    'network-import',
    'firewall-network-relationships.csv'
  );

  if (!fs.existsSync(mappingPath)) {
    console.error('❌ Relationship mapping not found:', mappingPath);
    console.log('Run scripts/map-firewall-network-relationships.ts first');
    process.exit(1);
  }

  const relationships = parseCSV(mappingPath);
  console.log(`Found ${relationships.length} relationship(s) to create`);
  console.log('');

  // Relationship type: "Connects to::Connected by"
  // From research: sys_id = 5599a965c0a8010e00da3b58b113d70e
  const relationshipType = '5599a965c0a8010e00da3b58b113d70e';

  // Check for existing relationships
  console.log('Phase 1: Checking for Existing Relationships');
  console.log('─'.repeat(70));

  const existingRelationships = new Set<string>();

  for (const rel of relationships) {
    const query = encodeURIComponent(`parent=${rel.firewall_sys_id}^child=${rel.network_sys_id}^type=${relationshipType}`);
    const checkUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${query}&sysparm_limit=1`;

    const response = await fetch(checkUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        const key = `${rel.firewall_sys_id}->${rel.network_sys_id}`;
        existingRelationships.add(key);
      }
    }
  }

  if (existingRelationships.size > 0) {
    console.log(`Found ${existingRelationships.size} existing relationship(s)`);
    console.log('These will be SKIPPED to avoid duplicates.');
  } else {
    console.log('No existing relationships found (clean slate)');
  }
  console.log('');

  // Create relationships
  console.log('Phase 2: Creating Relationship Records');
  console.log('─'.repeat(70));
  console.log('');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < relationships.length; i++) {
    const rel = relationships[i];
    const key = `${rel.firewall_sys_id}->${rel.network_sys_id}`;

    if (existingRelationships.has(key)) {
      console.log(`[${i + 1}/${relationships.length}] ⏭️  Skipping: ${rel.location_name} (already exists)`);
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${relationships.length}] Creating relationship: ${rel.location_name}`);
    console.log(`   Firewall: ${rel.firewall_name}`);
    console.log(`   Network: ${rel.network_name}`);

    const payload = {
      parent: rel.firewall_sys_id,
      child: rel.network_sys_id,
      type: relationshipType,
    };

    try {
      const url = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
      const response = await fetch(url, {
        method: 'POST',
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
        continue;
      }

      const responseData = await response.json();
      const sysId = responseData.result.sys_id;

      console.log(`  ✅ Created with sys_id: ${sysId}`);
      console.log('');

      created++;
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
      console.log('');
      errors++;
    }
  }

  // Summary
  console.log('─'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('─'.repeat(70));
  console.log('');

  console.log(`Total Relationships: ${relationships.length}`);
  console.log(`  ✅ Created: ${created}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
  console.log('');

  if (created > 0) {
    console.log('✅ Firewall-network relationships created successfully!');
    console.log('');
    console.log('Next Steps:');
    console.log(`  1. Verify relationships in ${environment} ServiceNow`);
    console.log('  2. Check CMDB dependency maps show firewall→network connections');
    if (environment === 'DEV') {
      console.log('  3. Once validated, replicate to PROD');
    }
  } else if (skipped === relationships.length) {
    console.log('ℹ️  All relationships already exist.');
    console.log('   No new records were created.');
  } else {
    console.log('⚠️  Some errors occurred. Review the output above.');
  }

  console.log('');
}

createFirewallNetworkRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
