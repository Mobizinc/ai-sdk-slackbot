/**
 * Clear all UAT test case classifications from database
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getDb } from '../lib/db/client';

async function clearUATTestCache() {
  console.log('🗑️  Clearing UAT test case classifications...');
  console.log('');

  const db = getDb();
  if (!db) {
    console.error('❌ Database not configured');
    process.exit(1);
  }

  try {
    // Delete case_classification_results for UAT test cases
    const resultsDeleted = await db.execute(
      `DELETE FROM case_classification_results WHERE case_number LIKE 'SCS%' AND created_at > NOW() - INTERVAL '7 days' RETURNING case_number`
    );

    // Delete case_classification_inbound for UAT test cases
    const inboundDeleted = await db.execute(
      `DELETE FROM case_classification_inbound WHERE case_number LIKE 'SCS%' AND created_at > NOW() - INTERVAL '7 days' RETURNING case_number`
    );

    // Delete case_discovered_entities for UAT test cases
    const entitiesDeleted = await db.execute(
      `DELETE FROM case_discovered_entities WHERE case_number LIKE 'SCS%' AND created_at > NOW() - INTERVAL '7 days' RETURNING case_number`
    );

    console.log('✅ UAT test cache cleared successfully');
    console.log('');
    console.log(`   Results deleted: ${resultsDeleted.rowCount || 0}`);
    console.log(`   Inbound deleted: ${inboundDeleted.rowCount || 0}`);
    console.log(`   Entities deleted: ${entitiesDeleted.rowCount || 0}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  }
}

clearUATTestCache();
