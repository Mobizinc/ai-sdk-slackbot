
import { getKBStateMachine, KBState } from "../../../../services/kb-state-machine";
import { formatTimeoutMessage } from "../../../../services/interactive-kb-assistant";
import { config } from "../../../../config";
import type { TriggerKBWorkflowDeps } from "./deps";

export async function cleanupTimedOut(deps: TriggerKBWorkflowDeps): Promise<void> {
  const stateMachine = getKBStateMachine();
  const gatheringContexts = stateMachine.getContextsInState(KBState.GATHERING);

  const now = new Date();
  const timeoutMs = config.kbGatheringTimeoutHours * 60 * 60 * 1000;

  for (const ctx of gatheringContexts) {
    const elapsedMs = now.getTime() - ctx.lastUpdated.getTime();

    if (elapsedMs <= timeoutMs) {
      continue;
    }

    console.log(
      `[KB Generation] Timing out gathering for ${ctx.caseNumber} (${Math.round(
        elapsedMs / 3600000,
      )}h elapsed)`,
    );

    const message = formatTimeoutMessage(ctx.caseNumber);

    try {
      await deps.slackMessaging.postToThread({
        channel: ctx.channelId,
        threadTs: ctx.threadTs,
        text: message,
        unfurlLinks: false,
      });
    } catch (error) {
      console.error(
        `[KB Generation] Failed to post timeout message for ${ctx.caseNumber}:`,
        error,
      );
    }

    stateMachine.setState(ctx.caseNumber, ctx.threadTs, KBState.ABANDONED);
    stateMachine.remove(ctx.caseNumber, ctx.threadTs);
  }
}
