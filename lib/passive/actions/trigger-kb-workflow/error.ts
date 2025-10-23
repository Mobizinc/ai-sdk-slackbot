
import { getKBStateMachine, KBState } from "../../../../services/kb-state-machine";
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

  try {
    await deps.slackMessaging.postToThread({
      channel: channelId,
      threadTs,
      text: `✅ It looks like *${caseNumber}* has been resolved!

_Error during KB generation: ${
        error instanceof Error ? error.message : "Unknown error"
      }_`,
      unfurlLinks: false,
    });
  } catch (slackError) {
    console.error("[KB Generation] Failed to post error notification:", slackError);
  }

  const stateMachine = getKBStateMachine();
  stateMachine.setState(caseNumber, threadTs, KBState.ABANDONED);
  stateMachine.remove(caseNumber, threadTs);
}
