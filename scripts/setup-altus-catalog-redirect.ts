/**
 * Setup Catalog Redirect for Altus Only
 *
 * This script will:
 * 1. Find Altus company ID from ServiceNow
 * 2. Search for available HR catalog items
 * 3. Show catalog URLs that users will be redirected to
 * 4. Configure catalog redirect for Altus only (not global)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';
import type { NewClientSettings } from '../lib/db/schema';

async function setupAltus() {
  console.log('🏥 ALTUS CATALOG REDIRECT SETUP');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    process.exit(1);
  }

  const repo = getClientSettingsRepository();

  // Step 1: Find Altus company ID
  console.log('📋 STEP 1: Finding Altus Company ID');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  // Get from SCS0049613 case
  const testCase = await serviceNowClient.getCase('SCS0049613');

  if (!testCase) {
    console.error('❌ Could not find test case SCS0049613');
    process.exit(1);
  }

  console.log('Test Case Information:');
  console.log(`  Case Number:     ${testCase.number}`);
  console.log(`  Company (raw):   ${JSON.stringify(testCase)}`);
  console.log('');

  // Use confirmed Altus company ID from ServiceNow architect analysis
  const altusCompanyId = 'c3eec28c931c9a1049d9764efaba10f3';
  const altusCompanyName = 'Altus Community Healthcare';

  // Check if we can get company from the case for verification
  const caseRaw = testCase as any;
  if (caseRaw.account) {
    console.log(`✅ Case account field matches: ${caseRaw.account === altusCompanyId ? 'Yes' : 'No (different company)'}`);
    if (caseRaw.account !== altusCompanyId) {
      console.log(`   Case account: ${caseRaw.account}`);
      console.log(`   Expected:     ${altusCompanyId}`);
    }
  }

  console.log('Altus Information:');
  console.log(`  Company ID (sys_id):  ${altusCompanyId}`);
  console.log(`  Company Name:         ${altusCompanyName}`);
  console.log('');

  // Step 2: Fetch CONFIRMED Altus catalog items
  console.log('📦 STEP 2: Fetching Confirmed Altus Catalog Items');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  // These are the CORRECT Altus catalog items identified by ServiceNow architect
  const altusCatalogItems = [
    { name: 'Altus New Hire', sysId: 'e8059df7c3b6ead01302560fb00131f3', type: 'onboarding' },
    { name: 'Altus Termination Request', sysId: 'e03f7ec0c30f6ed01302560fb001319d', type: 'termination' },
  ];

  console.log('Confirmed Altus Catalog Items:');
  console.log('');

  for (const catalogDef of altusCatalogItems) {
    try {
      // Fetch full details to verify item exists and is active
      const response = await fetch(
        `${process.env.SERVICENOW_URL}/api/now/table/sc_cat_item/${catalogDef.sysId}?sysparm_display_value=all`,
        {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const item = data.result;

        console.log(`✅ ${catalogDef.name}`);
        console.log(`   Sys ID:      ${catalogDef.sysId}`);
        console.log(`   Type:        ${catalogDef.type}`);
        console.log(`   Active:      ${item.active?.display_value || item.active}`);
        console.log(`   Category:    ${item.category?.display_value || item.category || '(none)'}`);
        console.log(`   URL:         https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=${catalogDef.sysId}`);
        console.log('');
      } else {
        console.log(`⚠️  ${catalogDef.name} - Could not verify (HTTP ${response.status})`);
        console.log('');
      }
    } catch (error) {
      console.log(`❌ Error fetching ${catalogDef.name}:`, error);
      console.log('');
    }
  }

  // Step 3: Show what users will see
  console.log('👁️  STEP 3: User Experience Preview');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('When a user submits a case like SCS0049613, they will see:');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 CATALOG ITEM REDIRECT RECOMMENDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Hello,');
  console.log('');
  console.log('Thank you for contacting IT Support regarding a new user account request.');
  console.log('');
  console.log('To ensure your request is processed efficiently, please submit this');
  console.log('through our dedicated catalog which triggers automated provisioning:');
  console.log('');
  console.log('📋 **New User Account Request**');
  console.log('   • Altus New Hire');
  console.log('     https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=e8059df7c3b6ead01302560fb00131f3');
  console.log('');

  console.log('**Why use the catalog?**');
  console.log('✅ Automated Account Creation');
  console.log('✅ License Provisioning');
  console.log('✅ Email Setup');
  console.log('✅ Access Provisioning');
  console.log('✅ Manager Approval Workflow');
  console.log('✅ Complete Audit Trail');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Step 4: Configure for Altus only
  console.log('⚙️  STEP 4: Configure Catalog Redirect for Altus Only');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Check if settings exist
  let existingSettings = null;
  try {
    existingSettings = await repo.getClientSettings(altusCompanyId);
  } catch (error) {
    console.log('No existing settings found for Altus');
  }

  console.log('Current Configuration:');
  if (existingSettings) {
    console.log('  ✅ Altus settings exist in database');
    console.log(`  Catalog Redirect Enabled:  ${existingSettings.catalogRedirectEnabled}`);
    console.log(`  Confidence Threshold:      ${existingSettings.catalogRedirectConfidenceThreshold * 100}%`);
    console.log(`  Auto-Close:                ${existingSettings.catalogRedirectAutoClose}`);
    console.log(`  Custom Mappings:           ${existingSettings.customCatalogMappings?.length || 0}`);
  } else {
    console.log('  ❌ No settings found for Altus');
  }
  console.log('');

  console.log('Recommended Configuration (Altus Only):');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const recommendedSettings: NewClientSettings = {
    clientId: altusCompanyId,
    clientName: altusCompanyName,
    catalogRedirectEnabled: true,
    catalogRedirectConfidenceThreshold: 0.5,
    catalogRedirectAutoClose: true, // Auto-close cases after redirect
    supportContactInfo: 'Altus IT Support',
    customCatalogMappings: [
      {
        requestType: 'new_account',
        keywords: [
          'new account',
          'create account',
          'account creation',
          'setup account',
          'add user',
          'provision user',
          'email setup',
          'email account',
          'company email',
          'email addresses',
          'mailbox',
          'outlook account',
          'exchange account',
          'new email',
          'create email',
        ],
        catalogItemNames: [
          'Altus New Hire', // Email setup is part of onboarding
        ],
        priority: 10,
      },
      {
        requestType: 'onboarding',
        keywords: [
          'onboarding',
          'onboard',
          'new hire',
          'new employee',
          'starting employee',
          'employee starting',
          'first day',
        ],
        catalogItemNames: [
          'Altus New Hire',
        ],
        priority: 10,
      },
      {
        requestType: 'termination',
        keywords: [
          'termination',
          'terminate',
          'terminated',
          'employee leaving',
          'user leaving',
          'last day',
          'final day',
          'offboarding',
          'offboard',
        ],
        catalogItemNames: [
          'Altus Termination Request',
        ],
        priority: 10,
      },
    ],
    features: {
      catalogRedirectNotifySlack: true, // Enable Slack notifications for redirects
    },
    notes: 'Configured with correct Altus-branded catalog items. Email setup redirects to Altus New Hire (email is part of onboarding workflow).',
  };

  console.log('JSON Configuration:');
  console.log('```json');
  console.log(JSON.stringify(recommendedSettings, null, 2));
  console.log('```');
  console.log('');

  // Step 5: Offer to apply configuration
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💾 APPLY CONFIGURATION?');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will:');
  console.log('  ✅ Enable catalog redirect for Altus ONLY');
  console.log('  ✅ Use email-aware keywords for detection');
  console.log('  ✅ Auto-close redirected cases');
  console.log('  ✅ Store configuration in database');
  console.log('');
  console.log('Other companies will NOT be affected (feature remains disabled globally)');
  console.log('');

  // Check if user wants to apply (would need to add prompt here)
  const shouldApply = process.argv.includes('--apply');

  if (shouldApply) {
    console.log('Applying configuration...');
    try {
      await repo.upsertClientSettings(recommendedSettings);
      console.log('✅ Configuration saved successfully!');
      console.log('');
      console.log('Verification:');
      const saved = await repo.getClientSettings(altusCompanyId);
      if (saved) {
        console.log(`  ✅ Settings loaded for ${saved.clientName}`);
        console.log(`  ✅ Catalog redirect enabled: ${saved.catalogRedirectEnabled}`);
        console.log(`  ✅ Custom mappings: ${saved.customCatalogMappings?.length}`);
      }
    } catch (error) {
      console.error('❌ Error saving configuration:', error);
    }
  } else {
    console.log('⚠️  DRY RUN - No changes made');
    console.log('');
    console.log('To apply this configuration, run:');
    console.log('  npx tsx --env-file=.env.local scripts/setup-altus-catalog-redirect.ts --apply');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('Next Steps:');
  console.log('  1. Verify Altus company ID is correct (see Step 1 output)');
  console.log('  2. Verify catalog item URLs are accessible (see Step 2 output)');
  console.log('  3. Run with --apply flag to save configuration');
  console.log('  4. Test with case SCS0049613 using test-catalog-redirect.ts');
  console.log('');

  console.log('Important Notes:');
  console.log('  • Global CATALOG_REDIRECT_ENABLED remains FALSE (disabled)');
  console.log('  • Only Altus cases will trigger catalog redirect');
  console.log('  • Other companies are unaffected');
  console.log('  • Configuration is stored in database (persistent)');
  console.log('');
}

setupAltus().catch(console.error);
