/**
 * Test script for simplified ServiceNow webhook
 * Verifies the webhook can process a sample payload end-to-end
 */

import { getCaseClassifier } from '../lib/services/case-classifier';
import { formatWorkNote } from '../lib/services/work-note-formatter';

// Sample case data that matches the CaseData interface
const sampleCaseData = {
  case_number: 'CS0001234',
  sys_id: 'test-sys-id-12345',
  short_description: 'User unable to access VPN connection',
  description: 'User John Smith reports that he cannot connect to the VPN. Getting error "Authentication failed". Tried resetting password but issue persists.',
  priority: '3',
  urgency: '3',
  state: '1',
  assignment_group: 'Network Support',
  company: 'Acme Corporation',
  company_name: 'Acme Corporation',
  current_category: 'Networking'
};

async function testWebhookFlow() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Testing Simplified Webhook Flow');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Step 1: Getting case classifier instance...');
    const classifier = getCaseClassifier();
    console.log('✓ Case classifier initialized\n');

    console.log('Step 2: Processing case with classifyCaseEnhanced()...');
    console.log(`Case Number: ${sampleCaseData.case_number}`);
    console.log(`Short Description: ${sampleCaseData.short_description}\n`);

    const startTime = Date.now();
    const result = await classifier.classifyCaseEnhanced(sampleCaseData);
    const processingTime = Date.now() - startTime;

    console.log('✓ Classification completed\n');

    console.log('━━━ Classification Result ━━━');
    console.log(`Category: ${result.category}`);
    console.log(`Subcategory: ${result.subcategory || 'N/A'}`);
    console.log(`Confidence: ${(result.confidence_score * 100).toFixed(1)}%`);
    console.log(`Urgency Level: ${result.urgency_level || 'N/A'}`);
    console.log(`Workflow ID: ${result.workflowId}`);
    console.log(`Processing Time: ${processingTime}ms`);
    console.log(`Entities Discovered: ${result.discoveredEntities.length}`);
    console.log(`Similar Cases: ${result.similar_cases?.length || 0}`);
    console.log(`KB Articles: ${result.kb_articles?.length || 0}\n`);

    if (result.discoveredEntities.length > 0) {
      console.log('Discovered Entities:');
      result.discoveredEntities.forEach(entity => {
        console.log(`  - ${entity.entityType}: ${entity.entityValue} (${entity.confidence.toFixed(2)} confidence, source: ${entity.source})`);
      });
      console.log('');
    }

    if (result.business_intelligence) {
      const bi = result.business_intelligence;
      console.log('Business Intelligence:');
      if (bi.project_scope_detected) {
        console.log(`  - ⚠️ PROJECT SCOPE: ${bi.project_scope_reason}`);
      }
      if (bi.executive_visibility) {
        console.log(`  - 👔 EXECUTIVE VISIBILITY: ${bi.executive_visibility_reason}`);
      }
      if (bi.compliance_impact) {
        console.log(`  - ⚖️ COMPLIANCE IMPACT: ${bi.compliance_impact_reason}`);
      }
      if (bi.financial_impact) {
        console.log(`  - 💰 FINANCIAL IMPACT: ${bi.financial_impact_reason}`);
      }
      if (bi.outside_service_hours) {
        console.log(`  - 🕐 OUTSIDE HOURS: ${bi.service_hours_note}`);
      }
      console.log('');
    }

    console.log('Step 3: Formatting work note...');
    const workNote = formatWorkNote(result as any);
    console.log('✓ Work note formatted\n');

    console.log('━━━ Generated Work Note ━━━');
    console.log(workNote);
    console.log('━━━ End Work Note ━━━\n');

    console.log('✅ All steps completed successfully!');
    console.log(`\nTotal processing time: ${result.processingTimeMs}ms`);

    // Verify critical fields are present
    console.log('\n━━━ Verification Checks ━━━');
    const checks = {
      'Category present': !!result.category,
      'Confidence score valid': result.confidence_score >= 0 && result.confidence_score <= 1,
      'Workflow ID present': !!result.workflowId,
      'Processing time recorded': result.processingTimeMs > 0,
      'Discovered entities array': Array.isArray(result.discoveredEntities),
      'Business context confidence': result.businessContextConfidence >= 0
    };

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`${passed ? '✓' : '✗'} ${check}`);
    });

    const allPassed = Object.values(checks).every(v => v);
    console.log(`\n${allPassed ? '✅ All verification checks passed!' : '❌ Some checks failed'}`);

    return { success: true, result };

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    return { success: false, error };
  }
}

// Run the test
testWebhookFlow()
  .then(({ success }) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
