/**
 * Update Altus catalog mappings with enhanced keywords from pattern analysis
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/update-altus-enhanced-keywords.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

async function updateAltusEnhancedKeywords() {
  console.log('🔧 Updating Altus Catalog Mappings with Enhanced Keywords');
  console.log('');

  const repo = getClientSettingsRepository();
  const altusClientId = 'c3eec28c931c9a1049d9764efaba10f3';

  try {
    const existing = await repo.getClientSettings(altusClientId);

    if (!existing) {
      console.error(`❌ Client settings not found for Altus`);
      process.exit(1);
    }

    console.log('✅ Found existing Altus configuration');
    console.log('');
    console.log('Current Mappings:');
    console.log('─────────────────────────────────────────────────────');
    if (existing.customCatalogMappings && existing.customCatalogMappings.length > 0) {
      existing.customCatalogMappings.forEach((mapping: any, i: number) => {
        console.log(`${i + 1}. ${mapping.requestType}`);
        console.log(`   Keywords: ${mapping.keywords.join(', ')}`);
        console.log(`   Catalog: ${mapping.catalogItemNames.join(', ')}`);
        console.log('');
      });
    } else {
      console.log('(none)');
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🆕 ENHANCED KEYWORDS FROM PATTERN ANALYSIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Based on analysis of 30 recent Altus cases:');
    console.log('  - 9 termination cases from Brian Wallace');
    console.log('  - 1 onboarding case from Sultana Sajida');
    console.log('  - 6 access request cases');
    console.log('');

    // Enhanced mappings based on real case patterns
    const enhancedMappings = [
      {
        requestType: 'onboarding',
        keywords: [
          'new hire',
          'onboarding',
          'onboard',
          'new employee',
          'hire date',
          'start date',
          'email request',
          'reporting manager',
          'new hire email request'
        ],
        catalogItemNames: ['Altus New Hire'],
        priority: 10,
      },
      {
        requestType: 'termination',
        keywords: [
          'termination',
          'terminate',
          'terminate all',
          'terminate all server access',
          'leaving',
          'last day',
          'offboard',
          'offboarding',
          'server access',
          'please terminate',
          'email access',
          'login access'
        ],
        catalogItemNames: ['Altus Termination Request'],
        priority: 10,
      },
      {
        requestType: 'access_request',
        keywords: [
          'access',
          'unable to access',
          'cannot access',
          'vpn access',
          'remote access',
          'drive access',
          'network access',
          'login access',
          'cannot sign into'
        ],
        catalogItemNames: ['Request Support'],
        priority: 5,
      },
    ];

    console.log('New Mappings to Apply:');
    console.log('─────────────────────────────────────────────────────');
    enhancedMappings.forEach((mapping, i) => {
      console.log(`${i + 1}. ${mapping.requestType.toUpperCase()}`);
      console.log(`   Keywords (${mapping.keywords.length}): ${mapping.keywords.slice(0, 5).join(', ')}...`);
      console.log(`   Catalog: ${mapping.catalogItemNames.join(', ')}`);
      console.log(`   Priority: ${mapping.priority}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 UPDATING DATABASE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const updated = await repo.updateClientSettings(altusClientId, {
      customCatalogMappings: enhancedMappings,
      updatedBy: 'pattern-analysis-enhancement',
    });

    if (!updated) {
      console.error('❌ Failed to update client settings');
      process.exit(1);
    }

    console.log('✅ Successfully updated Altus catalog mappings');
    console.log('');

    console.log('Updated Configuration:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Total Mappings:     ${updated.customCatalogMappings?.length || 0}`);
    console.log('');

    if (updated.customCatalogMappings && updated.customCatalogMappings.length > 0) {
      updated.customCatalogMappings.forEach((mapping: any, i: number) => {
        console.log(`${i + 1}. ${mapping.requestType}`);
        console.log(`   Keywords: ${mapping.keywords.length} keywords`);
        console.log(`   Catalog: ${mapping.catalogItemNames.join(', ')}`);
        console.log('');
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ENHANCEMENT COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Key Improvements:');
    console.log('  ✅ Added 9 onboarding keywords (was 4)');
    console.log('  ✅ Added 12 termination keywords (was 5)');
    console.log('  ✅ Added 9 access request keywords (new mapping)');
    console.log('');
    console.log('Real-world patterns captured:');
    console.log('  ✅ Brian Wallace termination template');
    console.log('  ✅ Sultana Sajida onboarding format');
    console.log('  ✅ Common access request phrases');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Test with SCS0048754 (termination)');
    console.log('  2. Test with SCS0048833 (onboarding)');
    console.log('  3. Monitor redirect metrics');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating mappings:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

updateAltusEnhancedKeywords();
