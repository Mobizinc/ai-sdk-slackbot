#!/usr/bin/env ts-node
/**
 * End-to-End Test: AI-Powered Interactive KB Assistant
 * Tests real AI service for generating intelligent follow-up questions
 */

import { generateGatheringQuestions } from "../../lib/services/interactive-kb-assistant";
import type { CaseContext } from "../../lib/context-manager";
import type { QualityAssessment } from "../../lib/services/case-quality-analyzer";
import {
  printSection,
  printStep,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  assert,
  assertEqual,
  assertDefined,
  assertMinLength,
  createTestSummary,
  printTestSummary,
  runTest,
} from "./test-helpers";

/**
 * Test 1: Generate Questions for Unclear Problem
 */
async function testUnclearProblemQuestions(): Promise<void> {
  printStep(1, "Test question generation for unclear problem");

  const context: CaseContext = {
    caseNumber: "TEST0001111",
    threadTs: "1234567890.111111",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Something is broken",
        timestamp: "2024-03-20T10:00:00Z",
      },
      {
        user: "bot",
        text: "I can help investigate. Can you provide more details?",
        timestamp: "2024-03-20T10:02:00Z",
      },
    ],
    detectedAt: new Date("2024-03-20T10:00:00Z"),
    lastUpdated: new Date("2024-03-20T10:02:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 25,
    problemClarity: "unclear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: [
      "Specific error message or symptom",
      "Affected system/application",
      "When the issue started",
    ],
  };

  printInfo("⏳ Generating REAL AI questions for unclear problem...");
  const result = await generateGatheringQuestions(assessment, context, "TEST0001111");
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assertMinLength(questions, 1, "At least 1 question generated");
  assert(questions.length <= 5, "No more than 5 questions (focused)");

  printInfo(`📝 Generated Questions (${questions.length}):`);
  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);
  });

  // Validate questions are relevant to problem clarity
  const hasErrorQuestion = questions.some((q) =>
    /error|symptom|message|issue|problem/i.test(q)
  );
  assert(hasErrorQuestion, "Includes question about error/symptom");

  printSuccess("✅ Questions for unclear problem generated (REAL AI)");
}

/**
 * Test 2: Generate Questions for Missing Solution Steps
 */
async function testMissingSolutionStepsQuestions(): Promise<void> {
  printStep(2, "Test question generation for missing solution steps");

  const context: CaseContext = {
    caseNumber: "TEST0002222",
    threadTs: "1234567890.222222",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "VPN authentication failed with error 0x80004005",
        timestamp: "2024-03-21T11:00:00Z",
        
      },
      {
        user: "bot",
        text: "Let me investigate this VPN error",
        timestamp: "2024-03-21T11:02:00Z",
      },
      {
        user: "user123",
        text: "It's fixed now",
        timestamp: "2024-03-21T11:30:00Z",
        
      },
    ],
    lastUpdated: new Date(),
    resolvedAt: new Date("2024-03-21T11:35:00Z"),
    detectedAt: new Date("2024-03-21T11:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 55,
    problemClarity: "clear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: ["Resolution steps", "What was changed", "Root cause"],
  };

  printInfo("⏳ Generating questions for missing solution steps...");
  const result = await generateGatheringQuestions(assessment, context, "TEST0002222");
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assertMinLength(questions, 1, "At least 1 question generated");

  printInfo(`📝 Generated Questions (${questions.length}):`);
  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);
  });

  // Validate questions target solution steps
  const hasStepsQuestion = questions.some((q) =>
    /steps|how|what.*do|fix|resolve|change/i.test(q)
  );
  assert(hasStepsQuestion, "Includes question about resolution steps");

  printSuccess("✅ Questions for missing solution generated (REAL AI)");
}

/**
 * Test 3: Generate Questions for Missing Root Cause
 */
async function testMissingRootCauseQuestions(): Promise<void> {
  printStep(3, "Test question generation for missing root cause");

  const context: CaseContext = {
    caseNumber: "TEST0003333",
    threadTs: "1234567890.333333",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Database connection timeout on production server",
        timestamp: "2024-03-22T09:00:00Z",
        
      },
      {
        user: "bot",
        text: "I'll check the connection settings",
        timestamp: "2024-03-22T09:05:00Z",
      },
      {
        user: "user123",
        text: "Increased connection pool from 50 to 100. Performance is better now.",
        timestamp: "2024-03-22T09:30:00Z",
        
      },
    ],
    lastUpdated: new Date(),
    resolvedAt: new Date("2024-03-22T09:35:00Z"),
    detectedAt: new Date("2024-03-22T09:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 65,
    problemClarity: "clear",
    solutionClarity: "somewhat_clear",
    stepsDocumented: true,
    rootCauseIdentified: false,
    missingInfo: ["Why connection pool was insufficient", "What caused the load increase"],
  };

  printInfo("⏳ Generating questions for missing root cause...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assertMinLength(questions, 1, "At least 1 question generated");

  printInfo(`📝 Generated Questions (${questions.length}):`);
  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);
  });

  // Validate questions target root cause
  const hasRootCauseQuestion = questions.some((q) =>
    /why|cause|reason|what caused|what led/i.test(q)
  );
  assert(hasRootCauseQuestion, "Includes question about root cause");

  printSuccess("✅ Questions for missing root cause generated (REAL AI)");
}

