/**
 * Root Cause Analysis for SCS0049613 - Altus Email Account Creation
 * Investigates why the HR catalog referral rule didn't trigger
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';
import { getHRRequestDetector } from '../lib/services/hr-request-detector';

async function diagnoseCase() {
  const caseNumber = 'SCS0049613';

  console.log('🔍 ROOT CAUSE ANALYSIS: SCS0049613 - Altus Email Account Creation');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Fetch case details
  console.log('📋 STEP 1: Fetching Case Details from ServiceNow');
  console.log('───────────────────────────────────────────────────────────────────');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    console.error('   Check .env.local for SERVICENOW_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD');
    process.exit(1);
  }

  try {
    const caseData = await serviceNowClient.getCase(caseNumber);

    if (!caseData) {
      console.error(`❌ Case ${caseNumber} not found in ServiceNow`);
      process.exit(1);
    }

    console.log('✅ Case Retrieved Successfully');
    console.log('');
    console.log('Case Details:');
    console.log(`  Number:            ${caseData.number}`);
    console.log(`  Sys ID:            ${caseData.sys_id}`);
    console.log(`  Short Description: ${caseData.short_description}`);
    console.log(`  Category:          ${caseData.category || '(not set)'}`);
    console.log(`  Subcategory:       ${caseData.subcategory || '(not set)'}`);
    console.log(`  State:             ${caseData.state}`);
    console.log(`  Priority:          ${caseData.priority}`);
    console.log(`  Submitted By:      ${caseData.submitted_by || '(unknown)'}`);
    console.log('');

    if (caseData.description) {
      console.log('Description:');
      console.log('─────────────────────────────────────────────────────────');
      console.log(caseData.description);
      console.log('─────────────────────────────────────────────────────────');
      console.log('');
    }

    // Step 2: Check configuration
    console.log('⚙️  STEP 2: Checking Catalog Redirect Configuration');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    // Check environment variables
    const envEnabled = process.env.CATALOG_REDIRECT_ENABLED === 'true';
    const envThreshold = parseFloat(process.env.CATALOG_REDIRECT_CONFIDENCE_THRESHOLD || '0.5');
    const envAutoClose = process.env.CATALOG_REDIRECT_AUTO_CLOSE === 'true';

    console.log('Environment Variables:');
    console.log(`  CATALOG_REDIRECT_ENABLED:              ${process.env.CATALOG_REDIRECT_ENABLED || '(not set)'} → ${envEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`  CATALOG_REDIRECT_CONFIDENCE_THRESHOLD: ${process.env.CATALOG_REDIRECT_CONFIDENCE_THRESHOLD || '(not set)'} → ${envThreshold}`);
    console.log(`  CATALOG_REDIRECT_AUTO_CLOSE:           ${process.env.CATALOG_REDIRECT_AUTO_CLOSE || '(not set)'} → ${envAutoClose ? 'Yes' : 'No'}`);
    console.log('');

    // Check database settings for Altus
    const repo = getClientSettingsRepository();
    const companyId = caseData.company;

    let clientSettings = null;
    if (companyId) {
      console.log(`Checking database for company: ${companyId}`);
      clientSettings = await repo.getClientSettings(companyId);

      if (clientSettings) {
        console.log('');
        console.log('✅ Client-Specific Settings Found (Database):');
        console.log(`  Client Name:               ${clientSettings.clientName}`);
        console.log(`  Catalog Redirect Enabled:  ${clientSettings.catalogRedirectEnabled ? '✅ Yes' : '❌ No'}`);
        console.log(`  Confidence Threshold:      ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
        console.log(`  Auto-Close:                ${clientSettings.catalogRedirectAutoClose ? '✅ Yes' : '❌ No'}`);
        console.log(`  Custom Mappings:           ${clientSettings.customCatalogMappings?.length || 0}`);
        console.log('');

        if (clientSettings.customCatalogMappings && clientSettings.customCatalogMappings.length > 0) {
          console.log('Custom Catalog Mappings:');
          clientSettings.customCatalogMappings.forEach((mapping: any, i: number) => {
            console.log(`  ${i + 1}. ${mapping.requestType}`);
            console.log(`     → Catalog Items: ${mapping.catalogItemNames.join(', ')}`);
            console.log(`     → Keywords: ${mapping.keywords.join(', ')}`);
            console.log(`     → Priority: ${mapping.priority}`);
          });
          console.log('');
        }
      } else {
        console.log('❌ No client-specific settings found in database');
        console.log('   Using global environment configuration');
        console.log('');
      }
    } else {
      console.log('⚠️  No company ID in case data');
      console.log('');
    }

    // Step 3: Run HR Request Detection
    console.log('🤖 STEP 3: Running HR Request Detection Simulation');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    const detector = getHRRequestDetector();

    // Test with custom mappings if available, otherwise use defaults
    const customMappings = clientSettings?.customCatalogMappings;

    const detectionResult = detector.detectHRRequest({
      shortDescription: caseData.short_description || '',
      description: caseData.description || '',
      category: caseData.category,
      subcategory: caseData.subcategory,
      customMappings: customMappings,
    });

    console.log('Detection Result:');
    console.log(`  Is HR Request:        ${detectionResult.isHRRequest ? '✅ Yes' : '❌ No'}`);
    console.log(`  Request Type:         ${detectionResult.requestType || '(none detected)'}`);
    console.log(`  Confidence Score:     ${(detectionResult.confidence * 100).toFixed(2)}%`);
    console.log('');

    if (detectionResult.matchedKeywords && detectionResult.matchedKeywords.length > 0) {
      console.log(`Matched Keywords (${detectionResult.matchedKeywords.length}):`);
      detectionResult.matchedKeywords.forEach((kw, i) => {
        console.log(`  ${i + 1}. "${kw}"`);
      });
      console.log('');
    } else {
      console.log('⚠️  No keywords matched');
      console.log('');
    }

    if (detectionResult.suggestedCatalogItems && detectionResult.suggestedCatalogItems.length > 0) {
      console.log('Suggested Catalog Items:');
      detectionResult.suggestedCatalogItems.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item}`);
      });
      console.log('');
    }

    // Step 4: Root Cause Analysis
    console.log('🔍 STEP 4: Root Cause Analysis');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    const effectiveEnabled = clientSettings?.catalogRedirectEnabled ?? envEnabled;
    const effectiveThreshold = clientSettings?.catalogRedirectConfidenceThreshold ?? envThreshold;

    console.log('Effective Configuration:');
    console.log(`  Feature Enabled:       ${effectiveEnabled ? '✅ Yes' : '❌ No'}`);
    console.log(`  Confidence Threshold:  ${effectiveThreshold * 100}%`);
    console.log('');

    // Determine root cause
    const reasons: string[] = [];

    if (!effectiveEnabled) {
      reasons.push('❌ CATALOG REDIRECT FEATURE IS DISABLED');
      if (!envEnabled) {
        reasons.push('   → Environment variable CATALOG_REDIRECT_ENABLED is not set to "true"');
      }
      if (clientSettings && !clientSettings.catalogRedirectEnabled) {
        reasons.push('   → Client-specific setting catalogRedirectEnabled is false in database');
      }
    }

    if (!detectionResult.isHRRequest) {
      reasons.push('❌ CASE NOT DETECTED AS HR REQUEST');
      reasons.push('   → No matching keywords found in case description');
      reasons.push('   → Short description and/or description may not contain HR-related terms');
    } else if (detectionResult.confidence < effectiveThreshold) {
      reasons.push(`❌ CONFIDENCE SCORE TOO LOW`);
      reasons.push(`   → Detected confidence: ${(detectionResult.confidence * 100).toFixed(2)}%`);
      reasons.push(`   → Required threshold:  ${effectiveThreshold * 100}%`);
      reasons.push(`   → Gap:                 ${((effectiveThreshold - detectionResult.confidence) * 100).toFixed(2)}%`);
    }

    if (reasons.length === 0) {
      console.log('✅ SHOULD HAVE TRIGGERED');
      console.log('');
      console.log('The case meets all criteria for catalog redirect:');
      console.log(`  ✅ Feature is enabled`);
      console.log(`  ✅ Detected as HR request (${detectionResult.requestType})`);
      console.log(`  ✅ Confidence ${(detectionResult.confidence * 100).toFixed(2)}% >= threshold ${effectiveThreshold * 100}%`);
      console.log('');
      console.log('Possible reasons it didn\'t trigger in production:');
      console.log('  • Feature was disabled at the time the case was created');
      console.log('  • Case was processed before catalog redirect was configured');
      console.log('  • An incident or problem was already created (catalog redirect is skipped)');
      console.log('');
    } else {
      console.log('ROOT CAUSE IDENTIFIED:');
      console.log('');
      reasons.forEach(reason => console.log(reason));
      console.log('');
    }

    // Step 5: Recommendations
    console.log('💡 RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

    if (!effectiveEnabled) {
      console.log('To enable catalog redirect for Altus:');
      console.log('');
      console.log('Option 1 - Enable Globally (Environment Variable):');
      console.log('  Add to .env.local:');
      console.log('  CATALOG_REDIRECT_ENABLED=true');
      console.log('  CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.5');
      console.log('  CATALOG_REDIRECT_AUTO_CLOSE=true');
      console.log('');
      console.log('Option 2 - Enable for Altus Only (Database):');
      console.log('  Update client_settings table for Altus:');
      console.log('  catalogRedirectEnabled: true');
      console.log('  catalogRedirectConfidenceThreshold: 0.5');
      console.log('  catalogRedirectAutoClose: true');
      console.log('');
    }

    if (!detectionResult.isHRRequest || detectionResult.confidence < effectiveThreshold) {
      console.log('To improve detection for email account creation:');
      console.log('');
      console.log('1. Add more specific keywords to custom mappings:');
      console.log('   • "email account"');
      console.log('   • "email setup"');
      console.log('   • "mailbox"');
      console.log('   • "exchange"');
      console.log('   • "outlook account"');
      console.log('');
      console.log('2. Lower the confidence threshold (current: ' + effectiveThreshold * 100 + '%)');
      console.log('   • Try 0.4 (40%) for more aggressive matching');
      console.log('');
      console.log('3. Review case description formatting');
      console.log('   • Ensure HR-related terms are in the description');
      console.log('   • Consider standardizing submitter language');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Diagnostic complete. No changes made to ServiceNow.');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
    }
    process.exit(1);
  }
}

diagnoseCase();
