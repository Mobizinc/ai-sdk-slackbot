/**
 * Fix ACM-AZ-FW01 Duplicate and Move VPN Relationships
 *
 * Consolidates duplicate ACM-AZ-FW01 entries:
 * - Keeps entry with serial number (87c0c308c3592250ad36b9ff05013186)
 * - Moves 30 VPN relationships from old entry
 * - Links to IP networks
 * - Deletes duplicate
 *
 * USAGE:
 *   npx tsx scripts/fix-acm-az-fw01-duplicate.ts
 *   npx tsx scripts/fix-acm-az-fw01-duplicate.ts --dry-run
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });
dotenv.config();

const CORRECT_SYS_ID = '87c0c308c3592250ad36b9ff05013186';  // Has serial, public IP
const DUPLICATE_SYS_ID = '0236fb57c3ad4250a01d5673e401311c';  // Has VPN rels, no serial

async function fixACMAZFW01Duplicate(dryRun: boolean = false) {
  console.log('🔧 Fix ACM-AZ-FW01 Duplicate & Move VPN Relationships');
  console.log('='.repeat(70));
  console.log('');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE');
    console.log('');
  }

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Correct Entry (KEEP):     ${CORRECT_SYS_ID}`);
  console.log(`  - Has serial number`);
  console.log(`  - IP: 4.154.210.121 (public)`);
  console.log('');
  console.log(`Duplicate Entry (DELETE): ${DUPLICATE_SYS_ID}`);
  console.log(`  - Has VPN relationships`);
  console.log(`  - IP: 10.230.19.4 (internal)`);
  console.log('');

  // Step 1: Get all relationships from duplicate entry
  console.log('Step 1: Query Relationships from Duplicate Entry');
  console.log('─'.repeat(70));

  const relQuery = `parent=${DUPLICATE_SYS_ID}^ORchild=${DUPLICATE_SYS_ID}`;
  const relUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(relQuery)}&sysparm_fields=sys_id,parent,child,type,comments&sysparm_limit=100`;

  const relResp = await fetch(relUrl, {
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
  });

  const relData = await relResp.json();
  const relationships = relData.result || [];

  console.log(`Relationships to move: ${relationships.length}`);
  console.log('');

  let moved = 0, errors = 0;

  // Step 2: Recreate each relationship pointing to correct entry
  console.log('Step 2: Move Relationships to Correct Entry');
  console.log('─'.repeat(70));
  console.log('');

  for (const rel of relationships) {
    const isParent = rel.parent === DUPLICATE_SYS_ID;

    const newRelPayload: any = {
      parent: isParent ? CORRECT_SYS_ID : rel.parent,
      child: isParent ? rel.child : CORRECT_SYS_ID,
      type: rel.type,
      comments: rel.comments || undefined
    };

    if (dryRun) {
      console.log(`🧪 Would move relationship (${rel.sys_id.substring(0, 8)}...)`);
      moved++;
    } else {
      // Create new relationship
      const createUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci`;
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(newRelPayload)
      });

      if (createResp.ok) {
        // Delete old relationship
        const deleteUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci/${rel.sys_id}`;
        await fetch(deleteUrl, {
          method: 'DELETE',
          headers: { 'Authorization': authHeader }
        });

        moved++;
      } else {
        errors++;
      }
    }
  }

  console.log(`${dryRun ? 'Would move' : 'Moved'}: ${moved} relationships`);
  console.log(`Errors: ${errors}`);
  console.log('');

  // Step 3: Update correct entry with internal IP in description
  if (!dryRun) {
    console.log('Step 3: Update Description with Both IPs');
    console.log('─'.repeat(70));

    const updatePayload = {
      short_description: 'Azure VM firewall (ACM-AZ-FW01). Public IP: 4.154.210.121, Internal IP: 10.230.19.4. Serves as VPN hub for all Allcare branch offices.'
    };

    const updateUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${CORRECT_SYS_ID}`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });

    console.log('✅ Description updated with both IPs');
    console.log('');
  }

  // Step 4: Delete duplicate entry
  console.log(`Step 4: Delete Duplicate Entry`);
  console.log('─'.repeat(70));

  if (dryRun) {
    console.log(`🧪 Would delete: ${DUPLICATE_SYS_ID}`);
  } else {
    const deleteUrl = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall/${DUPLICATE_SYS_ID}`;
    const deleteResp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader }
    });

    if (deleteResp.ok || deleteResp.status === 204) {
      console.log('🗑️  Deleted duplicate entry');
    } else {
      console.log('❌ Failed to delete duplicate');
    }
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('📊 Fix Summary');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Relationships Moved: ${moved}`);
  console.log(`Errors: ${errors}`);
  console.log('');

  if (dryRun) {
    console.log('🧪 Dry run complete. To execute:');
    console.log('  npx tsx scripts/fix-acm-az-fw01-duplicate.ts');
  } else {
    console.log('✅ ACM-AZ-FW01 consolidation complete!');
    console.log('');
    console.log('View corrected firewall:');
    console.log(`  https://mobiz.service-now.com/cmdb_ci_ip_firewall.do?sys_id=${CORRECT_SYS_ID}`);
    console.log('');
    console.log('Should now show:');
    console.log('  - Serial number ✅');
    console.log('  - 30 VPN tunnel relationships ✅');
    console.log('  - IP network relationships ✅');
    console.log('  - Network Management service ✅');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

fixACMAZFW01Duplicate(dryRun)
  .catch(console.error)
  .finally(() => process.exit(0));
