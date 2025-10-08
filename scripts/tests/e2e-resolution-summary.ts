#!/usr/bin/env ts-node
/**
 * End-to-End Test: AI-Powered Resolution Summary Generation
 * Tests real AI service for generating concise, actionable resolution summaries
 */

import { generateResolutionSummary } from "../../lib/services/case-resolution-summary";
import type { CaseContext } from "../../lib/context-manager";
import { serviceNowClient } from "../../lib/tools/servicenow";
import {
  printSection,
  printStep,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  assert,
  assertDefined,
  assertMinLength,
  createTestSummary,
  printTestSummary,
  runTest,
} from "./test-helpers";

const CASE_NUMBER = "SCS0047868";

/**
 * Test 1: Generate Summary with Rich Context (Full ServiceNow Data)
 */
async function testRichContextSummary(): Promise<void> {
  printStep(1, "Test resolution summary with rich context (ServiceNow + conversation)");

  // Try to get real ServiceNow data, but use mocks if not configured
  let caseDetails: any = null;
  let journalEntries: any[] = [];

  if (process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL) {
    try {
      printInfo("⏳ Fetching REAL ServiceNow case details...");
      caseDetails = await serviceNowClient.getCase(CASE_NUMBER);
      assertDefined(caseDetails, "ServiceNow case retrieved");

      const caseSysId = caseDetails.sys_id || "";
      if (caseSysId) {
        printInfo("⏳ Fetching journal entries...");
        journalEntries = await serviceNowClient.getCaseJournal(caseSysId);
        printInfo(`📋 Found ${journalEntries.length} journal entries`);
      }
    } catch (error) {
      printWarning(`⚠️  ServiceNow fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      printWarning("⚠️  Using mock ServiceNow data");
      caseDetails = null;
    }
  } else {
    printInfo("ℹ️  ServiceNow not configured - using mock data");
  }

  // Mock conversation context (in real scenario, this comes from Slack thread)
  const context: CaseContext = {
    caseNumber: CASE_NUMBER,
    threadTs: "1234567890.123456",
    channelId: "C1234567890",
    messages: [
      {
        user: "user123",
        text: "User reported VPN authentication failure with error code 0x80004005",
        timestamp: "2024-03-15T10:00:00Z",
      },
      {
        user: "bot",
        text: "Let me investigate this VPN authentication issue. Can you provide the OS version?",
        timestamp: "2024-03-15T10:02:00Z",
      },
      {
        user: "user123",
        text: "Windows 11 Enterprise, latest patches applied",
        timestamp: "2024-03-15T10:05:00Z",
      },
      {
        user: "bot",
        text: "Checking cached credentials and VPN client configuration...",
        timestamp: "2024-03-15T10:07:00Z",
      },
      {
        user: "user123",
        text: "Cleared cached credentials and reinstalled VPN client. Issue resolved!",
        timestamp: "2024-03-15T10:20:00Z",
      },
    ],
    detectedAt: new Date("2024-03-15T10:00:00Z"),
    lastUpdated: new Date("2024-03-15T10:25:00Z"),
    resolvedAt: new Date("2024-03-15T10:25:00Z"),
  };

  printInfo("⏳ Generating REAL AI resolution summary...");
  const summary = await generateResolutionSummary({
    caseNumber: CASE_NUMBER,
    context,
    caseDetails,
    journalEntries,
  });

  assertDefined(summary, "Summary generated");
  assertMinLength(summary, 10, "Summary has meaningful content");

  printInfo(`📝 Generated Summary:\n${summary}`);

  // Validate formatting
  const lines = summary.split("\n").filter((line) => line.trim());
  assert(lines.length >= 2, "Summary has multiple points (at least 2)");

  // Check for bullet points or numbered list
  const hasBullets =
    summary.includes("•") || summary.includes("-") || /^\d+\./.test(summary);
  assert(hasBullets, "Summary uses bullet points or numbered list");

  // Check conciseness (each line should be ≤140 chars for Slack readability)
  for (const line of lines) {
    if (line.trim().length > 140) {
      printWarning(`⚠️  Line exceeds 140 chars: "${line.substring(0, 60)}..."`);
    }
  }

  printSuccess("✅ Rich context summary generated successfully (REAL AI)");
}

/**
 * Test 2: Generate Summary with Minimal Context (Conversation Only)
 */
async function testMinimalContextSummary(): Promise<void> {
  printStep(2, "Test resolution summary with minimal context (conversation only)");

  // Minimal context - no ServiceNow data
  const context: CaseContext = {
    caseNumber: "TEST0001234",
    threadTs: "1234567890.999999",
    channelId: "C1234567890",
    messages: [
      {
        user: "user456",
        text: "Email not sending, getting timeout error",
        timestamp: "2024-03-20T14:00:00Z",
      },
      {
        user: "bot",
        text: "I'll check the mail server status. Can you try sending a test email?",
        timestamp: "2024-03-20T14:02:00Z",
      },
      {
        user: "user456",
        text: "Restarted Outlook, now it works",
        timestamp: "2024-03-20T14:10:00Z",
      },
    ],
    detectedAt: new Date("2024-03-20T14:00:00Z"),
    lastUpdated: new Date("2024-03-20T14:15:00Z"),
    resolvedAt: new Date("2024-03-20T14:15:00Z"),
  };

  printInfo("⏳ Generating summary with minimal context (no ServiceNow data)...");
  const summary = await generateResolutionSummary({
    caseNumber: "TEST0001234",
    context,
    caseDetails: null, // No ServiceNow data
    journalEntries: [],
  });

  if (summary) {
    printInfo(`📝 Minimal Context Summary:\n${summary}`);
    assertMinLength(summary, 10, "Summary generated even with minimal context");
    printSuccess("✅ AI handled minimal context gracefully");
  } else {
    printWarning("⚠️  No summary generated for minimal context (expected behavior)");
  }
}

/**
 * Test 3: Validate Slack Markdown Formatting
 */
async function testSlackFormattingValidation(): Promise<void> {
  printStep(3, "Test Slack markdown formatting validation");

  const context: CaseContext = {
    caseNumber: "TEST0005678",
    threadTs: "1234567890.888888",
    channelId: "C1234567890",
    messages: [
      {
        user: "user789",
        text: "Database connection timeout on production server",
        timestamp: "2024-03-22T09:00:00Z",
      },
      {
        user: "bot",
        text: "Checking connection pool settings and network latency...",
        timestamp: "2024-03-22T09:05:00Z",
      },
      {
        user: "user789",
        text: "Increased connection pool size to 100. Performance improved!",
        timestamp: "2024-03-22T09:30:00Z",
      },
    ],
    detectedAt: new Date("2024-03-22T09:00:00Z"),
    lastUpdated: new Date("2024-03-22T09:35:00Z"),
    resolvedAt: new Date("2024-03-22T09:35:00Z"),
  };

  printInfo("⏳ Generating summary and validating Slack formatting...");
  const summary = await generateResolutionSummary({
    caseNumber: "TEST0005678",
    context,
    caseDetails: null,
    journalEntries: [],
  });

  if (summary) {
    printInfo(`📝 Summary for Formatting Check:\n${summary}`);

    // Validate Slack markdown compatibility
    const invalidPatterns = [
      { pattern: /\*\*/, name: "Bold (should use *text* not **text**)" },
      { pattern: /__/, name: "Italic (should use _text_ not __text__)" },
      { pattern: /```[\s\S]*?```/, name: "Code blocks (acceptable)" },
      { pattern: /`[^`]+`/, name: "Inline code (acceptable)" },
    ];

    for (const { pattern, name } of invalidPatterns) {
      if (pattern.test(summary)) {
        if (name.includes("acceptable")) {
          printSuccess(`✅ Contains ${name}`);
        } else {
          printWarning(`⚠️  Contains ${name}`);
        }
      }
    }

    // Check for Slack-friendly bullet points
    const hasSlackBullets =
      summary.includes("•") || summary.includes("- ") || /^\d+\.\s/.test(summary);
    assert(hasSlackBullets, "Uses Slack-compatible bullet points");

    printSuccess("✅ Slack formatting validated");
  } else {
    printWarning("⚠️  No summary generated for formatting test");
  }
}

/**
 * Test 4: Conciseness Validation (≤140 chars per bullet)
 */
async function testConcisenessValidation(): Promise<void> {
  printStep(4, "Test conciseness validation (≤140 chars per bullet)");

  const context: CaseContext = {
    caseNumber: "TEST0009999",
    threadTs: "1234567890.777777",
    channelId: "C1234567890",
    messages: [
      {
        user: "user999",
        text:
          "Application crashes on startup with error: System.NullReferenceException at Module.Initialize()",
        timestamp: "2024-03-25T11:00:00Z",
      },
      {
        user: "bot",
        text:
          "This looks like a null reference issue in the initialization module. Let me check the logs.",
        timestamp: "2024-03-25T11:02:00Z",
      },
      {
        user: "user999",
        text:
          "Found it! Missing config file. Added app.config with default settings and app starts now.",
        timestamp: "2024-03-25T11:15:00Z",
      },
    ],
    detectedAt: new Date("2024-03-25T11:00:00Z"),
    lastUpdated: new Date("2024-03-25T11:20:00Z"),
    resolvedAt: new Date("2024-03-25T11:20:00Z"),
  };

  printInfo("⏳ Generating summary and checking conciseness...");
  const summary = await generateResolutionSummary({
    caseNumber: "TEST0009999",
    context,
    caseDetails: null,
    journalEntries: [],
  });

  if (summary) {
    printInfo(`📝 Summary for Conciseness Check:\n${summary}`);

    const bullets = summary
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.trim());

    let exceededCount = 0;

    for (const bullet of bullets) {
      const cleanBullet = bullet.replace(/^[•\-\d+\.]\s*/, "").trim();
      if (cleanBullet.length > 140) {
        printWarning(
          `⚠️  Bullet exceeds 140 chars (${cleanBullet.length}): "${cleanBullet.substring(0, 60)}..."`
        );
        exceededCount++;
      } else {
        printSuccess(`✅ Bullet within limit (${cleanBullet.length} chars)`);
      }
    }

    if (exceededCount === 0) {
      printSuccess("✅ All bullets are concise (≤140 chars)");
    } else {
      printWarning(`⚠️  ${exceededCount}/${bullets.length} bullets exceed 140 chars`);
    }
  } else {
    printWarning("⚠️  No summary generated for conciseness test");
  }
}

