/**
 * Clear classification cache for a specific case
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getDb } from '../lib/db/client';
import { eq } from 'drizzle-orm';
import {
  caseClassificationResults,
  caseClassificationInbound,
  caseDiscoveredEntities
} from '../lib/db/schema';

async function clearCache(caseNumber: string) {
  const db = getDb();
  if (!db) {
    console.log('❌ Database not configured');
    process.exit(1);
  }

  try {
    console.log(`🗑️  Clearing cache for case ${caseNumber}...\n`);

    // Delete from cache tables using Drizzle
    const result1 = await db
      .delete(caseClassificationResults)
      .where(eq(caseClassificationResults.caseNumber, caseNumber));

    const result2 = await db
      .delete(caseClassificationInbound)
      .where(eq(caseClassificationInbound.caseNumber, caseNumber));

    const result3 = await db
      .delete(caseDiscoveredEntities)
      .where(eq(caseDiscoveredEntities.caseNumber, caseNumber));

    console.log('✅ Cache cleared successfully\n');
    console.log('   Classifications deleted:', result1.rowCount || 0);
    console.log('   Inbound records deleted:', result2.rowCount || 0);
    console.log('   Entities deleted:', result3.rowCount || 0);
    console.log('\n📝 You can now re-test the webhook to see fresh classification with fixed code.');
  } catch (error) {
    console.error('❌ Error clearing cache:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const caseNumber = process.argv[2] || 'SCS0048813';
clearCache(caseNumber);
