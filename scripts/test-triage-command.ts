/**
 * Test script for manual triage command functionality
 *
 * Tests both approaches:
 * 1. AI Assistant tool calling (triageCase tool)
 * 2. @mention keyword detection
 */

import { getCaseTriageService } from '../lib/services/case-triage';
import { serviceNowClient } from '../lib/tools/servicenow';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function section(title: string) {
  console.log('');
  log('='.repeat(80), COLORS.cyan);
  log(`  ${title}`, COLORS.cyan);
  log('='.repeat(80), COLORS.cyan);
  console.log('');
}

async function testKeywordDetection() {
  section('TEST 1: @mention Keyword Detection');

  const testCases = [
    { text: '@bot triage SCS0048851', expected: 'SCS0048851' },
    { text: '@bot classify CS0001234', expected: 'CS0001234' },
    { text: '@bot analyze INC0167587', expected: 'INC0167587' },
    { text: '@bot triage case SCS0048851', expected: 'SCS0048851' },
    { text: '@bot help with SCS0048851', expected: null }, // Should not match
  ];

  const triageKeywordPattern = /(?:triage|classify|analyze)(?:\s+case)?\s+((?:SCS|CS|INC|RITM|REQ|CHG|PRB|SCTASK|STASK)[0-9]{7,10})/i;

  for (const testCase of testCases) {
    const match = testCase.text.match(triageKeywordPattern);
    const extracted = match ? match[1].toUpperCase() : null;

    if (extracted === testCase.expected) {
      log(`✓ PASS: "${testCase.text}" → ${extracted || 'no match'}`, COLORS.green);
    } else {
      log(`✗ FAIL: "${testCase.text}" → Expected: ${testCase.expected}, Got: ${extracted}`, COLORS.red);
    }
  }
}

