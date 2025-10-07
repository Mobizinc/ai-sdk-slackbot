/**
 * Test KB State Machine Persistence
 * Validates that KB generation state can be saved to and loaded from Neon database
 */

import * as dotenv from "dotenv";
import { getKBStateMachine, KBState } from "../lib/services/kb-state-machine";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function testKBStatePersistence() {
  console.log("🧪 Testing KB State Machine Persistence with Neon Database\n");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not configured. Cannot test persistence.");
    process.exit(1);
  }

  const stateMachine = getKBStateMachine();

  // Test Case 1: Initialize KB generation state
  console.log("📝 Test 1: Initializing KB generation state...");
  const testCaseNumber = `TST${Date.now().toString().slice(-7)}`; // Unique case number
  const testThreadTs = `${Date.now() / 1000}`;
  const testChannelId = "C12345TEST";

  stateMachine.initialize(testCaseNumber, testThreadTs, testChannelId);
  console.log(`✅ Initialized KB state for ${testCaseNumber}`);

  // Verify initial state
  const state = stateMachine.getState(testCaseNumber, testThreadTs);
  if (state !== KBState.ASSESSING) {
    console.error(`❌ Initial state should be ASSESSING, got: ${state}`);
    process.exit(1);
  }
  console.log(`✅ Initial state is ${state}`);

  // Give the async save a moment to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test Case 2: Progress through workflow
  console.log("\n📝 Test 2: Progressing through KB workflow...");

  // Store assessment
  stateMachine.storeAssessment(testCaseNumber, testThreadTs, 65, ["root cause", "environment details"]);
  stateMachine.setState(testCaseNumber, testThreadTs, KBState.GATHERING);
  console.log("✅ Moved to GATHERING state with assessment");

  // Increment attempt count (simulating asking for more information)
  stateMachine.incrementAttempt(testCaseNumber, testThreadTs);
  console.log("✅ Incremented attempt count");

  // Add user response
  stateMachine.addUserResponse(testCaseNumber, testThreadTs, "The root cause was a misconfigured VPN setting");
  console.log("✅ Added user response");

  // Move to generating
  stateMachine.setState(testCaseNumber, testThreadTs, KBState.GENERATING);
  console.log("✅ Moved to GENERATING state");

  // Wait for all async saves to complete (fire-and-forget operations)
  // Need longer wait since multiple saves happen in parallel
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test Case 3: Simulate restart by creating new state machine
  console.log("\n📝 Test 3: Simulating bot restart (loading from database)...");

  // Import fresh to simulate module reload
  const { KBStateMachine } = await import("../lib/services/kb-state-machine");
  const freshStateMachine = new KBStateMachine();

  // Load from database
  await freshStateMachine.loadFromDatabase();

  const loadedContext = freshStateMachine.getContext(testCaseNumber, testThreadTs);

  if (!loadedContext) {
    console.error("❌ KB state not loaded from database after 'restart'!");
    console.error(`Looking for: ${testCaseNumber} / ${testThreadTs}`);
    process.exit(1);
  }

  console.log(`✅ KB state loaded from database`);
  console.log(`   Case: ${loadedContext.caseNumber}, State: ${loadedContext.state}`);

  // Test Case 4: Verify data integrity
  console.log("\n📝 Test 4: Verifying data integrity...");

  if (loadedContext.caseNumber !== testCaseNumber) {
    console.error(`❌ Case number mismatch: ${loadedContext.caseNumber} !== ${testCaseNumber}`);
    process.exit(1);
  }

  if (loadedContext.threadTs !== testThreadTs) {
    console.error(`❌ Thread TS mismatch: ${loadedContext.threadTs} !== ${testThreadTs}`);
    process.exit(1);
  }

  if (loadedContext.channelId !== testChannelId) {
    console.error(`❌ Channel ID mismatch: ${loadedContext.channelId} !== ${testChannelId}`);
    process.exit(1);
  }

  if (loadedContext.state !== KBState.GENERATING) {
    console.error(`❌ State mismatch: ${loadedContext.state} !== ${KBState.GENERATING}`);
    process.exit(1);
  }

  if (loadedContext.assessmentScore !== 65) {
    console.error(`❌ Assessment score mismatch: ${loadedContext.assessmentScore} !== 65`);
    process.exit(1);
  }

  if (!loadedContext.missingInfo || loadedContext.missingInfo.length !== 2) {
    console.error(`❌ Missing info not preserved correctly`);
    process.exit(1);
  }

  if (loadedContext.userResponses.length !== 1) {
    console.error(`❌ User responses count mismatch: ${loadedContext.userResponses.length} !== 1`);
    process.exit(1);
  }

  if (loadedContext.attemptCount !== 1) {
    console.error(`❌ Attempt count mismatch: ${loadedContext.attemptCount} !== 1`);
    process.exit(1);
  }

  console.log("✅ All data integrity checks passed!");

  // Test Case 5: Test workflow completion
  console.log("\n📝 Test 5: Testing workflow completion...");

  freshStateMachine.setState(testCaseNumber, testThreadTs, KBState.PENDING_APPROVAL);
  console.log("✅ Moved to PENDING_APPROVAL");

  freshStateMachine.setState(testCaseNumber, testThreadTs, KBState.APPROVED);
  console.log("✅ Moved to APPROVED (workflow complete)");

  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify that completed states (approved/rejected/abandoned) are not loaded on restart
  // This is correct behavior - we only need active workflows
  const { KBStateMachine: FinalStateMachine } = await import("../lib/services/kb-state-machine");
  const finalStateMachine = new FinalStateMachine();
  await finalStateMachine.loadFromDatabase();

  const finalContext = finalStateMachine.getContext(testCaseNumber, testThreadTs);
  if (finalContext !== undefined) {
    console.error(`❌ Completed (approved) state should not be loaded on restart, but found: ${finalContext?.state}`);
    process.exit(1);
  }

  console.log("✅ Completed states correctly excluded from restart loading!");

  // Test Case 6: Test timeout detection
  console.log("\n📝 Test 6: Testing timeout detection...");
  const oldCaseNumber = `TST${(Date.now() + 1).toString().slice(-7)}`; // Another unique case
  const oldThreadTs = `${(Date.now() - 25 * 60 * 60 * 1000) / 1000}`; // 25 hours ago
  const oldChannelId = "C12345TEST";

  stateMachine.initialize(oldCaseNumber, oldThreadTs, oldChannelId);
  stateMachine.setState(oldCaseNumber, oldThreadTs, KBState.GATHERING);

  const isTimedOut = stateMachine.hasTimedOut(oldCaseNumber, oldThreadTs);
  if (!isTimedOut) {
    console.error("❌ Timeout not detected for 25-hour-old context");
    process.exit(1);
  }

  console.log("✅ Timeout detection works correctly!");

  console.log("\n✅ All KB state persistence tests passed!");
  console.log("\n📊 Summary:");
  console.log("  ✅ KB state saved to database");
  console.log("  ✅ KB state loaded from database after restart");
  console.log("  ✅ Data integrity maintained");
  console.log("  ✅ Assessment scores persisted");
  console.log("  ✅ User responses persisted");
  console.log("  ✅ Missing info arrays persisted");
  console.log("  ✅ State transitions tracked");
  console.log("  ✅ Timeout detection works");

  process.exit(0);
}

testKBStatePersistence().catch(error => {
  console.error("\n❌ Test failed with error:", error);
  process.exit(1);
});