/**
 * Test 4: Question Quality - Open-Ended and Actionable
 */
async function testQuestionQuality(): Promise<void> {
  printStep(4, "Test question quality (open-ended, actionable)");

  const context: CaseContext = {
    caseNumber: "TEST0004444",
    threadTs: "1234567890.444444",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Email not sending",
        timestamp: "2024-03-23T14:00:00Z",
        
      },
    ],
    detectedAt: new Date("2024-03-23T14:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 30,
    problemClarity: "unclear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: [
      "Error message",
      "Email client",
      "When issue started",
      "Resolution steps",
    ],
  };

  printInfo("⏳ Generating questions and evaluating quality...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assertMinLength(questions, 1, "At least 1 question generated");

  printInfo(`📝 Generated Questions for Quality Check (${questions.length}):`);

  let openEndedCount = 0;
  let yesNoCount = 0;

  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);

    // Check if question is open-ended (starts with what/how/when/where/why)
    if (/^(what|how|when|where|why|which|can you)/i.test(q.trim())) {
      openEndedCount++;
    }

    // Check if question is yes/no (starts with is/are/do/does/did/was/were)
    if (/^(is|are|do|does|did|was|were|have|has)/i.test(q.trim())) {
      yesNoCount++;
    }
  });

  printInfo(`   Open-ended: ${openEndedCount}/${questions.length}`);
  printInfo(`   Yes/No: ${yesNoCount}/${questions.length}`);

  // Prefer open-ended questions (more detailed answers)
  if (openEndedCount >= questions.length / 2) {
    printSuccess("✅ Majority are open-ended questions (good quality)");
  } else {
    printWarning("⚠️  Few open-ended questions");
  }

  printSuccess("✅ Question quality evaluated");
}

/**
 * Test 5: Context Awareness - Questions Reference Conversation
 */
async function testContextAwareQuestions(): Promise<void> {
  printStep(5, "Test context-aware questions (reference conversation)");

  const context: CaseContext = {
    caseNumber: "TEST0005555",
    threadTs: "1234567890.555555",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Getting error 404 on the customer portal when trying to upload documents",
        timestamp: "2024-03-24T15:00:00Z",
        
      },
      {
        user: "bot",
        text: "I see you're getting a 404 error. Let me investigate the upload endpoint.",
        timestamp: "2024-03-24T15:02:00Z",
      },
      {
        user: "user123",
        text: "It only happens for PDF files larger than 10MB",
        timestamp: "2024-03-24T15:05:00Z",
        
      },
    ],
    detectedAt: new Date("2024-03-24T15:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 45,
    problemClarity: "somewhat_clear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: ["What was done to fix it", "Root cause of 404 for large PDFs"],
  };

  printInfo("⏳ Generating context-aware questions...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assertMinLength(questions, 1, "At least 1 question generated");

  printInfo(`📝 Generated Questions (${questions.length}):`);
  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);
  });

  // Check if questions reference context (404, PDF, upload, 10MB, etc.)
  const referencesContext = questions.some((q) =>
    /404|pdf|upload|10mb|large file|document|portal/i.test(q)
  );

  if (referencesContext) {
    printSuccess("✅ Questions reference conversation context");
  } else {
    printWarning("⚠️  Questions may not be context-aware");
  }

  printSuccess("✅ Context awareness evaluated");
}

/**
 * Test 6: Question Limit - Max 5 Questions
 */
async function testQuestionLimit(): Promise<void> {
  printStep(6, "Test question limit (max 5 questions)");

  const context: CaseContext = {
    caseNumber: "TEST0006666",
    threadTs: "1234567890.666666",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Everything is broken",
        timestamp: "2024-03-25T16:00:00Z",
        
      },
    ],
    detectedAt: new Date("2024-03-25T16:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 15,
    problemClarity: "unclear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: [
      "What is broken",
      "Error messages",
      "When it started",
      "What changed",
      "Affected systems",
      "Users impacted",
      "Attempted fixes",
      "Environment details",
      "Network status",
      "Recent deployments",
    ], // 10+ missing items
  };

  printInfo("⏳ Generating questions (testing limit)...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  assertDefined(questions, "Questions generated");
  assert(questions.length <= 5, `Respects 5-question limit (got ${questions.length})`);

  printInfo(`📝 Generated Questions (${questions.length}):`);
  questions.forEach((q, idx) => {
    printInfo(`   ${idx + 1}. ${q}`);
  });

  printSuccess(`✅ Question limit enforced: ${questions.length}/5 questions`);
}