async function testTriageServiceIntegration(caseNumber: string) {
  section(`TEST 2: Triage Service Integration - ${caseNumber}`);

  // Check ServiceNow configuration
  if (!serviceNowClient.isConfigured()) {
    log('⚠ ServiceNow not configured - skipping integration test', COLORS.yellow);
    return;
  }

  try {
    // Step 1: Fetch case from ServiceNow
    log(`1. Fetching case ${caseNumber} from ServiceNow...`, COLORS.blue);
    const caseDetails = await serviceNowClient.getCase(caseNumber);

    if (!caseDetails) {
      log(`✗ Case ${caseNumber} not found in ServiceNow`, COLORS.red);
      return;
    }

    log(`✓ Case found: ${caseDetails.short_description?.substring(0, 60)}...`, COLORS.green);
    console.log(`  Priority: ${caseDetails.priority}`);
    console.log(`  State: ${caseDetails.state}`);
    console.log(`  Category: ${caseDetails.category || 'Not set'}`);

    // Step 2: Run triage
    log(`\n2. Running triage classification...`, COLORS.blue);
    const caseTriageService = getCaseTriageService();

    const startTime = Date.now();
    const triageResult = await caseTriageService.triageCase(
      {
        case_number: caseDetails.number,
        sys_id: caseDetails.sys_id,
        short_description: caseDetails.short_description || "",
        description: caseDetails.description,
        priority: caseDetails.priority,
        urgency: caseDetails.priority, // Use priority as urgency
        state: caseDetails.state,
        category: caseDetails.category,
        subcategory: caseDetails.subcategory,
        assignment_group: caseDetails.assignment_group,
        assignment_group_sys_id: caseDetails.assignment_group,
        assigned_to: caseDetails.assigned_to,
        caller_id: caseDetails.caller_id,
        company: caseDetails.caller_id,
        account_id: undefined,
      },
      {
        enableCaching: true,
        enableSimilarCases: true,
        enableKBArticles: true,
        enableBusinessContext: true,
        enableWorkflowRouting: true,
        writeToServiceNow: false, // Don't write during test
      }
    );
    const duration = Date.now() - startTime;

    // Step 3: Display results
    log(`\n✓ Triage completed in ${duration}ms`, COLORS.green);

    const classification = triageResult.classification;
    const confidencePercent = Math.round((classification.confidence_score || 0) * 100);

    console.log('');
    log('CLASSIFICATION RESULTS:', COLORS.cyan);
    console.log(`  Category: ${classification.category}`);
    if (classification.subcategory) {
      console.log(`  Subcategory: ${classification.subcategory}`);
    }
    console.log(`  Confidence: ${confidencePercent}%`);
    console.log(`  Urgency Level: ${classification.urgency_level || 'N/A'}`);

    if (classification.quick_summary) {
      console.log(`\n  Summary: ${classification.quick_summary}`);
    }

    if (classification.immediate_next_steps && classification.immediate_next_steps.length > 0) {
      console.log(`\n  Next Steps:`);
      classification.immediate_next_steps.forEach((step, idx) => {
        console.log(`    ${idx + 1}. ${step}`);
      });
    }

    console.log('');
    log('SIMILAR CASES:', COLORS.cyan);
    if (triageResult.similarCases && triageResult.similarCases.length > 0) {
      console.log(`  Found: ${triageResult.similarCases.length} cases`);
      triageResult.similarCases.slice(0, 3).forEach((sc, idx) => {
        const similarity = Math.round(sc.similarity_score * 100);
        console.log(`    ${idx + 1}. ${sc.case_number} (${similarity}% match)`);
      });
    } else {
      console.log(`  None found`);
    }

    console.log('');
    log('KB ARTICLES:', COLORS.cyan);
    if (triageResult.kbArticles && triageResult.kbArticles.length > 0) {
      console.log(`  Found: ${triageResult.kbArticles.length} articles`);
      triageResult.kbArticles.slice(0, 3).forEach((kb, idx) => {
        const relevance = Math.round(kb.similarity_score * 10);
        console.log(`    ${idx + 1}. ${kb.kb_number}: ${kb.title?.substring(0, 50)}... (${relevance}%)`);
      });
    } else {
      console.log(`  None found`);
    }

    if (triageResult.recordTypeSuggestion) {
      console.log('');
      log('RECORD TYPE RECOMMENDATION:', COLORS.cyan);
      const suggestion = triageResult.recordTypeSuggestion;
      console.log(`  Type: ${suggestion.type}${suggestion.is_major_incident ? ' ⚠️ MAJOR INCIDENT' : ''}`);
      console.log(`  Reasoning: ${suggestion.reasoning}`);
    }

    console.log('');
    log('METADATA:', COLORS.cyan);
    console.log(`  Workflow: ${triageResult.workflowId}`);
    console.log(`  Processing Time: ${triageResult.processingTimeMs}ms`);
    console.log(`  Cached: ${triageResult.cached ? 'Yes' : 'No'}`);
    console.log(`  Entities Discovered: ${triageResult.entitiesDiscovered}`);

  } catch (error) {
    log(`\n✗ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`, COLORS.red);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

async function main() {
  log('\n🧪 TRIAGE COMMAND TEST SUITE\n', COLORS.cyan);

  // Test 1: Keyword detection (always runs)
  await testKeywordDetection();

  // Test 2: Integration test (requires ServiceNow + case number)
  const testCaseNumber = process.env.TEST_CASE_NUMBER || process.argv[2];

  if (testCaseNumber) {
    await testTriageServiceIntegration(testCaseNumber);
  } else {
    console.log('');
    log('⚠ Skipping integration test - no case number provided', COLORS.yellow);
    log('  Usage: npx tsx scripts/test-triage-command.ts <case_number>', COLORS.yellow);
    log('  Example: npx tsx scripts/test-triage-command.ts SCS0048851', COLORS.yellow);
  }

  console.log('');
  log('✓ Test suite complete', COLORS.green);
  console.log('');
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
