import { getKBStateMachine, KBState } from "../../../services/kb-state-machine";
import { ErrorHandler } from "../../../utils/error-handler";
import type { TriggerKBWorkflowDeps } from "./deps";

export async function handleWorkflowError(
  deps: TriggerKBWorkflowDeps,
  params: {
    caseNumber: string;
    channelId: string;
    threadTs: string;
    error: unknown;
  },
) {
  const { caseNumber, channelId, threadTs, error } = params;
  console.error(`[KB Generation] ERROR for ${caseNumber}:`, error);

  const errorResult = ErrorHandler.handle(error, {
    operation: "KB generation",
    caseNumber,
  });

  try {
    await deps.slackMessaging.postToThread({
      channel: channelId,
      threadTs,
      text: ErrorHandler.getSimpleMessage(errorResult),
      blocks: ErrorHandler.formatForSlack(errorResult),
      unfurlLinks: false,
    });
  } catch (slackError) {
    console.error("[KB Generation] Failed to post error notification:", slackError);
  }

  const stateMachine = getKBStateMachine();
  stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);
  stateMachine.remove(caseNumber, threadTs);
}
