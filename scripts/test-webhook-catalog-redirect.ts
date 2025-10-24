/**
 * Test Webhook Flow with Catalog Redirect (DRY RUN)
 * Simulates the complete webhook processing with catalog redirect enabled
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts <case_number>
 *
 * Examples:
 *   npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts SCS0048754  # Termination
 *   npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts SCS0048833  # Onboarding
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getHRRequestDetector } from '../lib/services/hr-request-detector';
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

async function testWebhookCatalogRedirect() {
  const caseNumber = process.argv[2];

  if (!caseNumber) {
    console.error('❌ Usage: npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts <case_number>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts SCS0048754  # Termination');
    console.error('  npx tsx --env-file=.env.local scripts/test-webhook-catalog-redirect.ts SCS0048833  # Onboarding');
    process.exit(1);
  }

  console.log('🧪 Testing Webhook Catalog Redirect Flow (DRY RUN)');
  console.log(`   Case: ${caseNumber}`);
  console.log('');
  console.log('⚠️  This is a DRY RUN - no changes will be made to ServiceNow');
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client not configured');
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Fetch Case from ServiceNow');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const caseData = await serviceNowClient.getCase(caseNumber);

    if (!caseData) {
      console.error(`❌ Case ${caseNumber} not found`);
      process.exit(1);
    }

    console.log('Case Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Number:             ${caseData.number}`);
    console.log(`Sys ID:             ${caseData.sys_id}`);
    console.log(`Short Description:  ${caseData.short_description}`);
    console.log(`Company:            ${caseData.company_name}`);
    console.log(`Company ID:         ${caseData.company}`);
    console.log(`Submitted By:       ${caseData.submitted_by}`);
    console.log(`Category:           ${caseData.category}`);
    console.log(`State:              ${caseData.state}`);
    console.log('');

    if (caseData.description) {
      console.log('Description (first 300 chars):');
      console.log('─────────────────────────────────────────────────────');
      console.log(caseData.description.substring(0, 300) + (caseData.description.length > 300 ? '...' : ''));
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚙️  STEP 2: Load Client Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const repo = getClientSettingsRepository();
    const clientId = caseData.company;

    if (!clientId) {
      console.error('❌ No company ID found in case');
      process.exit(1);
    }

    const clientSettings = await repo.getClientSettings(clientId);

    if (!clientSettings) {
      console.log('❌ No client settings found for this company');
      console.log('   Catalog redirect is not configured');
      process.exit(0);
    }

    console.log('Client Configuration:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Client Name:                ${clientSettings.clientName}`);
    console.log(`Redirect Enabled:           ${clientSettings.catalogRedirectEnabled ? '✅ Yes' : '❌ No'}`);
    console.log(`Confidence Threshold:       ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
    console.log(`Auto-Close Cases:           ${clientSettings.catalogRedirectAutoClose ? '✅ Yes' : '❌ No'}`);
    console.log(`Support Contact:            ${clientSettings.supportContactInfo || '(not set)'}`);
    console.log(`Custom Catalog Mappings:    ${clientSettings.customCatalogMappings?.length || 0}`);
    console.log('');

    if (clientSettings.customCatalogMappings && clientSettings.customCatalogMappings.length > 0) {
      console.log('Configured Keyword Mappings:');
      clientSettings.customCatalogMappings.forEach((mapping: any, i: number) => {
        console.log(`  ${i + 1}. ${mapping.requestType.toUpperCase()}`);
        console.log(`     Keywords: ${mapping.keywords.slice(0, 5).join(', ')}...`);
        console.log(`     Catalog:  ${mapping.catalogItemNames.join(', ')}`);
        console.log(`     Priority: ${mapping.priority}`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 STEP 3: Run HR Request Detection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const detector = getHRRequestDetector();
    const detectionResult = detector.detectHRRequest({
      shortDescription: caseData.short_description || '',
      description: caseData.description || '',
      category: caseData.category,
      subcategory: caseData.subcategory,
      customMappings: clientSettings.customCatalogMappings, // Use client-specific mappings
    });

    console.log('Detection Result:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Is HR Request:          ${detectionResult.isHRRequest ? '✅ Yes' : '❌ No'}`);
    console.log(`Request Type:           ${detectionResult.requestType || '(none)'}`);
    console.log(`Confidence:             ${(detectionResult.confidence * 100).toFixed(1)}%`);
    console.log(`Threshold Required:     ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
    console.log(`Meets Threshold:        ${detectionResult.confidence >= clientSettings.catalogRedirectConfidenceThreshold ? '✅ Yes' : '❌ No'}`);
    console.log('');

    if (detectionResult.matchedKeywords && detectionResult.matchedKeywords.length > 0) {
      console.log(`Matched Keywords (${detectionResult.matchedKeywords.length}):');
      detectionResult.matchedKeywords.forEach((kw, i) => {
        console.log(`  ${i + 1}. "${kw}"`);
      });
      console.log('');
    }

    // Check if redirect would happen
    const shouldRedirect = clientSettings.catalogRedirectEnabled &&
      detectionResult.isHRRequest &&
      detectionResult.confidence >= clientSettings.catalogRedirectConfidenceThreshold;

    if (!shouldRedirect) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⏸️  REDIRECT WOULD NOT TRIGGER');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');

      if (!clientSettings.catalogRedirectEnabled) {
        console.log('Reason: Catalog redirect is disabled for this client');
      } else if (!detectionResult.isHRRequest) {
        console.log('Reason: Not detected as an HR request');
      } else {
        console.log(`Reason: Confidence ${(detectionResult.confidence * 100).toFixed(1)}% below threshold ${clientSettings.catalogRedirectConfidenceThreshold * 100}%`);
      }

      console.log('');
      process.exit(0);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 STEP 4: Find Matching Catalog Items');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Find matching catalog mapping
    const matchingMapping = clientSettings.customCatalogMappings?.find(
      (mapping: any) => mapping.requestType === detectionResult.requestType
    );

    if (!matchingMapping) {
      console.log('❌ No catalog mapping found for request type:', detectionResult.requestType);
      process.exit(0);
    }

    console.log('Matching Catalog Mapping:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Request Type:   ${matchingMapping.requestType}`);
    console.log(`Catalog Items:  ${matchingMapping.catalogItemNames.join(', ')}`);
    console.log(`Priority:       ${matchingMapping.priority}`);
    console.log('');

    // Fetch actual catalog items from ServiceNow
    console.log('Fetching catalog item details from ServiceNow...');
    console.log('');

    const catalogItems = [];
    for (const catalogName of matchingMapping.catalogItemNames) {
      const item = await serviceNowClient.getCatalogItemByName(catalogName);
      if (item) {
        catalogItems.push(item);
      }
    }

    if (catalogItems.length === 0) {
      console.log('❌ No catalog items found with specified names');
      process.exit(0);
    }

    console.log(`✅ Found ${catalogItems.length} catalog item(s):`);
    console.log('');
    catalogItems.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name}`);
      console.log(`   Sys ID:      ${item.sys_id}`);
      console.log(`   Description: ${item.short_description || '(none)'}`);
      console.log(`   Category:    ${item.category || '(none)'}`);
      console.log(`   URL:         ${item.url}`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 5: Generate Work Note');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Generate work note using the message template
    const requestTypeName = detectionResult.requestType!.replace(/_/g, ' ');
    const contactInfo = clientSettings.supportContactInfo || 'your IT Support team';

    const catalogItemsList = catalogItems.map(item => `  • ${item.name}\n    ${item.url}`).join('\n\n');
    const closureMessage = clientSettings.catalogRedirectAutoClose
      ? `This case (${caseNumber}) will be closed. Please resubmit using the catalog link above.`
      : `Please resubmit your request using the catalog link${catalogItems.length > 1 ? 's' : ''} above.`;

    const workNote = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CATALOG ITEM REDIRECT RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hello,

Thank you for contacting IT Support regarding a ${requestTypeName} request.

To ensure your request is processed efficiently with all required information, please submit this through our dedicated HR Request catalog:

📋 RECOMMENDED CATALOG ITEM${catalogItems.length > 1 ? 'S' : ''}:
${catalogItemsList}

**Why use the catalog?**
✅ Faster processing with automated routing
✅ Ensures all required fields are captured
✅ Direct routing to specialized team
✅ Better tracking and reporting
✅ Reduces back-and-forth communication

${closureMessage}

If you have questions or need assistance, please contact ${contactInfo}.

Thank you for your cooperation in helping us maintain an efficient support process!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Automated Redirect | Confidence: ${(detectionResult.confidence * 100).toFixed(1)}%
Matched Keywords: ${detectionResult.matchedKeywords.join(', ')}`;

    console.log('Generated Work Note:');
    console.log('─────────────────────────────────────────────────────');
    console.log(workNote);
    console.log('');

    const processingTime = Date.now() - startTime;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DRY RUN COMPLETE - WHAT WOULD HAPPEN IN PRODUCTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('📊 Summary:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Case Number:                ${caseNumber}`);
    console.log(`Company:                    ${clientSettings.clientName}`);
    console.log(`Detected Type:              ${detectionResult.requestType}`);
    console.log(`Confidence:                 ${(detectionResult.confidence * 100).toFixed(1)}%`);
    console.log(`Threshold Met:              ${detectionResult.confidence >= clientSettings.catalogRedirectConfidenceThreshold ? '✅ Yes' : '❌ No'}`);
    console.log(`Catalog Items Found:        ${catalogItems.length}`);
    console.log(`Processing Time:            ${processingTime}ms`);
    console.log('');

    console.log('🚀 Actions That Would Occur:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`1. ✅ Add work note to case ${caseNumber}`);
    console.log(`   └─ Work note includes ${catalogItems.length} catalog item link${catalogItems.length > 1 ? 's' : ''}`);
    console.log('');

    if (clientSettings.catalogRedirectAutoClose) {
      console.log(`2. ✅ Close case ${caseNumber}`);
      console.log(`   └─ State: Resolved`);
      console.log(`   └─ Close Code: Incorrectly Submitted - Please Use Catalog`);
      console.log(`   └─ Close Notes: Automatically closed - HR request must be submitted via catalog`);
      console.log('');
    } else {
      console.log(`2. ⏸️  Case ${caseNumber} would remain OPEN (auto-close is disabled)`);
      console.log(`   └─ Work note added, but case stays open for manual review`);
      console.log('');
    }

    console.log(`3. ✅ Log redirect to database`);
    console.log(`   └─ Request Type: ${detectionResult.requestType}`);
    console.log(`   └─ Confidence: ${(detectionResult.confidence * 100).toFixed(1)}%`);
    console.log(`   └─ Matched Keywords: ${detectionResult.matchedKeywords.join(', ')}`);
    console.log(`   └─ Case Closed: ${clientSettings.catalogRedirectAutoClose ? 'Yes' : 'No'}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ RESULT: Redirect Would SUCCEED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('This was a DRY RUN - no changes were made to ServiceNow.');
    console.log('');
    console.log('To enable live catalog redirect:');
    console.log('  1. Set CATALOG_REDIRECT_ENABLED=true in .env.local');
    console.log('  2. Set CASE_CLASSIFICATION_WRITE_NOTES=true in .env.local');
    console.log('  3. Restart the webhook endpoint');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing catalog redirect:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

testWebhookCatalogRedirect();
