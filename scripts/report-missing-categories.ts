/**
 * Report Missing Categories
 * Shows AI-suggested categories that don't exist in ServiceNow
 * Includes parent-child relationships and frequency analysis
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getCategoryMismatchRepository } from '../lib/db/repositories/category-mismatch-repository';

async function reportMissingCategories() {
  console.log('🔍 MISSING CATEGORIES REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This report shows categories the AI suggested but that don\'t exist');
  console.log('in ServiceNow. These are opportunities to create new categories.');
  console.log('');

  const repo = getCategoryMismatchRepository();

  // Get statistics
  console.log('📊 STEP 1: Overall Statistics (Last 30 Days)');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const stats = await repo.getStatistics(30);

  console.log('Statistics:');
  console.log(`  Total Mismatches:      ${stats.totalMismatches}`);
  console.log(`  Unique Categories:     ${stats.uniqueCategories}`);
  console.log(`  Reviewed:              ${stats.reviewedCount}/${stats.totalMismatches} (${stats.totalMismatches > 0 ? Math.round((stats.reviewedCount / stats.totalMismatches) * 100) : 0}%)`);
  console.log(`  Avg Confidence:        ${(stats.avgConfidence * 100).toFixed(1)}%`);
  console.log('');

  if (stats.totalMismatches === 0) {
    console.log('✅ No category mismatches found in the last 30 days!');
    console.log('   Either ServiceNow categories are comprehensive, or no cases have been classified yet.');
    process.exit(0);
  }

  // Get top suggested categories
  console.log('📋 STEP 2: Top AI-Suggested Categories (Last 30 Days)');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const topCategories = await repo.getTopSuggestedCategories(30);

  console.log('Top categories AI wanted to use but don\'t exist in ServiceNow:');
  console.log('');

  if (topCategories.length === 0) {
    console.log('  (None found)');
  } else {
    topCategories.forEach((cat, i) => {
      console.log(`${i + 1}. "${cat.category}"`);
      console.log(`   Occurrences:     ${cat.count}`);
      console.log(`   Avg Confidence:  ${(cat.avgConfidence * 100).toFixed(1)}%`);
      console.log('');
    });
  }

  // Get recent examples with subcategories
  console.log('📝 STEP 3: Recent Mismatch Examples (Last 50)');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const recentMismatches = await repo.getRecentMismatches(50);

  if (recentMismatches.length === 0) {
    console.log('  (No recent mismatches)');
  } else {
    // Group by category to show parent-child relationships
    const byCategory = new Map<string, Array<typeof recentMismatches[0]>>();

    recentMismatches.forEach(m => {
      if (!byCategory.has(m.aiSuggestedCategory)) {
        byCategory.set(m.aiSuggestedCategory, []);
      }
      byCategory.get(m.aiSuggestedCategory)!.push(m);
    });

    console.log(`Found ${byCategory.size} unique suggested categories with subcategories:\n`);

    Array.from(byCategory.entries()).forEach(([category, examples], i) => {
      console.log(`${i + 1}. Category: "${category}" (${examples.length} cases)`);

      // Show subcategories
      const subcategories = new Set<string>();
      examples.forEach(ex => {
        if (ex.aiSuggestedSubcategory) {
          subcategories.add(ex.aiSuggestedSubcategory);
        }
      });

      if (subcategories.size > 0) {
        console.log('   Suggested Subcategories:');
        Array.from(subcategories).forEach(sub => {
          console.log(`     • ${sub}`);
        });
      } else {
        console.log('   Subcategories: (none)');
      }

      // Show recent cases
      console.log('   Recent Cases:');
      examples.slice(0, 3).forEach(ex => {
        console.log(`     • ${ex.caseNumber} (${(ex.confidenceScore * 100).toFixed(0)}% confidence)`);
        console.log(`       Corrected to: "${ex.correctedCategory}"`);
        console.log(`       Description: ${ex.caseDescription.substring(0, 60)}...`);
      });

      console.log('');
    });
  }

  // Step 4: Recommendations
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💡 RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  if (topCategories.length > 0) {
    console.log('Categories to Consider Adding to ServiceNow:');
    console.log('');

    const highVolume = topCategories.filter(c => c.count >= 5);
    const highConfidence = topCategories.filter(c => c.avgConfidence >= 0.7);

    if (highVolume.length > 0) {
      console.log('High Volume (5+ occurrences):');
      highVolume.forEach(cat => {
        console.log(`  • "${cat.category}" (${cat.count} cases, ${(cat.avgConfidence * 100).toFixed(0)}% avg confidence)`);
      });
      console.log('');
    }

    if (highConfidence.length > 0) {
      console.log('High Confidence (70%+ average):');
      highConfidence.forEach(cat => {
        console.log(`  • "${cat.category}" (${cat.count} cases, ${(cat.avgConfidence * 100).toFixed(0)}% avg confidence)`);
      });
      console.log('');
    }

    console.log('Steps to Add Categories:');
    console.log('  1. Review the suggested categories above');
    console.log('  2. For each category to add:');
    console.log('     a. Open ServiceNow > System Definition > Choice Lists');
    console.log('     b. Find table: sn_customerservice_case (or incident)');
    console.log('     c. Find field: category (or subcategory)');
    console.log('     d. Add new choice with label from above');
    console.log('  3. Run category sync to update cache:');
    console.log('     npx tsx --env-file=.env.local scripts/sync-servicenow-categories.ts');
    console.log('');
  } else {
    console.log('✅ All AI suggestions matched existing ServiceNow categories');
    console.log('   No new categories needed at this time');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
}

reportMissingCategories().catch(console.error);
