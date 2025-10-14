/**
 * Update Altus catalog mappings with discovered catalog items
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/update-altus-catalog-mappings.ts
 */

import * as dotenv from 'dotenv';

// Load environment variables BEFORE importing database
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

async function updateAltusCatalogMappings() {
  console.log('🔧 Updating Altus Catalog Mappings');
  console.log('');

  const repo = getClientSettingsRepository();
  const altusClientId = 'c3eec28c931c9a1049d9764efaba10f3';

  try {
    // Check if Altus configuration exists
    const existing = await repo.getClientSettings(altusClientId);

    if (!existing) {
      console.error(`❌ Client settings not found for Altus (client_id: ${altusClientId})`);
      console.error('   Run configure-client-catalog-redirect.ts first');
      process.exit(1);
    }

    console.log('✅ Found existing Altus configuration');
    console.log('');
    console.log('Current Settings:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Client Name:           ${existing.clientName}`);
    console.log(`Catalog Redirect:      ${existing.catalogRedirectEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`Confidence Threshold:  ${existing.catalogRedirectConfidenceThreshold}`);
    console.log(`Auto-Close:            ${existing.catalogRedirectAutoClose ? '✅ Yes' : '❌ No'}`);
    console.log(`Custom Mappings:       ${existing.customCatalogMappings?.length || 0} mappings`);
    console.log('');

    // New catalog mappings based on discoveries
    const newMappings = [
      {
        requestType: 'onboarding',
        keywords: ['onboarding', 'onboard', 'new hire', 'new employee'],
        catalogItemNames: ['Altus New Hire'],
        priority: 10,
      },
      {
        requestType: 'termination',
        keywords: ['termination', 'terminate', 'leaving', 'last day', 'offboard'],
        catalogItemNames: ['Altus Termination Request'],
        priority: 10,
      },
    ];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🆕 NEW CATALOG MAPPINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('These mappings will be added to Altus configuration:');
    console.log('');
    newMappings.forEach((mapping, i) => {
      console.log(`${i + 1}. Request Type: ${mapping.requestType}`);
      console.log(`   Keywords: ${mapping.keywords.join(', ')}`);
      console.log(`   Catalog Items: ${mapping.catalogItemNames.join(', ')}`);
      console.log(`   Priority: ${mapping.priority}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 UPDATING DATABASE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Update the client settings
    const updated = await repo.updateClientSettings(altusClientId, {
      customCatalogMappings: newMappings,
      updatedBy: 'system',
    });

    if (!updated) {
      console.error('❌ Failed to update client settings');
      process.exit(1);
    }

    console.log('✅ Successfully updated Altus catalog mappings');
    console.log('');

    console.log('Updated Configuration:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Custom Mappings:       ${updated.customCatalogMappings?.length || 0} mappings`);
    console.log('');
    if (updated.customCatalogMappings && updated.customCatalogMappings.length > 0) {
      updated.customCatalogMappings.forEach((mapping: any, i: number) => {
        console.log(`  ${i + 1}. ${mapping.requestType}: ${mapping.catalogItemNames.join(', ')}`);
      });
    }
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CONFIGURATION COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('The catalog redirect system is now ready for Altus!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Test with case SCS0048833 (New Hire Email Request)');
    console.log('2. Verify work notes are added correctly');
    console.log('3. Monitor redirect metrics in the database');
    console.log('');
    console.log('To test:');
    console.log('  Trigger webhook processing for SCS0048833');
    console.log('  Check work notes in ServiceNow');
    console.log('  Query catalog_redirect_log table for metrics');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating catalog mappings:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

updateAltusCatalogMappings();
