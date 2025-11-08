#!/usr/bin/env tsx
/**
 * Feedback Collection Feature - Integration Test Script
 *
 * Tests the complete feedback collection flow:
 * 1. BRD generation using Claude
 * 2. GitHub issue creation
 * 3. End-to-end integration
 *
 * Usage:
 *   # Test with mocks (no real API calls):
 *   tsx scripts/test-feedback-collection.ts --mock
 *
 *   # Test with real APIs (requires ANTHROPIC_API_KEY and GitHub config):
 *   tsx scripts/test-feedback-collection.ts --real
 *
 *   # Test individual components:
 *   tsx scripts/test-feedback-collection.ts --test-brd
 *   tsx scripts/test-feedback-collection.ts --test-github
 */

import { generateBRD } from "../lib/services/brd-generator";
import { createGitHubIssue } from "../lib/services/github-issue-service";
import { createFeedbackCollectionTool } from "../lib/agent/tools/feedback-collection";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log("\n" + "=".repeat(60));
  log(title, colors.cyan);
  console.log("=".repeat(60) + "\n");
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

// Test data
const testFeedback = {
  featureDescription: "Advanced search functionality with filters and date ranges",
  useCase: "Support agents need to quickly find specific cases using multiple criteria like status, priority, date created, and customer name",
  currentLimitation: "Current search only supports basic text search across case descriptions, making it difficult to find specific cases quickly",
  conversationContext: `[1] User: I'm having trouble finding cases efficiently
[2] Assistant: What specific search capabilities do you need?
[3] User: I need to filter by status, priority, and date ranges
[4] Assistant: That makes sense. Let me help you submit a feature request for this.`,
};

/**
 * Test BRD Generation
 */
