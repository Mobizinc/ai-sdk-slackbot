/**
 * Test Helpers and Utilities
 * Shared functions for end-to-end testing
 */

import type { CaseContext, CaseMessage } from "../../lib/context-manager";
import type { QualityAssessment } from "../../lib/services/case-quality-analyzer";
import type { KBArticle } from "../../lib/services/kb-generator";
import type { ServiceNowCaseResult } from "../../lib/tools/servicenow";

// ANSI color codes for terminal output
export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

/**
 * Print formatted test section header
 */
export function printSection(title: string): void {
  console.log(`\n${colors.cyan}${colors.bright}${"=".repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${"=".repeat(60)}${colors.reset}\n`);
}

/**
 * Print test step
 */
export function printStep(stepNumber: number, description: string): void {
  console.log(`${colors.blue}[Step ${stepNumber}]${colors.reset} ${description}`);
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

/**
 * Print error message
 */
export function printError(message: string, error?: Error): void {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
  if (error) {
    console.error(`${colors.red}${error.stack || error.message}${colors.reset}`);
  }
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

/**
 * Assert condition is true
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    printError(`Assertion failed: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  printSuccess(message);
}

/**
 * Assert value equals expected
 */
export function assertEqual<T>(actual: T, expected: T, description: string): void {
  if (actual !== expected) {
    printError(`${description}\n  Expected: ${expected}\n  Actual: ${actual}`);
    throw new Error(`${description}: expected ${expected}, got ${actual}`);
  }
  printSuccess(`${description}: ${actual}`);
}

/**
 * Assert value is defined (not null/undefined)
 */
export function assertDefined<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    printError(`${description} is ${value}`);
    throw new Error(`${description} should be defined, got ${value}`);
  }
  printSuccess(`${description} is defined`);
  return value;
}

/**
 * Assert array contains element
 */
export function assertContains<T>(array: T[], element: T, description: string): void {
  if (!array.includes(element)) {
    printError(`${description}\n  Array: ${JSON.stringify(array)}\n  Missing: ${element}`);
    throw new Error(`${description}: array does not contain ${element}`);
  }
  printSuccess(`${description}: contains ${element}`);
}

/**
 * Assert array has minimum length
 */
export function assertMinLength<T>(array: T[], minLength: number, description: string): void {
  if (array.length < minLength) {
    printError(`${description}\n  Expected: >= ${minLength}\n  Actual: ${array.length}`);
    throw new Error(`${description}: expected length >= ${minLength}, got ${array.length}`);
  }
  printSuccess(`${description}: length = ${array.length} (>= ${minLength})`);
}

/**
 * Assert object has property
 */
export function assertHasProperty(obj: any, property: string, description: string): void {
  if (!(property in obj)) {
    printError(`${description}\n  Object: ${JSON.stringify(obj)}\n  Missing property: ${property}`);
    throw new Error(`${description}: object missing property ${property}`);
  }
  printSuccess(`${description}: has property '${property}'`);
}

/**
 * Create sample case context for testing
 */
export function createSampleContext(
  caseNumber: string,
  messages: string[],
  options: {
    isResolved?: boolean;
    channelName?: string;
    threadTs?: string;
  } = {}
): CaseContext {
  const now = new Date();
  const threadTs = options.threadTs || now.getTime().toString();

  const caseMessages: CaseMessage[] = messages.map((text, idx) => ({
    user: `U${idx.toString().padStart(6, "0")}`,
    text,
    timestamp: (now.getTime() + idx * 1000).toString(),
    thread_ts: threadTs,
  }));

  return {
    caseNumber,
    threadTs,
    channelId: "C12345TEST",
    channelName: options.channelName || "test-channel",
    messages: caseMessages,
    detectedAt: now,
    lastUpdated: now,
    isResolved: options.isResolved || false,
    resolvedAt: options.isResolved ? now : undefined,
  };
}

/**
 * Create sample ServiceNow case for testing
 */
export function createSampleServiceNowCase(caseNumber: string): ServiceNowCaseResult {
  return {
    sys_id: `sys_${caseNumber}`,
    number: {
      display_value: caseNumber,
      value: caseNumber,
    },
    short_description: `Test case ${caseNumber}`,
    description: `This is a test case for ${caseNumber} with detailed description`,
    priority: "3 - Moderate",
    state: "Resolved",
    category: "Network",
    subcategory: "VPN",
    opened_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    assignment_group: "Network Team",
    assigned_to: "John Doe",
    opened_by: "Jane Smith",
    caller_id: "Test User",
    submitted_by: "Jane Smith",
    url: `https://test.service-now.com/nav_to.do?uri=case.do?sys_id=sys_${caseNumber}`,
  };
}

/**
 * Create sample quality assessment for testing
 */
