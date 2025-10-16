/**
 * Check database for test case SCS0TEST001
 */

// CRITICAL: Load environment variables BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getDb } from '../lib/db/client';
import { caseClassificationResults } from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function checkDatabase() {
  console.log('Checking database for SCS0TEST001...');
  console.log('');

  const db = getDb();
  if (!db) {
    console.error('❌ Database not available');
    return;
  }

  const results = await db
    .select()
    .from(caseClassificationResults)
    .where(eq(caseClassificationResults.caseNumber, 'SCS0TEST001'))
    .orderBy(desc(caseClassificationResults.createdAt))
    .limit(1);

  if (results.length > 0) {
    const result = results[0];
    console.log('✅ Database Record Found for SCS0TEST001:');
    console.log('='.repeat(80));
    console.log('Case Number:', result.caseNumber);
    console.log('Service Offering:', result.serviceOffering || '❌ NOT SET');
    console.log('Application Service:', result.applicationService || '❌ NOT SET');
    console.log('Category:', result.classificationJson?.category);
    console.log('Subcategory:', result.classificationJson?.subcategory);
    console.log('Confidence:', result.confidenceScore);
    console.log('');
    console.log('Classification JSON (service portfolio fields):');
    console.log('  service_offering:', result.classificationJson?.service_offering || 'not in JSON');
    console.log('  application_service:', result.classificationJson?.application_service || 'not in JSON');
    console.log('');
    console.log('='.repeat(80));
    console.log('');

    // Verify the fix
    if (result.serviceOffering && result.applicationService) {
      console.log('✅ FIX VERIFIED: Both service_offering and application_service columns are populated!');
    } else if (result.serviceOffering) {
      console.log('⚠️  PARTIAL FIX: service_offering is set but application_service is missing');
    } else if (result.applicationService) {
      console.log('⚠️  PARTIAL FIX: application_service is set but service_offering is missing');
    } else {
      console.log('❌ FIX NOT WORKING: Neither field is populated in database columns');
    }
  } else {
    console.log('❌ No results found for SCS0TEST001');
  }
}

checkDatabase()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