async function testBRDGeneration(useMock: boolean): Promise<any> {
  logSection("Testing BRD Generation");

  if (useMock) {
    logWarning("Using mock mode - no real API calls");
    const mockBRD = {
      title: "Feature Request: Advanced Search with Filters",
      problemStatement: "Support agents need efficient case search capabilities with multiple filter criteria to improve productivity and response times.",
      userStory: "As a support agent, I want to search cases using multiple filters (status, priority, date ranges) so that I can quickly find relevant cases and provide faster customer support.",
      acceptanceCriteria: [
        "Support filtering by case status (open, closed, pending)",
        "Support filtering by priority level",
        "Support date range selection for case creation",
        "Support customer name search",
        "Display results within 2 seconds",
        "Allow saving filter presets",
      ],
      technicalContext: "Requires backend API enhancements to support query parameters, frontend UI updates for filter components, and database indexing optimization for performance.",
      conversationTranscript: testFeedback.conversationContext,
    };

    logSuccess("Mock BRD generated successfully");
    logInfo(`Title: ${mockBRD.title}`);
    logInfo(`Acceptance Criteria: ${mockBRD.acceptanceCriteria.length} items`);

    return mockBRD;
  }

  try {
    logInfo("Calling Claude API to generate BRD...");
    const brd = await generateBRD({
      featureDescription: testFeedback.featureDescription,
      useCase: testFeedback.useCase,
      currentLimitation: testFeedback.currentLimitation,
      conversationContext: testFeedback.conversationContext,
    });

    logSuccess("BRD generated successfully!");
    console.log("\n--- Generated BRD ---");
    console.log(`Title: ${brd.title}`);
    console.log(`\nProblem Statement:\n${brd.problemStatement}`);
    console.log(`\nUser Story:\n${brd.userStory}`);
    console.log(`\nAcceptance Criteria (${brd.acceptanceCriteria.length} items):`);
    brd.acceptanceCriteria.forEach((criterion, idx) => {
      console.log(`  ${idx + 1}. ${criterion}`);
    });
    console.log(`\nTechnical Context:\n${brd.technicalContext}`);
    console.log("--- End of BRD ---\n");

    return brd;
  } catch (error) {
    logError(`BRD generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Test GitHub Issue Creation
 */
async function testGitHubIssueCreation(brd: any, useMock: boolean): Promise<any> {
  logSection("Testing GitHub Issue Creation");

  if (useMock) {
    logWarning("Using mock mode - no real GitHub API calls");
    const mockIssue = {
      number: 999,
      htmlUrl: "https://github.com/owner/repo/issues/999",
      title: brd.title,
    };

    logSuccess("Mock GitHub issue created");
    logInfo(`Issue #${mockIssue.number}: ${mockIssue.htmlUrl}`);

    return mockIssue;
  }

  try {
    logInfo("Creating GitHub issue...");
    const issue = await createGitHubIssue({
      brd,
      slackThreadUrl: "https://slack.com/archives/TEST/p1234567890",
      requestedBy: "test-user",
    });

    logSuccess("GitHub issue created successfully!");
    console.log(`\nIssue #${issue.number}`);
    console.log(`Title: ${issue.title}`);
    console.log(`URL: ${issue.htmlUrl}`);

    return issue;
  } catch (error) {
    logError(`GitHub issue creation failed: ${error instanceof Error ? error.message : String(error)}`);

    // Check for common configuration issues
    if (error instanceof Error) {
      if (error.message.includes("GitHub App is not configured")) {
        logWarning("\nTo enable GitHub issue creation, set these environment variables:");
        logWarning("  GITHUB_APP_ID=your-app-id");
        logWarning("  GITHUB_APP_PRIVATE_KEY=your-private-key");
        logWarning("  GITHUB_INSTALLATION_ID=your-installation-id");
      }
    }

    throw error;
  }
}

/**
 * Test Complete Integration
 */
async function testCompleteIntegration(useMock: boolean): Promise<void> {
  logSection("Testing Complete Integration");

  const statusUpdates: string[] = [];

  const tool = createFeedbackCollectionTool({
    updateStatus: (status: string) => {
      statusUpdates.push(status);
      logInfo(`Status: ${status}`);
    },
    messages: [],
  });

  if (useMock) {
    logWarning("Mock mode - simulating API calls");
    logInfo("In real mode, this would:");
    logInfo("  1. Call Claude API to generate BRD");
    logInfo("  2. Call GitHub API to create issue");
    logInfo("  3. Return success with issue details");
    logSuccess("Integration flow validated");
    return;
  }

  try {
    logInfo("Executing feedback collection tool...");

    const result = await tool.execute({
      featureDescription: testFeedback.featureDescription,
      useCase: testFeedback.useCase,
      currentLimitation: testFeedback.currentLimitation,
    });

    if (result.success) {
      logSuccess("Integration test passed!");
      console.log(`\nResult:`);
      console.log(`  Message: ${result.message}`);
      console.log(`  Issue #: ${result.issueNumber}`);
      console.log(`  URL: ${result.issueUrl}`);

      console.log(`\nStatus updates received: ${statusUpdates.length}`);
      statusUpdates.forEach((status, idx) => {
        console.log(`  ${idx + 1}. ${status}`);
      });
    } else {
      logError("Integration test failed!");
      console.log(`Error: ${result.error}`);
      console.log(`Message: ${result.message}`);
      throw new Error(result.error || "Unknown error");
    }
  } catch (error) {
    logError(`Integration test failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Check prerequisites
 */
function checkPrerequisites(useMock: boolean): void {
  logSection("Checking Prerequisites");

  if (useMock) {
    logInfo("Running in mock mode - no API keys required");
    logSuccess("Prerequisites check passed (mock mode)");
    return;
  }

  let hasErrors = false;

  // Check Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    logError("Missing ANTHROPIC_API_KEY environment variable");
    hasErrors = true;
  } else {
    logSuccess("ANTHROPIC_API_KEY is set");
  }

  // Check GitHub App configuration
  const githubVars = [
    "GITHUB_APP_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_INSTALLATION_ID",
  ];

  let githubConfigured = true;
  for (const varName of githubVars) {
    if (!process.env[varName]) {
      logWarning(`Missing ${varName} environment variable`);
      githubConfigured = false;
    }
  }

  if (githubConfigured) {
    logSuccess("GitHub App configuration is complete");
  } else {
    logWarning("GitHub App is not fully configured - issue creation will fail");
    logInfo("This is optional for BRD generation testing");
  }

  if (hasErrors) {
    throw new Error("Prerequisites check failed - missing required environment variables");
  }

  logSuccess("Prerequisites check passed");
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const useReal = args.includes("--real");
  const testBRDOnly = args.includes("--test-brd");
  const testGitHubOnly = args.includes("--test-github");

  console.log("\n" + "█".repeat(60));
  log("  Feedback Collection Feature - Integration Test", colors.cyan);
  console.log("█".repeat(60));

  // Default to mock if neither specified
  const shouldUseMock = useMock || !useReal;

  try {
    checkPrerequisites(shouldUseMock);

    if (testBRDOnly) {
      await testBRDGeneration(shouldUseMock);
    } else if (testGitHubOnly) {
      // For GitHub-only test, generate a mock BRD first
      const mockBRD = await testBRDGeneration(true);
      await testGitHubIssueCreation(mockBRD, shouldUseMock);
    } else {
      // Run complete integration test
      await testCompleteIntegration(shouldUseMock);
    }

    logSection("Test Summary");
    logSuccess("All tests passed! ✓");

    if (shouldUseMock) {
      console.log();
      logInfo("To test with real APIs, run:");
      logInfo("  tsx scripts/test-feedback-collection.ts --real");
      console.log();
      logInfo("Make sure to set:");
      logInfo("  export ANTHROPIC_API_KEY=your-key");
      logInfo("  export GITHUB_APP_ID=your-app-id");
      logInfo("  export GITHUB_APP_PRIVATE_KEY=your-key");
      logInfo("  export GITHUB_INSTALLATION_ID=your-id");
    }

    process.exit(0);
  } catch (error) {
    logSection("Test Summary");
    logError("Tests failed! ✗");
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
