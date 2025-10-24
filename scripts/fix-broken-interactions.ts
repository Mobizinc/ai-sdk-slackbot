/**
 * Fix Broken Interactions Script
 *
 * Deletes incorrectly created ServiceNow interactions and clears local tracking,
 * then re-creates them with the correct payload structure.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local pnpm tsx -r dotenv/config scripts/fix-broken-interactions.ts
 */

import { getDb } from '../lib/db/client';
import { callInteractions } from '../lib/db/schema';
import { sql, isNotNull } from 'drizzle-orm';
import { serviceNowClient } from '../lib/tools/servicenow';

async function deleteInteractionFromServiceNow(sysId: string, interactionNumber: string): Promise<boolean> {
  try {
    const endpoint = `/api/now/table/interaction/${sysId}`;

    const response = await fetch(`${process.env.SERVICENOW_INSTANCE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      console.log(`  ✅ Deleted ServiceNow interaction ${interactionNumber} (${sysId})`);
      return true;
    } else {
      const text = await response.text();
      console.error(`  ❌ Failed to delete ${interactionNumber}: ${response.status} - ${text}`);
      return false;
    }
  } catch (error) {
    console.error(`  ❌ Error deleting ${interactionNumber}:`, error);
    return false;
  }
}

async function fixBrokenInteractions() {
  console.log('🔧 Fixing broken ServiceNow interactions...\n');

  const db = getDb();
  if (!db) {
    console.error('❌ Database not available');
    process.exit(1);
  }

  // Get all interactions that have ServiceNow IDs (the broken ones)
  const brokenInteractions = await db
    .select()
    .from(callInteractions)
    .where(isNotNull(callInteractions.servicenowInteractionSysId));

  if (!brokenInteractions.length) {
    console.log('✅ No broken interactions found. All clear!');
    process.exit(0);
  }

  console.log(`📊 Found ${brokenInteractions.length} interactions to fix\n`);

  let deletedCount = 0;
  let deleteFailCount = 0;

  // Step 1: Delete broken interactions from ServiceNow
  console.log('Step 1: Deleting broken interactions from ServiceNow...\n');

  for (const interaction of brokenInteractions) {
    if (interaction.servicenowInteractionSysId && interaction.servicenowInteractionNumber) {
      const success = await deleteInteractionFromServiceNow(
        interaction.servicenowInteractionSysId,
        interaction.servicenowInteractionNumber
      );

      if (success) {
        deletedCount++;
      } else {
        deleteFailCount++;
      }
    }
  }

  console.log(`\n✅ Deleted: ${deletedCount}, ❌ Failed: ${deleteFailCount}\n`);

  // Step 2: Clear ServiceNow tracking from local database
  console.log('Step 2: Clearing ServiceNow tracking from local database...\n');

  await db
    .update(callInteractions)
    .set({
      servicenowInteractionSysId: null,
      servicenowInteractionNumber: null,
      servicenowSyncedAt: null,
      updatedAt: new Date(),
    })
    .where(isNotNull(callInteractions.servicenowInteractionSysId));

  console.log('✅ Cleared ServiceNow tracking fields\n');

  // Step 3: Verify cleanup
  const remaining = await db
    .select()
    .from(callInteractions)
    .where(isNotNull(callInteractions.servicenowInteractionSysId));

  if (remaining.length > 0) {
    console.error(`❌ Warning: ${remaining.length} interactions still have ServiceNow IDs`);
  } else {
    console.log('✅ All ServiceNow tracking fields cleared successfully\n');
  }

  console.log('=' .repeat(60));
  console.log('📋 Cleanup Summary');
  console.log('='.repeat(60));
  console.log(`Interactions processed:     ${brokenInteractions.length}`);
  console.log(`ServiceNow records deleted: ${deletedCount}`);
  console.log(`Delete failures:            ${deleteFailCount}`);
  console.log(`Local tracking cleared:     ${brokenInteractions.length}`);
  console.log('='.repeat(60));
  console.log('\n💡 Next step: Run the backfill script to recreate interactions with correct payload:');
  console.log('   DOTENV_CONFIG_PATH=.env.local pnpm tsx -r dotenv/config scripts/backfill-interactions-to-servicenow.ts\n');
}

fixBrokenInteractions().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
