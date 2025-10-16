/**
 * Test Case Classification with Altus Community Healthcare
 * This will properly test dynamic application service loading
 */

// CRITICAL: Load environment variables BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getCaseTriageService } from '../lib/services/case-triage';
import type { ServiceNowCaseWebhook } from '../lib/schemas/servicenow-webhook';

async function testAltusGoRevCase() {
  console.log('🧪 Testing Altus GoRev Case with Dynamic Application Services');
  console.log('='.repeat(80));
  console.log('');

  // Simulate a GoRev case from Altus Community Healthcare
  // Company sys_id: c3eec28c931c9a1049d9764efaba10f3
  const webhook: ServiceNowCaseWebhook = {
    case_number: 'SCS0TEST001',
    sys_id: 'test_sys_id_12345',
    short_description: 'Users unable to access GoRev application',
    description: `Multiple users reporting inability to log into GoRev application this morning.

Error message: "Authentication failed - please contact your administrator"

Affected users:
- John Smith (jsmith@altus.com)
- Sarah Johnson (sjohnson@altus.com)
- Mike Davis (mdavis@altus.com)

Issue started around 9:00 AM PST. GoRev is critical for our revenue cycle operations.
Users need immediate access to process claims and patient billing.

Environment: Citrix-hosted GoRev Production
Location: Main Office
Impact: 15+ users unable to work`,
    company: 'c3eec28c931c9a1049d9764efaba10f3', // Altus Community Healthcare
    category: 'Application',
    state: 'Open',
    priority: '2',
    urgency: '2',
    opened_at: new Date(),
  };

  console.log('Test Case Details:');
  console.log(`  Case: ${webhook.case_number}`);
  console.log(`  Company: Altus Community Healthcare`);
  console.log(`  Short Description: ${webhook.short_description}`);
  console.log('');
  console.log('Processing through case triage...');
  console.log('');

  try {
    const triageService = getCaseTriageService();
    const result = await triageService.triageCase(webhook, {
      enableCaching: false,
      enableSimilarCases: true,
      enableKBArticles: true,
    });

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ CASE PROCESSED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log('');

    console.log('RESULTS:');
    console.log(`  Classification: ${result.classification?.category || 'N/A'} > ${result.classification?.subcategory || 'N/A'}`);
    console.log(`  Confidence: ${result.classification?.confidence_score ? (result.classification.confidence_score * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log('');
    console.log(`  Service Offering: ${result.service_offering_match?.name || 'NOT FOUND'}`);
    console.log(`  Service Offering sys_id: ${result.service_offering_match?.sys_id || 'N/A'}`);
    console.log('');
    console.log(`  Application Service: ${result.application_service_match?.name || 'NOT FOUND'}`);
    console.log(`  Application Service sys_id: ${result.application_service_match?.sys_id || 'N/A'}`);
    console.log('');
    console.log(`  Incident Created: ${result.incident_number || 'No'}`);
    console.log(`  Problem Created: ${result.problem_number || 'No'}`);
    console.log('');

    // Verify all three fixes
    console.log('='.repeat(80));
    console.log('VERIFICATION:');
    console.log('='.repeat(80));
    console.log('');

    let allPassed = true;

    // Fix #1: Incident categories
    if (result.incident_number) {
      console.log('✅ FIX #1: Incident category set correctly');
    } else {
      console.log('❌ FIX #1: No incident created');
      allPassed = false;
    }

    // Fix #2: Service Offering
    if (result.service_offering_match?.name === 'Application Administration') {
      console.log(`✅ FIX #2: Service Offering identified and linked: ${result.service_offering_match.name}`);
    } else {
      console.log(`❌ FIX #2: Service Offering not found (expected: Application Administration, got: ${result.service_offering_match?.name || 'none'})`);
      allPassed = false;
    }

    // Fix #3: Application Service
    if (result.application_service_match?.name === 'Altus Health - Gorev Production') {
      console.log(`✅ FIX #3: Application Service identified and linked: ${result.application_service_match.name}`);
    } else {
      console.log(`❌ FIX #3: Application Service not found (expected: Altus Health - Gorev Production, got: ${result.application_service_match?.name || 'none'})`);
      allPassed = false;
    }

    console.log('');
    if (allPassed) {
      console.log('🎉 ALL THREE FIXES VERIFIED SUCCESSFULLY!');
    } else {
      console.log('⚠️  Some fixes need attention - check logs above');
    }

  } catch (error) {
    console.error('');
    console.error('❌ Error processing case:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

testAltusGoRevCase()
  .catch((error) => {
    console.error('');
    console.error('❌ Test failed:');
    console.error(error);
    process.exit(1);
  });
