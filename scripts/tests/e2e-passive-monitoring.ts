#!/usr/bin/env ts-node
/**
 * End-to-End Test: Passive Case Monitoring
 * Tests the passive detection and context tracking workflow
 */

import { getContextManager } from "../../lib/context-manager";
import {
  printSection,
  printStep,
  printSuccess,
  printError,
  assert,
  assertEqual,
  assertDefined,
  assertContains,
  assertMinLength,
  createSampleContext,
  createTestSummary,
  printTestSummary,
  runTest,
  skipTest,
  isServiceNowConfigured,
} from "./test-helpers";

const CASE_NUMBER = "SCS0047868";

/**
 * Test 1: Case Number Extraction
 */
async function testCaseNumberExtraction(): Promise<void> {
  printStep(1, "Test case number extraction from various message formats");

  const contextManager = getContextManager();

  // Test different message formats
  const testCases = [
    { text: "Working on SCS0047868 - VPN issue", expected: ["SCS0047868"] },
    { text: "Cases SCS0047868 and SCS0048417 need attention", expected: ["SCS0047868", "SCS0048417"] },
    { text: "scs0047868 in lowercase", expected: [] }, // Should not match lowercase
    { text: "SCS047868 missing digit", expected: [] }, // Should not match wrong format
    { text: "Multiple mentions: SCS0047868, SCS0047868", expected: ["SCS0047868"] }, // Deduplication
  ];

  for (const test of testCases) {
    const extracted = contextManager.extractCaseNumbers(test.text);
    assertEqual(
      JSON.stringify(extracted.sort()),
      JSON.stringify(test.expected.sort()),
      `Extract from: "${test.text}"`
    );
  }
}

/**
 * Test 2: Context Creation and Tracking
 */
async function testContextTracking(): Promise<void> {
  printStep(2, "Test context creation and message tracking");

  const contextManager = getContextManager();
  const channelId = "C_TEST_001";
  const threadTs = Date.now().toString();

  // Add first message
  contextManager.addMessage(CASE_NUMBER, channelId, threadTs, {
    user: "U001",
    text: `Working on ${CASE_NUMBER} - user cannot connect to VPN`,
    timestamp: Date.now().toString(),
  });

  // Retrieve context (async)
  const context = await contextManager.getContext(CASE_NUMBER, threadTs);
  assertDefined(context, "Context should exist");

  assertEqual(context.caseNumber, CASE_NUMBER, "Case number matches");
  assertEqual(context.channelId, channelId, "Channel ID matches");
  assertEqual(context.messages.length, 1, "Has 1 message");
  assertEqual(context.isResolved || false, false, "Not resolved yet");

  printSuccess("Context created and tracked successfully");
}

/**
 * Test 3: Rolling Message Window
 */
async function testRollingWindow(): Promise<void> {
  printStep(3, "Test rolling 20-message window");

  const contextManager = getContextManager();
  const channelId = "C_TEST_002";
  const threadTs = Date.now().toString();

  // Add 25 messages (exceeds window of 20)
  for (let i = 0; i < 25; i++) {
    contextManager.addMessage(CASE_NUMBER, channelId, threadTs, {
      user: "U002",
      text: `Message ${i + 1} for ${CASE_NUMBER}`,
      timestamp: (Date.now() + i * 1000).toString(),
    });
  }

  const context = await contextManager.getContext(CASE_NUMBER, threadTs);
  assertDefined(context, "Context should exist");

  assertEqual(context.messages.length, 20, "Window limited to 20 messages");

  // First message should be message 6 (messages 1-5 were removed)
  assertContains(context.messages[0].text, "Message 6", "Oldest message is Message 6");
  assertContains(context.messages[19].text, "Message 25", "Newest message is Message 25");

  printSuccess("Rolling window works correctly");
}

/**
 * Test 4: Resolution Detection
 */
async function testResolutionDetection(): Promise<void> {
  printStep(4, "Test resolution keyword detection");

  const contextManager = getContextManager();
  const channelId = "C_TEST_003";
  const threadTs = Date.now().toString();

  // Add initial message
  contextManager.addMessage(CASE_NUMBER, channelId, threadTs, {
    user: "U003",
    text: `Investigating ${CASE_NUMBER}`,
    timestamp: Date.now().toString(),
  });

  let context = await contextManager.getContext(CASE_NUMBER, threadTs);
  assertDefined(context, "Context exists");
  assertEqual(context.isResolved || false, false, "Not resolved initially");

  // Test different resolution keywords
  const resolutionMessages = [
    "The issue is fixed",
    "Problem resolved!",
    "Case closed, working now",
    "It's working after restart",
    "Issue completed",
  ];

  for (const text of resolutionMessages) {
    const testChannelId = `C_TEST_RES_${resolutionMessages.indexOf(text)}`;
    const testThreadTs = `${Date.now()}_${resolutionMessages.indexOf(text)}`;

    contextManager.addMessage(CASE_NUMBER, testChannelId, testThreadTs, {
      user: "U003",
      text: `Working on ${CASE_NUMBER}`,
      timestamp: Date.now().toString(),
    });

    contextManager.addMessage(CASE_NUMBER, testChannelId, testThreadTs, {
      user: "U003",
      text,
      timestamp: (Date.now() + 1000).toString(),
    });

    const testContext = await contextManager.getContext(CASE_NUMBER, testThreadTs);
    assertDefined(testContext, `Context exists for: ${text}`);
    assertEqual(testContext.isResolved, true, `Detected resolution in: "${text}"`);
    assertDefined(testContext.resolvedAt, "Resolution timestamp set");
  }

  printSuccess("Resolution detection works for all keywords");
}

