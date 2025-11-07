import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars
config({ path: resolve(process.cwd(), '.env.local') });

import { getDb } from '@/lib/db';
import { servicenowChoiceCache } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  const db = getDb();
  if (!db) {
    console.error('❌ Failed to connect to database');
    process.exit(1);
  }

  // Find IT Issue category
  const itIssueCategory = await db.select().from(servicenowChoiceCache)
    .where(and(
      eq(servicenowChoiceCache.tableName, 'sn_customerservice_case'),
      eq(servicenowChoiceCache.element, 'category'),
      eq(servicenowChoiceCache.label, 'IT Issue')
    ));

  console.log('🔍 IT Issue Category:', JSON.stringify(itIssueCategory, null, 2));

  if (itIssueCategory.length > 0) {
    const itIssueValue = itIssueCategory[0].value;
    console.log(`\n✅ IT Issue Value: "${itIssueValue}"`);

    // Find subcategories for IT Issue
    const subcategories = await db.select().from(servicenowChoiceCache)
      .where(and(
        eq(servicenowChoiceCache.tableName, 'sn_customerservice_case'),
        eq(servicenowChoiceCache.element, 'subcategory'),
        eq(servicenowChoiceCache.dependentValue, itIssueValue)
      ));

    console.log(`\n📊 Subcategories for IT Issue: ${subcategories.length} found`);

    if (subcategories.length > 0) {
      subcategories.forEach(sub => {
        console.log(`  ✓ ${sub.label} (value: ${sub.value}, sequence: ${sub.sequence})`);
      });
    } else {
      console.log('\n❌ NO SUBCATEGORIES FOUND FOR "IT Issue"');
      console.log('   This confirms why Altus only sees "IT Issue" without subcategories!');
    }
  } else {
    console.log('\n❌ "IT Issue" category not found in cache');
  }

  // Also show all Case categories
  console.log('\n\n📋 All Case Categories:');
  const allCategories = await db.select().from(servicenowChoiceCache)
    .where(and(
      eq(servicenowChoiceCache.tableName, 'sn_customerservice_case'),
      eq(servicenowChoiceCache.element, 'category')
    ))
    .orderBy(servicenowChoiceCache.sequence);

  allCategories.forEach(cat => {
    console.log(`  • ${cat.label} (value: ${cat.value})`);
  });
}

main().catch(console.error);
