import type { CaseContext } from "../../../context-manager";
import { getKBStateMachine, KBState } from "../../../services/kb-state-machine";
import { generateResolutionSummary } from "../../../services/case-resolution-summary";
import { config } from "../../../config";
import type { TriggerKBWorkflowDeps } from "./deps";
import type { ServiceNowCaseResult, ServiceNowCaseJournalEntry } from "../../../tools/servicenow";

export async function fetchCaseData(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
) {
  // Use getCaseWithJournal which correctly resolves case number → sys_id → journal
  // The sys_journal_field table's element_id column stores sys_id, not case number
  const result = await deps.caseData.getCaseWithJournal(caseNumber);
  return {
    caseDetails: result?.case ?? null,
    journalEntries: result?.journal ?? [],
  };
}

export async function postResolutionSummary(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
  channelId: string,
  threadTs: string,
  context: CaseContext,
  caseDetails: ServiceNowCaseResult | null | undefined,
  journalEntries: ServiceNowCaseJournalEntry[] | undefined,
): Promise<void> {
  // kbPostResolutionSummary feature not yet in main config registry
  // Disabled for now until config is migrated
  if (false) {
    return;
  }
  return; // Feature disabled

  const summary = await generateResolutionSummary({
    caseNumber,
    context,
    caseDetails,
    journalEntries,
  });

  if (!summary) {
    return;
  }

  try {
    await deps.slackMessaging.postToThread({
      channel: channelId,
      threadTs,
      text: summary as string, // Already checked for null above
      unfurlLinks: false,
    });
  } catch (error) {
    console.error(
      `[KB Generation] Failed to post resolution summary for ${caseNumber}:`,
      error,
    );
  }
}

export function initializeWorkflow(caseNumber: string, threadTs: string, channelId: string) {
  const stateMachine = getKBStateMachine();
  stateMachine.initialize(caseNumber, threadTs, channelId);
  stateMachine.setState(caseNumber, threadTs, KBState.ASSESSING);
}
