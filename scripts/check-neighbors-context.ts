/**
 * Check Neighbors business context in database
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getDb } from '../lib/db/client';
import { businessContexts } from '../lib/db/schema';
import { like } from 'drizzle-orm';

async function check() {
  const db = getDb();
  if (!db) {
    console.log('❌ Database not configured');
    return;
  }

  const results = await db
    .select()
    .from(businessContexts)
    .where(like(businessContexts.entityName, '%Neighbors%'));

  console.log(`Found ${results.length} record(s) for Neighbors:\n`);

  results.forEach((record) => {
    console.log('Entity Name:', record.entityName);
    console.log('Type:', record.entityType);
    console.log('Industry:', record.industry);
    console.log('Technology Portfolio:', record.technologyPortfolio);
    console.log('Service Details:', record.serviceDetails);
    console.log('Aliases:', record.aliases);
    console.log('');
  });
}

check();