/**
 * Test 7: Performance - Question Generation Time
 */
async function testQuestionGenerationPerformance(): Promise<void> {
  printStep(7, "Test question generation performance");

  const context: CaseContext = {
    caseNumber: "TEST0007777",
    threadTs: "1234567890.777777",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "Application slow",
        timestamp: "2024-03-26T17:00:00Z",
        
      },
    ],
    detectedAt: new Date("2024-03-26T17:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "needs_input",
    score: 35,
    problemClarity: "unclear",
    solutionClarity: "unclear",
    stepsDocumented: false,
    rootCauseIdentified: false,
    missingInfo: ["Specific slowness symptoms", "Resolution steps", "Root cause"],
  };

  const startTime = Date.now();

  printInfo("⏳ Measuring AI question generation time...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  const duration = Date.now() - startTime;

  printInfo(`⏱️  Generation time: ${duration}ms`);

  if (questions) {
    printInfo(`📝 Generated ${questions.length} questions in ${duration}ms`);
    questions.forEach((q, idx) => {
      printInfo(`   ${idx + 1}. ${q}`);
    });
  }

  // Performance threshold: should complete within 10 seconds
  assert(duration < 10000, `Generation completed in ${duration}ms (<10s)`);

  if (duration < 3000) {
    printSuccess(`✅ Excellent performance: ${duration}ms`);
  } else if (duration < 5000) {
    printSuccess(`✅ Good performance: ${duration}ms`);
  } else {
    printWarning(`⚠️  Slow performance: ${duration}ms`);
  }
}

/**
 * Test 8: Edge Case - High Quality (No Questions Needed)
 */
async function testHighQualityNoQuestions(): Promise<void> {
  printStep(8, "Test edge case: high quality assessment (no questions needed)");

  const context: CaseContext = {
    caseNumber: "TEST0008888",
    threadTs: "1234567890.888888",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "VPN authentication failed with error 0x80004005 on Windows 11",
        timestamp: "2024-03-27T10:00:00Z",
        
      },
      {
        user: "bot",
        text: "Let me check the cached credentials",
        timestamp: "2024-03-27T10:02:00Z",
      },
      {
        user: "user123",
        text:
          "Cleared cached credentials via cmdkey /delete, reinstalled VPN client v2.5, and reconnected successfully",
        timestamp: "2024-03-27T10:15:00Z",
        
      },
    ],
    lastUpdated: new Date(),
    resolvedAt: new Date("2024-03-27T10:20:00Z"),
    detectedAt: new Date("2024-03-27T10:00:00Z"),
  };

  const assessment: QualityAssessment = {
    decision: "high_quality",
    score: 92,
    problemClarity: "clear",
    solutionClarity: "clear",
    stepsDocumented: true,
    rootCauseIdentified: true,
    missingInfo: [],
  };

  printInfo("⏳ Generating questions for high-quality case...");
  const result = await generateGatheringQuestions(assessment, context, context.caseNumber);
  const questions = result.questions;

  if (questions.length === 0) {
    printSuccess("✅ No questions generated for high-quality case (expected)");
  } else {
    printWarning(
      `⚠️  Generated ${questions.length} questions for high-quality case (unexpected)`
    );
    questions.forEach((q, idx) => {
      printInfo(`   ${idx + 1}. ${q}`);
    });
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  printSection("END-TO-END TEST: AI INTERACTIVE KB ASSISTANT");

  const summary = createTestSummary();

  // Question generation tests
  await runTest(
    "Questions for Unclear Problem",
    testUnclearProblemQuestions,
    summary
  );
  await runTest(
    "Questions for Missing Solution Steps",
    testMissingSolutionStepsQuestions,
    summary
  );
  await runTest(
    "Questions for Missing Root Cause",
    testMissingRootCauseQuestions,
    summary
  );

  // Quality and context tests
  await runTest("Question Quality (Open-Ended)", testQuestionQuality, summary);
  await runTest("Context-Aware Questions", testContextAwareQuestions, summary);

  // Limits and edge cases
  await runTest("Question Limit (Max 5)", testQuestionLimit, summary);
  await runTest("High Quality (No Questions)", testHighQualityNoQuestions, summary);

  // Performance
  await runTest("Question Generation Performance", testQuestionGenerationPerformance, summary);

  printTestSummary(summary);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    printError("Test suite failed", error);
    process.exit(1);
  });
}

export { main as runInteractiveAssistantTests };
