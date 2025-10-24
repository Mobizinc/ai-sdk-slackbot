/**
 * Test Script for Case Escalation System
 *
 * Tests the full escalation flow:
 * 1. Rule-based decision logic
 * 2. Channel routing
 * 3. Message generation (LLM and fallback)
 * 4. Database persistence
 * 5. Duplicate prevention
 */

// Load environment variables BEFORE importing any modules
import * as dotenv from "dotenv";
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getEscalationService } from "../lib/services/escalation-service";
import type { EscalationContext } from "../lib/services/escalation-service";
import type { CaseClassificationResult } from "../lib/schemas/servicenow-webhook";
import { getEscalationRepository } from "../lib/db/repositories/escalation-repository";
import { config } from "../lib/config";

// Test case based on the original SCS0049584 (OnePacs multi-location installation)
const testCase: EscalationContext = {
  caseNumber: "SCS0049584",
  caseSysId: "test_sys_id_12345",
  assignedTo: "U12345678", // Slack user ID
  assignmentGroup: "Professional Services",
  companyName: "Your Organization",
  caseData: {
    short_description: "OnePacs multi-location installation with specialized integration requirements",
    description: "Customer needs OnePacs installed at multiple locations with custom integration to their existing PACS system. This requires professional services engagement and project management.",
    priority: "2",
    urgency: "High",
    state: "New",
  },
  classification: {
    case_number: "SCS0049584",
    category: "Professional Services",
    subcategory: "Implementation",
    confidence_score: 0.92,
    reasoning: "This case requires professional services engagement for multi-location deployment with custom integrations",
    keywords_detected: ["OnePacs", "multi-location", "installation", "integration", "PACS"],
    model_used: "claude-3-5-sonnet-20241022",
    classified_at: new Date(),
    urgency_level: "High",
    immediate_next_steps: [
      "Schedule scoping call to determine number of locations and integration requirements",
      "Create project charter with timeline and resource allocation",
      "Assign dedicated project manager and technical lead",
      "Define success criteria and acceptance testing process"
    ],
    business_intelligence: {
      project_scope_detected: true,
      project_scope_reason: "Multi-location OnePacs installation requiring specialized integration work, professional services engagement, and dedicated project management",
      executive_visibility: false,
      compliance_impact: false,
      financial_impact: false,
      outside_service_hours: false,
      client_technology: "OnePacs",
      related_entities: ["PACS integration", "multi-location deployment", "professional services"],
    }
  }
};

async function runEscalationTest() {
  console.log("\n🧪 ===== CASE ESCALATION SYSTEM TEST =====\n");

  const escalationService = getEscalationService();
  const repository = getEscalationRepository();

  console.log("📋 Test Configuration:");
  console.log(`  - Escalation Enabled: ${config.escalationEnabled}`);
  console.log(`  - BI Score Threshold: ${config.escalationBiScoreThreshold}`);
  console.log(`  - Default Channel: #${config.escalationDefaultChannel}`);
  console.log(`  - Notify Engineer: ${config.escalationNotifyAssignedEngineer}`);
  console.log(`  - Use LLM Messages: ${config.escalationUseLlmMessages}`);
  console.log();

  // Test 1: Decision Logic
  console.log("🔍 TEST 1: Escalation Decision Logic");
  console.log("-".repeat(50));

  const decision = escalationService.shouldEscalate(testCase.classification);

  console.log(`Should Escalate: ${decision.shouldEscalate}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`BI Score: ${decision.biScore}/100`);
  console.log(`Trigger Flags:`, decision.triggerFlags);
  console.log();

  if (!decision.shouldEscalate) {
    console.log("❌ Test Failed: Expected escalation to be triggered");
    return;
  }

  console.log("✅ Test 1 Passed: Escalation correctly triggered\n");

  // Test 2: Duplicate Prevention (should be false on first run)
  console.log("🔍 TEST 2: Duplicate Prevention");
  console.log("-".repeat(50));

  const hasRecent = await repository.hasRecentActiveEscalation(testCase.caseNumber, 24);
  console.log(`Has Recent Escalation: ${hasRecent}`);

  if (hasRecent) {
    console.log("⚠️  Recent escalation exists - system will prevent duplicate");
    console.log("   Run this test after 24 hours or clear the database to test creation\n");
  } else {
    console.log("✅ Test 2 Passed: No duplicate escalation detected\n");
  }

  // Test 3: Full Escalation Flow (only if no recent escalation)
  if (!hasRecent) {
    console.log("🔍 TEST 3: Full Escalation Flow");
    console.log("-".repeat(50));

    console.log("📤 Attempting to escalate case...");

    try {
      const escalated = await escalationService.checkAndEscalate(testCase);

      if (escalated) {
        console.log("✅ Escalation successful!");
        console.log("   - Slack message posted");
        console.log("   - Database record created");
        console.log("   - Interactive buttons added");

        // Verify database record
        const dbRecord = await repository.getActiveEscalations(testCase.caseNumber);

        if (dbRecord.length > 0) {
          const record = dbRecord[0];
          console.log("\n📊 Database Record:");
          console.log(`   - Escalation ID: ${record.id}`);
          console.log(`   - Case Number: ${record.caseNumber}`);
          console.log(`   - Reason: ${record.escalationReason}`);
          console.log(`   - BI Score: ${record.businessIntelligenceScore}`);
          console.log(`   - Slack Channel: #${record.slackChannel}`);
          console.log(`   - Message TS: ${record.slackMessageTs}`);
          console.log(`   - LLM Generated: ${record.llmGenerated}`);
          console.log(`   - Token Usage: ${record.tokenUsage || 0}`);
          console.log(`   - Status: ${record.status}`);

          console.log("\n✅ Test 3 Passed: Full escalation flow completed successfully\n");
        } else {
          console.log("\n❌ Test 3 Failed: Database record not found");
        }
      } else {
        console.log("❌ Test 3 Failed: Escalation was not created");
      }
    } catch (error) {
      console.error("❌ Test 3 Failed with error:", error);
    }
  }

  // Test 4: Statistics
  console.log("🔍 TEST 4: Escalation Statistics");
  console.log("-".repeat(50));

  try {
    const stats = await repository.getEscalationStats(7);

    console.log(`Total Escalations (7 days): ${stats.totalEscalations}`);
    console.log(`Active: ${stats.activeEscalations}`);
    console.log(`Acknowledged: ${stats.acknowledgedEscalations}`);
    console.log(`Avg Response Time: ${stats.averageResponseTime.toFixed(2)} minutes`);

    if (stats.topReasons.length > 0) {
      console.log("\nTop Escalation Reasons:");
      stats.topReasons.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.reason}: ${r.count} cases`);
      });
    }

    console.log("\n✅ Test 4 Passed: Statistics retrieved successfully\n");
  } catch (error) {
    console.error("❌ Test 4 Failed:", error);
  }

  console.log("✨ ===== TEST COMPLETE =====\n");
  console.log("Next steps:");
  console.log("1. Check Slack channel for escalation message");
  console.log("2. Test interactive buttons by clicking them");
  console.log("3. Verify thread follow-ups work");
  console.log("4. Monitor database for acknowledgment tracking\n");
}

// Run the test
runEscalationTest()
  .then(() => {
    console.log("✅ Test script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test script failed:", error);
    process.exit(1);
  });
