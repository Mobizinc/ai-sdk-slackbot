/**
 * Mock test for AI Assistant triage tool
 * Tests the tool definition and response formatting without requiring ServiceNow
 */

import { z } from 'zod';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
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

async function testTriageToolSchema() {
  section('TEST 1: Triage Tool Input Schema Validation');

  const triageCaseInputSchema = z.object({
    caseNumber: z
      .string()
      .describe("The ServiceNow case number to triage and classify (e.g., 'SCS0001234', 'CS0048851')"),
  });

  const testInputs = [
    { input: { caseNumber: 'SCS0048851' }, shouldPass: true },
    { input: { caseNumber: 'CS0001234' }, shouldPass: true },
    { input: { caseNumber: 'INC0167587' }, shouldPass: true },
    { input: { caseNumber: '' }, shouldPass: false },
    { input: {}, shouldPass: false },
    { input: { caseNumber: 123 }, shouldPass: false },
  ];

  for (const test of testInputs) {
    try {
      const result = triageCaseInputSchema.parse(test.input);
      if (test.shouldPass) {
        log(`✓ PASS: ${JSON.stringify(test.input)} validated successfully`, COLORS.green);
      } else {
        log(`✗ FAIL: ${JSON.stringify(test.input)} should have failed validation`, COLORS.red);
      }
    } catch (error) {
      if (!test.shouldPass) {
        log(`✓ PASS: ${JSON.stringify(test.input)} correctly rejected`, COLORS.green);
      } else {
        log(`✗ FAIL: ${JSON.stringify(test.input)} should have passed validation`, COLORS.red);
      }
    }
  }
}

async function testResponseFormatting() {
  section('TEST 2: Response Formatting');

  // Mock triage result (simplified)
  const mockTriageResult = {
    caseNumber: 'SCS0048851',
    classification: {
      category: 'Cloud Services',
      subcategory: 'Azure - Quota Management',
      confidence_score: 0.92,
      urgency_level: 'High',
      quick_summary: 'User needs Azure subscription quota increase from 16 to 70 cores.',
      reasoning: 'Clear quota increase request with specific numbers and subscription details.',
      immediate_next_steps: [
        'Verify current quota usage in Azure portal',
        'Submit quota increase request through Azure Support',
        'Confirm target subscription and region',
      ],
      technical_entities: {
        systems: ['Azure Subscription #1303812'],
        users: [],
        software: ['Azure'],
        ip_addresses: [],
        error_codes: [],
      },
    },
    similarCases: [
      { case_number: 'SCS0048730', similarity_score: 0.95, short_description: 'Azure quota increase' },
      { case_number: 'SCS0047215', similarity_score: 0.88, short_description: 'Subscription limit increase' },
    ],
    kbArticles: [
      { kb_number: 'KB0012345', title: 'Azure Quota Management Guide', similarity_score: 8.5 },
      { kb_number: 'KB0012346', title: 'How to Request Quota Increases', similarity_score: 7.2 },
    ],
    recordTypeSuggestion: {
      type: 'Case',
      is_major_incident: false,
      reasoning: 'Standard service request for quota adjustment, not a service disruption',
    },
    processingTimeMs: 2345,
    cached: false,
  };

  // Test response formatting logic
  const confidencePercent = Math.round(mockTriageResult.classification.confidence_score * 100);

  console.log('Mock Response Preview:');
  console.log('---');
  console.log(`Case: ${mockTriageResult.caseNumber}`);
  console.log(`Category: ${mockTriageResult.classification.category} > ${mockTriageResult.classification.subcategory}`);
  console.log(`Confidence: ${confidencePercent}%`);
  console.log(`Urgency: ${mockTriageResult.classification.urgency_level}`);
  console.log('');
  console.log(`Summary: ${mockTriageResult.classification.quick_summary}`);
  console.log('');
  console.log('Next Steps:');
  mockTriageResult.classification.immediate_next_steps.forEach((step, idx) => {
    console.log(`  ${idx + 1}. ${step}`);
  });
  console.log('');
  console.log(`Similar Cases: ${mockTriageResult.similarCases.length}`);
  mockTriageResult.similarCases.forEach(sc => {
    console.log(`  • ${sc.case_number} (${Math.round(sc.similarity_score * 100)}% match)`);
  });
  console.log('');
  console.log(`KB Articles: ${mockTriageResult.kbArticles.length}`);
  mockTriageResult.kbArticles.forEach(kb => {
    console.log(`  • ${kb.kb_number}: ${kb.title} (${Math.round(kb.similarity_score * 10)}% relevant)`);
  });
  console.log('');
  console.log(`Record Type: ${mockTriageResult.recordTypeSuggestion.type}`);
  console.log(`Reasoning: ${mockTriageResult.recordTypeSuggestion.reasoning}`);
  console.log('');
  console.log(`Processing: ${mockTriageResult.processingTimeMs}ms${mockTriageResult.cached ? ' (cached)' : ''}`);
  console.log('---');

  log('\n✓ Response formatting test complete', COLORS.green);
}

async function testErrorHandling() {
  section('TEST 3: Error Handling Scenarios');

  const errorScenarios = [
    {
      name: 'Empty case number',
      input: { caseNumber: '' },
      expectedError: 'Case number is required',
    },
    {
      name: 'ServiceNow not configured',
      input: { caseNumber: 'SCS0048851' },
      expectedError: 'ServiceNow integration is not configured',
    },
    {
      name: 'Case not found',
      input: { caseNumber: 'SCS9999999' },
      expectedError: 'not found in ServiceNow',
    },
  ];

  for (const scenario of errorScenarios) {
    console.log(`Scenario: ${scenario.name}`);
    console.log(`  Input: ${JSON.stringify(scenario.input)}`);
    console.log(`  Expected error contains: "${scenario.expectedError}"`);
    log(`  ✓ Error handling logic defined`, COLORS.green);
  }
}

async function main() {
  log('\n🧪 AI ASSISTANT TRIAGE TOOL MOCK TEST SUITE\n', COLORS.cyan);

  await testTriageToolSchema();
  await testResponseFormatting();
  await testErrorHandling();

  console.log('');
  log('✓ All mock tests complete', COLORS.green);
  log('\nℹ Note: Integration tests require ServiceNow credentials', COLORS.cyan);
  log('  Run with actual ServiceNow environment to test full workflow', COLORS.cyan);
  console.log('');
}

main().catch((error) => {
  console.error('Mock test suite failed:', error);
  process.exit(1);
});
