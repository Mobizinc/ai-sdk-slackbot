
import type { CaseContext } from "../../../../context-manager";
import { getKBStateMachine, KBState } from "../../../../services/kb-state-machine";
import {
  generateGatheringQuestions,
  formatGatheringMessage,
  formatFollowUpMessage,
  formatNoteRequestMessage,
} from "../../../../services/interactive-kb-assistant";
import type { TriggerKBWorkflowDeps } from "./deps";

export async function startInteractiveGathering(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
    assessment: any;
    context: CaseContext;
  },
) {
  const { caseNumber, channelId, threadTs, assessment, context } = params;
  const stateMachine = getKBStateMachine();

  stateMachine.setState(caseNumber, threadTs, KBState.GATHERING);
  stateMachine.incrementAttempt(caseNumber, threadTs);

  const gathering = await generateGatheringQuestions(assessment, context, caseNumber);
  const message = formatGatheringMessage(caseNumber, gathering);

  await deps.slackMessaging.postToThread({
    channel: channelId,
    threadTs,
    text: message,
    unfurlLinks: false,
  });
}

export async function askFollowUpQuestions(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
    assessment: any;
    context: CaseContext;
  },
) {
  const { caseNumber, channelId, threadTs, assessment, context } = params;
  const stateMachine = getKBStateMachine();
  stateMachine.incrementAttempt(caseNumber, threadTs);

  await generateGatheringQuestions(assessment, context, caseNumber);
  const message = formatFollowUpMessage(caseNumber, assessment.missingInfo);

  await deps.slackMessaging.postToThread({
    channel: channelId,
    threadTs,
    text: message,
    unfurlLinks: false,
  });
}

export async function requestCaseNotes(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
    assessment: any;
  },
) {
  const { caseNumber, channelId, threadTs, assessment } = params;
  const message = formatNoteRequestMessage(caseNumber, assessment.missingInfo);

  await deps.slackMessaging.postToThread({
    channel: channelId,
    threadTs,
    text: message,
    unfurlLinks: false,
  });
}
