import type { CaseContext } from "../../../context-manager";
import { getKBStateMachine, KBState } from "../../../services/kb-state-machine";
import { generateResolutionSummary } from "../../../services/case-resolution-summary";
import { config } from "../../../config";
import type { TriggerKBWorkflowDeps } from "./deps";

export async function fetchCaseData(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
) {
  const caseDetails = await deps.caseData.getCase(caseNumber);
  const journalEntries = await deps.caseData.getCaseJournal(caseNumber);
  return { caseDetails, journalEntries };
}

export async function postResolutionSummary(
  deps: TriggerKBWorkflowDeps,
  caseNumber: string,
  channelId: string,
  threadTs: string,
  context: CaseContext,
  caseDetails: unknown,
  journalEntries: unknown,
): Promise<void> {
  if (!config.kbPostResolutionSummary) {
    return;
  }

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
      text: summary,
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