export function createSampleQualityAssessment(
  score: number,
  decision?: "high_quality" | "needs_input" | "insufficient"
): QualityAssessment {
  const actualDecision = decision || (
    score >= 80 ? "high_quality" :
    score >= 50 ? "needs_input" :
    "insufficient"
  );

  return {
    decision: actualDecision,
    score,
    problemClarity: score >= 70 ? "clear" : score >= 40 ? "vague" : "missing",
    solutionClarity: score >= 70 ? "clear" : score >= 40 ? "vague" : "missing",
    stepsDocumented: score >= 60,
    rootCauseIdentified: score >= 70,
    missingInfo: actualDecision === "high_quality" ? [] : ["Resolution steps", "Root cause"],
    reasoning: `Score ${score} indicates ${actualDecision} quality`,
  };
}

/**
 * Create sample KB article for testing
 */
export function createSampleKBArticle(caseNumber: string): KBArticle {
  return {
    title: `How to resolve ${caseNumber} issue`,
    problem: "Users experiencing connectivity issues with VPN",
    environment: "Windows 10, Cisco AnyConnect VPN Client v4.10",
    solution: `1. Restart the VPN client\n2. Clear cached credentials\n3. Reconnect to VPN\n4. Verify connectivity`,
    rootCause: "Expired authentication token causing connection failure",
    relatedCases: [caseNumber],
    tags: ["VPN", "Network", "Authentication", "Windows"],
    conversationSummary: "Full conversation would be here...",
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for condition to be true (with timeout)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    const result = await condition();
    if (result) {
      return;
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
    }

    await sleep(checkIntervalMs);
  }
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
  description: string
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;

  printInfo(`${description} took ${durationMs}ms`);

  return { result, durationMs };
}

/**
 * Load environment variables for testing
 */
export function loadTestEnv(): void {
  // Check required env vars
  const required = [
    "OPENAI_API_KEY",
    "SERVICENOW_URL",
    "SERVICENOW_USERNAME",
    "SERVICENOW_PASSWORD",
  ];

  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    printWarning(`Missing environment variables: ${missing.join(", ")}`);
    printInfo("Some tests may be skipped");
  }
}

/**
 * Check if Azure Search is configured
 */
export function isAzureSearchConfigured(): boolean {
  return !!(
    process.env.AZURE_SEARCH_ENDPOINT &&
    process.env.AZURE_SEARCH_KEY &&
    process.env.AZURE_SEARCH_INDEX_NAME &&
    process.env.OPENAI_API_KEY
  );
}

/**
 * Check if ServiceNow is configured
 */
export function isServiceNowConfigured(): boolean {
  return !!(
    (process.env.SERVICENOW_URL || process.env.SERVICENOW_INSTANCE_URL) &&
    (
      (process.env.SERVICENOW_USERNAME && process.env.SERVICENOW_PASSWORD) ||
      process.env.SERVICENOW_API_TOKEN
    )
  );
}

/**
 * Check if AI Gateway is configured
 */
export function isAIGatewayConfigured(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY;
}

/**
 * Pretty print object as JSON
 */
export function printJSON(obj: any, label?: string): void {
  if (label) {
    printInfo(label);
  }
  console.log(JSON.stringify(obj, null, 2));
}

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + "...";
}

/**
 * Test result summary
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Create test summary object
 */
export function createTestSummary(): TestSummary {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };
}

/**
 * Print test summary
 */
export function printTestSummary(summary: TestSummary): void {
  printSection("TEST SUMMARY");

  console.log(`Total:   ${summary.total}`);
  console.log(`${colors.green}Passed:  ${summary.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:  ${summary.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped: ${summary.skipped}${colors.reset}`);

  if (summary.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    summary.errors.forEach((error, idx) => {
      console.log(`  ${idx + 1}. ${error}`);
    });
  }

  console.log();

  if (summary.failed === 0 && summary.passed > 0) {
    printSuccess("All tests passed! 🎉");
  } else if (summary.failed > 0) {
    printError(`${summary.failed} test(s) failed`);
    process.exit(1);
  }
}

/**
 * Run test with error handling and summary tracking
 */
export async function runTest(
  name: string,
  fn: () => Promise<void>,
  summary: TestSummary
): Promise<void> {
  summary.total++;

  printSection(`TEST: ${name}`);

  try {
    await fn();
    summary.passed++;
    printSuccess(`Test passed: ${name}`);
  } catch (error) {
    summary.failed++;
    summary.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    printError(`Test failed: ${name}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Skip test with reason
 */
export function skipTest(name: string, reason: string, summary: TestSummary): void {
  summary.total++;
  summary.skipped++;
  printWarning(`Test skipped: ${name} (${reason})`);
}
