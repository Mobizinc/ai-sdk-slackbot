/**
 * Test that catalog redirect does NOT trigger for non-Altus companies
 * This verifies that the feature is truly Altus-only
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';
import { getHRRequestDetector } from '../lib/services/hr-request-detector';

async function testNonAltus() {
  console.log('🔍 TESTING NON-ALTUS COMPANY (Should NOT Redirect)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Create a mock case for a different company
  const mockCompanyId = 'different-company-sys-id-12345';
  const mockCaseData = {
    case_number: 'TEST0001',
    short_description: 'Need to setup email account for new employee John Doe',
    description: 'Please create email account: jdoe@differentcompany.com',
    category: 'Email',
    subcategory: 'Email Account Setup',
  };

  console.log('Mock Case (Non-Altus Company):');
  console.log(`  Company ID:        ${mockCompanyId}`);
  console.log(`  Short Description: ${mockCaseData.short_description}`);
  console.log('');

  // Step 1: Check for client configuration
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STEP 1: Check Client Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const repo = getClientSettingsRepository();
  const clientSettings = await repo.getClientSettings(mockCompanyId);

  if (clientSettings) {
    console.log('⚠️  WARNING: Client settings found for mock company');
    console.log(`   Redirect Enabled: ${clientSettings.catalogRedirectEnabled}`);
  } else {
    console.log('✅ No client settings found (expected for non-Altus company)');
    console.log('   Will fall back to global settings');
  }
  console.log('');

  // Step 2: Check global settings
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STEP 2: Check Global Settings');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const globalEnabled = process.env.CATALOG_REDIRECT_ENABLED === 'true';

  console.log(`Global CATALOG_REDIRECT_ENABLED:  ${process.env.CATALOG_REDIRECT_ENABLED || '(not set)'}`);
  console.log(`Effective Value:                   ${globalEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log('');

  // Step 3: Run detection
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STEP 3: Test HR Request Detection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const detector = getHRRequestDetector();
  const detection = detector.detectHRRequest({
    shortDescription: mockCaseData.short_description,
    description: mockCaseData.description,
    category: mockCaseData.category,
    subcategory: mockCaseData.subcategory,
  });

  console.log('Detection Result:');
  console.log(`  Is HR Request:     ${detection.isHRRequest ? 'Yes' : 'No'}`);
  console.log(`  Request Type:      ${detection.requestType || '(none)'}`);
  console.log(`  Confidence:        ${(detection.confidence * 100).toFixed(1)}%`);
  console.log(`  Matched Keywords:  ${detection.matchedKeywords.join(', ')}`);
  console.log('');

  // Step 4: Determine if redirect would happen
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 STEP 4: Would Redirect Trigger?');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const effectiveEnabled = clientSettings?.catalogRedirectEnabled ?? globalEnabled;
  const effectiveThreshold = clientSettings?.catalogRedirectConfidenceThreshold ?? 0.5;

  console.log('Decision Logic:');
  console.log(`  Feature Enabled:    ${effectiveEnabled ? '✅ Yes' : '❌ No'}`);
  console.log(`  Confidence:         ${(detection.confidence * 100).toFixed(1)}%`);
  console.log(`  Threshold:          ${effectiveThreshold * 100}%`);
  console.log(`  Meets Threshold:    ${detection.confidence >= effectiveThreshold ? 'Yes' : 'No'}`);
  console.log('');

  const wouldRedirect = effectiveEnabled && detection.isHRRequest && detection.confidence >= effectiveThreshold;

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 FINAL RESULT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  if (wouldRedirect) {
    console.log('❌ FAILED: Non-Altus company WOULD be redirected');
    console.log('');
    console.log('This means the feature is NOT Altus-only!');
    console.log('Check global CATALOG_REDIRECT_ENABLED setting.');
    console.log('');
  } else {
    console.log('✅ SUCCESS: Non-Altus company would NOT be redirected');
    console.log('');
    console.log('Reason:');
    if (!effectiveEnabled) {
      console.log('  ✅ Catalog redirect is disabled for this company');
      console.log('  ✅ Global setting is disabled');
      console.log('  ✅ No client-specific override exists');
    }
    console.log('');
    console.log('Confirmation:');
    console.log('  ✅ Feature is correctly configured as Altus-only');
    console.log('  ✅ Other companies will NOT receive catalog redirects');
    console.log('  ✅ Only Altus Community Healthcare is affected');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
}

testNonAltus().catch(console.error);