/**
 * Test 5: Multiple Cases in Same Thread
 */
async function testMultipleCasesInThread(): Promise<void> {
  printStep(5, "Test tracking multiple cases in same thread");

  const contextManager = getContextManager();
  const channelId = "C_TEST_004";
  const threadTs = Date.now().toString();

  const case1 = "SCS0047868";
  const case2 = "SCS0048417";

  // Add message mentioning case1
  contextManager.addMessage(case1, channelId, threadTs, {
    user: "U004",
    text: `Working on ${case1}`,
    timestamp: Date.now().toString(),
  });

  // Add message mentioning case2
  contextManager.addMessage(case2, channelId, threadTs, {
    user: "U004",
    text: `Also checking ${case2}`,
    timestamp: (Date.now() + 1000).toString(),
  });

  // Both contexts should exist
  const context1 = await contextManager.getContext(case1, threadTs);
  const context2 = await contextManager.getContext(case2, threadTs);

  assertDefined(context1, "Case 1 context exists");
  assertDefined(context2, "Case 2 context exists");

  assertEqual(context1.caseNumber, case1, "Case 1 number correct");
  assertEqual(context2.caseNumber, case2, "Case 2 number correct");

  // Both should have same thread and channel
  assertEqual(context1.threadTs, context2.threadTs, "Same thread");
  assertEqual(context1.channelId, context2.channelId, "Same channel");

  printSuccess("Multiple cases tracked independently in same thread");
}

/**
 * Test 6: Context Summary Generation
 */
async function testContextSummary(): Promise<void> {
  printStep(6, "Test conversation summary generation");

  const contextManager = getContextManager();
  const channelId = "C_TEST_005";
  const threadTs = Date.now().toString();

  // Add several messages
  const messages = [
    "User reports VPN connection failure",
    "Checked logs, seeing authentication error",
    "Restarted VPN client",
    "Issue resolved after client restart",
  ];

  for (const [idx, text] of messages.entries()) {
    contextManager.addMessage(CASE_NUMBER, channelId, threadTs, {
      user: `U00${idx}`,
      text,
      timestamp: (Date.now() + idx * 1000).toString(),
    });
  }

  const summary = contextManager.getSummary(CASE_NUMBER, threadTs);
  assertDefined(summary, "Summary generated");

  // Summary should contain all messages
  for (const msg of messages) {
    assert(summary.includes(msg), `Summary contains: "${msg}"`);
  }

  printSuccess("Context summary includes all messages");
}

/**
 * Test 7: Context Cleanup
 */
async function testContextCleanup(): Promise<void> {
  printStep(7, "Test old context cleanup");

  const contextManager = getContextManager();

  // Get initial stats
  const statsBefore = contextManager.getStats();
  printSuccess(`Current contexts: ${statsBefore.totalContexts}`);

  // Note: Actual cleanup test would require manipulating timestamps
  // or waiting, which is impractical in a quick test
  // Instead, we verify the cleanup method exists and doesn't error

  try {
    await contextManager.cleanupOldContexts();
    printSuccess("Cleanup method executed without errors");
  } catch (error) {
    printError("Cleanup failed", error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Test 8: Context Persistence (if database configured)
 */
async function testContextPersistence(): Promise<void> {
  printStep(8, "Test context persistence to database");

  if (!process.env.DATABASE_URL) {
    printSuccess("Skipped - DATABASE_URL not configured");
    return;
  }

  const contextManager = getContextManager();
  const channelId = "C_TEST_006";
  const threadTs = Date.now().toString();

  // Add message
  contextManager.addMessage(CASE_NUMBER, channelId, threadTs, {
    user: "U006",
    text: `Testing persistence for ${CASE_NUMBER}`,
    timestamp: Date.now().toString(),
  });

  // Wait a bit for async persistence
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Retrieve from database
  const context = await contextManager.getContext(CASE_NUMBER, threadTs);
  assertDefined(context, "Context persisted and retrieved");

  printSuccess("Context persistence working (database enabled)");
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  printSection("END-TO-END TEST: PASSIVE CASE MONITORING");

  const summary = createTestSummary();

  await runTest("Case Number Extraction", testCaseNumberExtraction, summary);
  await runTest("Context Tracking", testContextTracking, summary);
  await runTest("Rolling Message Window", testRollingWindow, summary);
  await runTest("Resolution Detection", testResolutionDetection, summary);
  await runTest("Multiple Cases in Thread", testMultipleCasesInThread, summary);
  await runTest("Context Summary", testContextSummary, summary);
  await runTest("Context Cleanup", testContextCleanup, summary);
  await runTest("Context Persistence", testContextPersistence, summary);

  printTestSummary(summary);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    printError("Test suite failed", error);
    process.exit(1);
  });
}

export { main as runPassiveMonitoringTests };
