/**
 * Cleanup Test Data from Production Database
 *
 * This script removes test data that was accidentally created during development
 *
 * Usage:
 *   # Dry run (shows what would be deleted)
 *   pnpm tsx scripts/cleanup-test-data.ts --dry-run
 *
 *   # Actually delete the data
 *   pnpm tsx scripts/cleanup-test-data.ts --confirm
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getDb } from '../lib/db/client';
import {
  caseClassificationInbound,
  caseClassificationResults,
  caseDiscoveredEntities,
} from '../lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// Test case numbers to remove
const TEST_CASE_NUMBERS = ['SCS0TEST001'];

async function cleanupTestData(dryRun: boolean = true) {
  console.log('🧹 Cleanup Test Data Script');
  console.log('='.repeat(80));
  console.log('');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No data will be deleted');
    console.log('   Run with --confirm to actually delete data');
  } else {
    console.log('🚨 CONFIRM MODE - Data WILL be deleted');
  }
  console.log('');

  const db = getDb();
  if (!db) {
    console.error('❌ Database not available');
    return;
  }

  // Check what would be deleted
  console.log('Checking for test data...');
  console.log('');

  // 1. Check inbound payloads
  const inboundPayloads = await db
    .select()
    .from(caseClassificationInbound)
    .where(inArray(caseClassificationInbound.caseNumber, TEST_CASE_NUMBERS));

  console.log(`📥 Inbound Payloads: ${inboundPayloads.length} records`);
  if (inboundPayloads.length > 0) {
    inboundPayloads.forEach(p => {
      console.log(`   - Case: ${p.caseNumber}, Created: ${p.createdAt}, Processed: ${p.processed}`);
    });
  }
  console.log('');

  // 2. Check classification results
  const classificationResults = await db
    .select()
    .from(caseClassificationResults)
    .where(inArray(caseClassificationResults.caseNumber, TEST_CASE_NUMBERS));

  console.log(`📊 Classification Results: ${classificationResults.length} records`);
  if (classificationResults.length > 0) {
    classificationResults.forEach(r => {
      console.log(`   - Case: ${r.caseNumber}, Workflow: ${r.workflowId}, Created: ${r.createdAt}`);
      console.log(`     Service Offering: ${r.serviceOffering || 'N/A'}`);
      console.log(`     Application Service: ${r.applicationService || 'N/A'}`);
    });
  }
  console.log('');

  // 3. Check discovered entities
  const discoveredEntities = await db
    .select()
    .from(caseDiscoveredEntities)
    .where(inArray(caseDiscoveredEntities.caseNumber, TEST_CASE_NUMBERS));

  console.log(`🔍 Discovered Entities: ${discoveredEntities.length} records`);
  if (discoveredEntities.length > 0) {
    const entityTypes = discoveredEntities.reduce((acc, e) => {
      acc[e.entityType] = (acc[e.entityType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(entityTypes).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
  }
  console.log('');

  // Summary
  const totalRecords = inboundPayloads.length + classificationResults.length + discoveredEntities.length;
  console.log('='.repeat(80));
  console.log(`📊 Total records found: ${totalRecords}`);
  console.log('='.repeat(80));
  console.log('');

  if (totalRecords === 0) {
    console.log('✅ No test data found. Database is clean!');
    return;
  }

  // Delete if not dry run
  if (!dryRun) {
    console.log('🗑️  Deleting test data...');
    console.log('');

    try {
      // Delete in correct order (foreign key dependencies)

      // 1. Delete entities
      if (discoveredEntities.length > 0) {
        await db
          .delete(caseDiscoveredEntities)
          .where(inArray(caseDiscoveredEntities.caseNumber, TEST_CASE_NUMBERS));
        console.log(`✅ Deleted ${discoveredEntities.length} discovered entities`);
      }

      // 2. Delete classification results
      if (classificationResults.length > 0) {
        await db
          .delete(caseClassificationResults)
          .where(inArray(caseClassificationResults.caseNumber, TEST_CASE_NUMBERS));
        console.log(`✅ Deleted ${classificationResults.length} classification results`);
      }

      // 3. Delete inbound payloads
      if (inboundPayloads.length > 0) {
        await db
          .delete(caseClassificationInbound)
          .where(inArray(caseClassificationInbound.caseNumber, TEST_CASE_NUMBERS));
        console.log(`✅ Deleted ${inboundPayloads.length} inbound payloads`);
      }

      console.log('');
      console.log('✅ Cleanup complete!');
      console.log('');
      console.log('⚠️  NOTE: ServiceNow records (Problems/Incidents) must be cleaned up manually:');
      console.log('   - Problem PRB0040124');
      console.log('   - Problem PRB0040125');
    } catch (error) {
      console.error('');
      console.error('❌ Error during cleanup:', error);
      throw error;
    }
  } else {
    console.log('💡 To delete this data, run:');
    console.log('   pnpm tsx scripts/cleanup-test-data.ts --confirm');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');

cleanupTestData(dryRun)
  .catch((error) => {
    console.error('');
    console.error('❌ Cleanup failed:');
    console.error(error);
    process.exit(1);
  });