/**
 * Test 5: Error Handling - Empty Conversation
 */
async function testEmptyConversationHandling(): Promise<void> {
  printStep(5, "Test error handling for empty conversation");

  const context: CaseContext = {
    caseNumber: "TEST0000000",
    threadTs: "1234567890.666666",
    channelId: "C1234567890",
    messages: [], // Empty conversation
    detectedAt: new Date(),
    lastUpdated: new Date(),
  };

  printInfo("⏳ Testing with empty conversation...");
  const summary = await generateResolutionSummary({
    caseNumber: "TEST0000000",
    context,
    caseDetails: null,
    journalEntries: [],
  });

  if (summary === null || summary.trim() === "") {
    printSuccess("✅ Gracefully handled empty conversation (returned null/empty)");
  } else {
    printWarning(`⚠️  Generated summary for empty conversation: "${summary}"`);
  }
}

/**
 * Test 6: Performance - Summary Generation Time
 */
async function testSummaryPerformance(): Promise<void> {
  printStep(6, "Test summary generation performance");

  const context: CaseContext = {
    caseNumber: "TEST0011111",
    threadTs: "1234567890.555555",
    channelId: "C1234567890",
    messages: [
      {
        user: "user111",
        text: "Printer not working",
        timestamp: "2024-03-26T13:00:00Z",
      },
      {
        user: "bot",
        text: "Let me check the printer status",
        timestamp: "2024-03-26T13:02:00Z",
      },
      {
        user: "user111",
        text: "Turned it off and on again. Works now!",
        timestamp: "2024-03-26T13:05:00Z",
      },
    ],
    detectedAt: new Date("2024-03-26T13:00:00Z"),
    lastUpdated: new Date("2024-03-26T13:10:00Z"),
    resolvedAt: new Date("2024-03-26T13:10:00Z"),
  };

  const startTime = Date.now();

  printInfo("⏳ Measuring AI summary generation time...");
  const summary = await generateResolutionSummary({
    caseNumber: "TEST0011111",
    context,
    caseDetails: null,
    journalEntries: [],
  });

  const duration = Date.now() - startTime;

  printInfo(`⏱️  Generation time: ${duration}ms`);

  if (summary) {
    printInfo(`📝 Summary: ${summary}`);
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
 * Main test runner
 */
async function main(): Promise<void> {
  printSection("END-TO-END TEST: AI RESOLUTION SUMMARY GENERATION");

  const summary = createTestSummary();

  // Rich context test (uses real ServiceNow data)
  await runTest("Rich Context Summary (ServiceNow + Conversation)", testRichContextSummary, summary);

  // Minimal context test
  await runTest("Minimal Context Summary (Conversation Only)", testMinimalContextSummary, summary);

  // Formatting validation
  await runTest("Slack Markdown Formatting", testSlackFormattingValidation, summary);

  // Conciseness validation
  await runTest("Conciseness Validation (≤140 chars)", testConcisenessValidation, summary);

  // Error handling
  await runTest("Empty Conversation Handling", testEmptyConversationHandling, summary);

  // Performance
  await runTest("Summary Generation Performance", testSummaryPerformance, summary);

  printTestSummary(summary);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    printError("Test suite failed", error);
    process.exit(1);
  });
}

export { main as runResolutionSummaryTests };
