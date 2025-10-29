/**
 * Catalog Redirect Analytics Report
 * Shows comprehensive metrics for HR catalog redirects by company
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

async function reportCatalogRedirects() {
  console.log('📊 CATALOG REDIRECT ANALYTICS REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const repo = getClientSettingsRepository();

  // Get all clients with catalog redirect enabled
  const enabledClients = await repo.getClientsWithRedirectEnabled();

  if (enabledClients.length === 0) {
    console.log('❌ No clients have catalog redirect enabled');
    console.log('');
    console.log('To enable for a client:');
    console.log('  npx tsx --env-file=.env.local scripts/setup-altus-catalog-redirect.ts --apply');
    process.exit(0);
  }

  console.log(`Found ${enabledClients.length} client(s) with catalog redirect enabled:`);
  console.log('');

  enabledClients.forEach((client, i) => {
    console.log(`${i + 1}. ${client.clientName} (${client.clientId})`);
  });
  console.log('');

  // Get metrics for each enabled client
  for (const client of enabledClients) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`📈 ${client.clientName.toUpperCase()}`);
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    // Get metrics for last 30 days
    const metrics = await repo.getRedirectMetrics(client.clientId, 30);

    console.log('📊 OVERALL METRICS (Last 30 Days)');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log(`  Total Redirects:      ${metrics.totalRedirects}`);
    console.log(`  Auto-Closed:          ${metrics.autoClosedCount}/${metrics.totalRedirects} (${Math.round(metrics.autoClosedRate * 100)}%)`);
    console.log(`  Average Confidence:   ${(metrics.averageConfidence * 100).toFixed(1)}%`);
    console.log('');

    if (metrics.totalRedirects === 0) {
      console.log('   ℹ️  No redirects recorded yet');
      console.log('   Either no cases have triggered the redirect, or the feature was recently enabled');
      console.log('');
      continue;
    }

    // Redirects by type
    console.log('📋 REDIRECTS BY REQUEST TYPE');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    const types = Object.entries(metrics.redirectsByType).sort((a, b) => b[1] - a[1]);
    types.forEach(([type, count]) => {
      const percentage = (count / metrics.totalRedirects * 100).toFixed(1);
      console.log(`  ${type.padEnd(20)} ${count.toString().padStart(4)} (${percentage}%)`);
    });
    console.log('');

    // Top keywords
    if (metrics.topKeywords.length > 0) {
      console.log('🔑 TOP MATCHED KEYWORDS');
      console.log('───────────────────────────────────────────────────────────────────');
      console.log('');

      metrics.topKeywords.forEach((kw, i) => {
        console.log(`  ${(i + 1).toString().padStart(2)}. ${kw.keyword.padEnd(25)} ${kw.count} cases`);
      });
      console.log('');
    }

    // Top submitters
    if (metrics.topSubmitters.length > 0) {
      console.log('👤 TOP SUBMITTERS');
      console.log('───────────────────────────────────────────────────────────────────');
      console.log('');

      metrics.topSubmitters.forEach((sub, i) => {
        console.log(`  ${(i + 1).toString().padStart(2)}. ${sub.submitter.padEnd(30)} ${sub.count} cases`);
      });
      console.log('');
    }

    // Daily trend
    if (metrics.redirectsByDay.length > 0) {
      console.log('📅 DAILY TREND');
      console.log('───────────────────────────────────────────────────────────────────');
      console.log('');

      metrics.redirectsByDay.forEach(day => {
        const bar = '█'.repeat(Math.max(1, day.count));
        console.log(`  ${day.date}  ${day.count.toString().padStart(3)}  ${bar}`);
      });
      console.log('');
    }
  }

  // Summary across all clients
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY & RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  let totalRedirectsAllClients = 0;
  for (const client of enabledClients) {
    const metrics = await repo.getRedirectMetrics(client.clientId, 30);
    totalRedirectsAllClients += metrics.totalRedirects;
  }

  console.log(`Total redirects (all clients): ${totalRedirectsAllClients}`);
  console.log(`Enabled clients: ${enabledClients.length}`);
  console.log('');

  console.log('📈 Usage Insights:');
  console.log('');

  if (totalRedirectsAllClients === 0) {
    console.log('  ⚠️  No redirects have occurred yet');
    console.log('  Possible reasons:');
    console.log('    • Feature was recently enabled');
    console.log('    • No HR requests have been submitted');
    console.log('    • Confidence threshold may be too high');
    console.log('    • Keywords may need adjustment');
  } else if (totalRedirectsAllClients < 10) {
    console.log('  ℹ️  Low redirect volume (< 10 in 30 days)');
    console.log('  Consider:');
    console.log('    • Lowering confidence threshold');
    console.log('    • Adding more keywords');
    console.log('    • Reviewing false negatives');
  } else {
    console.log('  ✅ Healthy redirect volume');
    console.log('  Feature is working as expected');
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
}

reportCatalogRedirects().catch(console.error);
