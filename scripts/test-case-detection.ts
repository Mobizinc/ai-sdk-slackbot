#!/usr/bin/env node
/**
 * Test script for case number detection
 */

import { getContextManager } from "../lib/context-manager";

const contextManager = getContextManager();

const testMessages = [
  "Hey, can you check case SCS0048402?",
  "Working on SCS0035645 and SCS0044100",
  "Issue resolved for case SCS0044923. Everything is working now!",
  "No case numbers here, just regular conversation",
  "SCS0048402: VPN timeout error - need help",
  "Multiple cases: SCS0001234, SCS0005678, SCS0009999",
  "Invalid format: SCS123 or SC0048402 should not match",
];

console.log("🧪 Testing Case Number Detection\n");
console.log("Pattern: /\\b[A-Z]{3}\\d{7}\\b/g");
console.log("Expected format: 3 uppercase letters + 7 digits (e.g., SCS0048402)\n");
console.log("─".repeat(70));

testMessages.forEach((message, idx) => {
  const caseNumbers = contextManager.extractCaseNumbers(message);

  console.log(`\n${idx + 1}. Message: "${message}"`);
  if (caseNumbers.length > 0) {
    console.log(`   ✅ Detected: ${caseNumbers.join(", ")}`);
  } else {
    console.log(`   ❌ No cases found`);
  }
});

console.log("\n" + "─".repeat(70));
console.log("\n✅ Test complete!");
