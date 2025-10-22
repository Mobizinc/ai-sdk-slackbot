/**
 * Backfill Script: Create ServiceNow Interaction Records
 *
 * This script finds all call_interactions that don't have a ServiceNow interaction record
 * and creates interaction records for them in ServiceNow's interaction table.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.local pnpm tsx -r dotenv/config scripts/backfill-interactions-to-servicenow.ts
 */

import { serviceNowClient } from '../lib/tools/servicenow';
import {
  getCallInteractionsNeedingServiceNowSync,
  updateCallInteractionServiceNowIds,
} from '../lib/db/repositories/call-interaction-repository';

async function backfillInteractions() {
  console.log('🔄 Starting ServiceNow interaction backfill...\n');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow is not configured. Please set SERVICENOW_* environment variables.');
    process.exit(1);
  }

  // Get all interactions that need ServiceNow sync
  const interactions = await getCallInteractionsNeedingServiceNowSync(1000);

  if (!interactions.length) {
    console.log('✅ No interactions need backfilling. All interactions already have ServiceNow records.');
    process.exit(0);
  }

  console.log(`📊 Found ${interactions.length} interactions to backfill\n`);

  let successCount = 0;
  let failCount = 0;
  const failures: Array<{ sessionId: string; error: string }> = [];

  for (const interaction of interactions) {
    try {
      // Get the case details to find the sys_id
      const caseRecord = await serviceNowClient.getCase(interaction.caseNumber!);

      if (!caseRecord) {
        throw new Error(`Case ${interaction.caseNumber} not found in ServiceNow`);
      }

      console.log(`  Processing ${interaction.sessionId} for case ${interaction.caseNumber}...`);

      // Create interaction record in ServiceNow
      const result = await serviceNowClient.createPhoneInteraction({
        caseSysId: caseRecord.sys_id,
        caseNumber: interaction.caseNumber!,
        channel: 'phone',
        direction: interaction.direction || 'inbound',
        phoneNumber: interaction.ani || '',
        sessionId: interaction.sessionId,
        startTime: interaction.startTime || new Date(),
        endTime: interaction.endTime || new Date(),
        durationSeconds: interaction.durationSeconds ?? undefined,
        agentName: interaction.agentName ?? undefined,
        queueName: interaction.queueName ?? undefined,
      });

      // Update local record with ServiceNow IDs
      await updateCallInteractionServiceNowIds(
        interaction.sessionId,
        result.interaction_sys_id,
        result.interaction_number
      );

      successCount++;
      console.log(`  ✅ Created interaction ${result.interaction_number} (${result.interaction_sys_id})`);
    } catch (error) {
      failCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push({
        sessionId: interaction.sessionId,
        error: errorMessage,
      });
      console.error(`  ❌ Failed to create interaction for ${interaction.sessionId}: ${errorMessage}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Backfill Summary');
  console.log('='.repeat(60));
  console.log(`Total interactions processed: ${interactions.length}`);
  console.log(`✅ Successfully created:      ${successCount}`);
  console.log(`❌ Failed:                    ${failCount}`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\n❌ Failed Interactions:');
    failures.forEach(({ sessionId, error }) => {
      console.log(`  - ${sessionId}: ${error}`);
    });
  }

  if (failCount > 0) {
    console.log('\n⚠️  Some interactions failed to backfill. Review the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All interactions successfully backfilled!');
    process.exit(0);
  }
}

backfillInteractions().catch((error) => {
  console.error('💥 Fatal error during backfill:', error);
  process.exit(1);
});
