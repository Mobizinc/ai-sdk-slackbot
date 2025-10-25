/**
 * Test if SCS0049613 would trigger escalation (if integrated)
 * This simulates what SHOULD have happened with project-scope detection
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';
import { getEscalationService } from '../lib/services/escalation-service';
import type { CaseClassificationResult } from '../lib/schemas/servicenow-webhook';

async function testEscalation() {
  console.log('🔬 ESCALATION TEST: SCS0049613');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const caseNumber = 'SCS0049613';

  // Step 1: Fetch case
  console.log('📋 Step 1: Fetching Case Details');
  console.log('───────────────────────────────────────────────────────────────────');

  const caseData = await serviceNowClient.getCase(caseNumber);

  if (!caseData) {
    console.error(`❌ Case ${caseNumber} not found`);
    process.exit(1);
  }

  console.log(`✅ Case fetched: ${caseData.short_description}`);
  console.log('');

  // Step 2: Simulate classification with business intelligence
  console.log('🤖 Step 2: Simulating Classification with Business Intelligence');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  // Based on the case description, this would likely be detected as project scope
  const mockClassification: CaseClassificationResult = {
    category: 'Email',
    subcategory: 'Email Account Setup',
    confidence_score: 0.85,
    suggested_assignment_group: 'IT Infrastructure',
    business_intelligence: {
      // This is a multi-employee email setup - project scope
      project_scope_detected: true,
      executive_visibility: false,
      compliance_impact: false,
      financial_impact: false,
      reasoning: 'Email setup for all Express ER employees (bulk account creation) indicates project-level work requiring coordination and planning, not standard BAU support.',
    },
    token_usage_input: 1500,
    token_usage_output: 300,
    total_tokens: 1800,
    llm_provider: 'openai',
    model_used: 'gpt-4',
  };

  console.log('Classification Result (Simulated):');
  console.log(`  Category:          ${mockClassification.category}`);
  console.log(`  Subcategory:       ${mockClassification.subcategory}`);
  console.log(`  Confidence:        ${(mockClassification.confidence_score * 100).toFixed(1)}%`);
  console.log('');

  console.log('Business Intelligence:');
  console.log(`  Project Scope:     ${mockClassification.business_intelligence?.project_scope_detected ? '✅ YES (TRIGGER)' : '❌ No'}`);
  console.log(`  Executive:         ${mockClassification.business_intelligence?.executive_visibility ? '✅ Yes' : '❌ No'}`);
  console.log(`  Compliance:        ${mockClassification.business_intelligence?.compliance_impact ? '✅ Yes' : '❌ No'}`);
  console.log(`  Financial:         ${mockClassification.business_intelligence?.financial_impact ? '✅ Yes' : '❌ No'}`);
  console.log('');

  if (mockClassification.business_intelligence?.reasoning) {
    console.log('Reasoning:');
    console.log(`  ${mockClassification.business_intelligence.reasoning}`);
    console.log('');
  }

  // Step 3: Test escalation decision
  console.log('🚨 Step 3: Testing Escalation Decision Logic');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const escalationService = getEscalationService();
  const decision = escalationService.shouldEscalate(mockClassification);

  console.log('Escalation Decision:');
  console.log(`  Should Escalate:   ${decision.shouldEscalate ? '✅ YES' : '❌ NO'}`);
  console.log(`  Reason:            ${decision.reason || 'none'}`);
  console.log(`  BI Score:          ${decision.biScore}/100`);
  console.log('');

  console.log('Trigger Flags:');
  Object.entries(decision.triggerFlags).forEach(([key, value]) => {
    console.log(`  ${key}: ${value ? '✅' : '❌'}`);
  });
  console.log('');

  // Step 4: Summary
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log(`Case Number:           ${caseNumber}`);
  console.log(`Short Description:     ${caseData.short_description}`);
  console.log('');

  console.log('Expected Classification:');
  console.log('  • Project scope detected (bulk email account creation)');
  console.log('  • Should trigger escalation to Slack');
  console.log('');

  console.log('Actual Result:');
  if (decision.shouldEscalate) {
    console.log('  ✅ WOULD ESCALATE if escalation service was integrated');
    console.log(`  ✅ Reason: ${decision.reason}`);
    console.log(`  ✅ BI Score: ${decision.biScore}/100`);
    console.log('');
    console.log('Expected Slack Notification:');
    console.log('  • Channel: Determined by escalation-channels.ts rules');
    console.log('  • Message: AI-generated with project scoping questions');
    console.log('  • Buttons: [Create Project] [Acknowledge as BAU] [Reassign] [View in ServiceNow]');
    console.log('');
  } else {
    console.log('  ❌ Would NOT escalate');
    console.log('  ❌ This is unexpected - should escalate for project scope');
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🔍 ROOT CAUSE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('WHY SLACK NOTIFICATION DIDN\'T HAPPEN:');
  console.log('');
  console.log('❌ ESCALATION SERVICE IS NOT INTEGRATED INTO CASE TRIAGE');
  console.log('');
  console.log('Evidence:');
  console.log('  • lib/services/case-triage.ts has steps 0-15');
  console.log('  • No Step 16 for escalation (despite docs claiming it exists)');
  console.log('  • No import of getEscalationService in case-triage.ts');
  console.log('  • No call to escalationService.checkAndEscalate()');
  console.log('');

  console.log('What Exists:');
  console.log('  ✅ Escalation service is fully built (lib/services/escalation-service.ts)');
  console.log('  ✅ Database table exists (case_escalations)');
  console.log('  ✅ Message builder exists (lib/services/escalation-message-builder.ts)');
  console.log('  ✅ Channel routing exists (lib/config/escalation-channels.ts)');
  console.log('  ✅ Configuration exists (ESCALATION_ENABLED in config.ts)');
  console.log('  ✅ Documentation exists (ESCALATION_SUMMARY.md)');
  console.log('');

  console.log('What\'s Missing:');
  console.log('  ❌ Integration into case-triage.ts (Step 16)');
  console.log('  ❌ Import statement for getEscalationService');
  console.log('  ❌ Call to checkAndEscalate() after classification');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💡 RESOLUTION');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('To fix, add Step 16 to case-triage.ts:');
  console.log('');
  console.log('1. Import the escalation service:');
  console.log('   import { getEscalationService } from "./escalation-service";');
  console.log('');
  console.log('2. Add Step 16 after catalog redirect (around line 768):');
  console.log('   // Step 16: Check for escalation (non-BAU cases)');
  console.log('   if (config.escalationEnabled) {');
  console.log('     try {');
  console.log('       const escalationService = getEscalationService();');
  console.log('       const escalated = await escalationService.checkAndEscalate({');
  console.log('         caseNumber: webhook.case_number,');
  console.log('         caseSysId: webhook.sys_id,');
  console.log('         classification: classificationResult,');
  console.log('         caseData: {');
  console.log('           short_description: webhook.short_description,');
  console.log('           description: webhook.description,');
  console.log('           priority: webhook.priority,');
  console.log('           urgency: webhook.urgency,');
  console.log('           state: webhook.state,');
  console.log('         },');
  console.log('         assignedTo: webhook.assigned_to,');
  console.log('         assignmentGroup: webhook.assignment_group,');
  console.log('         companyName: webhook.account_id,');
  console.log('       });');
  console.log('');
  console.log('       if (escalated) {');
  console.log('         console.log(`[Case Triage] Case escalated to Slack`);');
  console.log('       }');
  console.log('     } catch (error) {');
  console.log('       console.error("[Case Triage] Escalation failed:", error);');
  console.log('       // Non-blocking - continue processing');
  console.log('     }');
  console.log('   }');
  console.log('');

  console.log('3. Set environment variables (if not already set):');
  console.log('   ESCALATION_ENABLED=true');
  console.log('   ESCALATION_BI_SCORE_THRESHOLD=20');
  console.log('   ESCALATION_DEFAULT_CHANNEL=case-escalations');
  console.log('   ESCALATION_NOTIFY_ASSIGNED_ENGINEER=true');
  console.log('   ESCALATION_USE_LLM_MESSAGES=true');
  console.log('');

  console.log('4. Create Slack channels:');
  console.log('   • #case-escalations (default)');
  console.log('   • #altus-escalations (client-specific, recommended)');
  console.log('');

  console.log('5. Configure Slack app interactivity:');
  console.log('   • URL: https://your-domain.vercel.app/api/interactivity');
  console.log('   • Enable Interactive Components in Slack app settings');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
}

testEscalation().catch(console.error);
