import type { GenericMessageEvent } from "../slack-event-types";
import type { CaseContext } from "../context-manager";
import { getAddToContextAction } from "./actions/add-to-context";
import { getPostAssistanceAction } from "./actions/post-assistance";
import { getTriggerKBWorkflowAction } from "./actions/trigger-kb-workflow";
import { getResolutionDetector } from "./detectors/resolution-detector";
import { getKBStateMachine } from "../services/kb-state-machine";
import { getChannelInfo } from "../services/channel-info";

/**
 * Case Detection Debouncer
 * Prevents duplicate assistance posts when the same case is mentioned repeatedly in rapid succession.
 */
class CaseDetectionDebouncer {
  private readonly DEBOUNCE_MS = 5000;
  private readonly pending = new Map<string, number>();

  shouldProcess(caseNumber: string, threadTs: string): boolean {
    const key = `${caseNumber}:${threadTs}`;
    const now = Date.now();
    const lastProcessed = this.pending.get(key);

    if (lastProcessed && now - lastProcessed < this.DEBOUNCE_MS) {
      return false;
    }

    this.pending.set(key, now);
    setTimeout(() => this.pending.delete(key), this.DEBOUNCE_MS);
    return true;
  }
}

const caseDetectionDebouncer = new CaseDetectionDebouncer();

export function shouldSkipMessage(event: GenericMessageEvent, botUserId: string): boolean {
  return !!(
    event.bot_id ||
    event.user === botUserId ||
    !event.text?.trim() ||
    event.text.includes(`<@${botUserId}>`)
  );
}

export async function processCaseDetection(
  event: GenericMessageEvent,
  caseNumber: string,
): Promise<void> {
  const contextAction = getAddToContextAction();
  const postAction = getPostAssistanceAction();
  const threadTs = event.thread_ts || event.ts;

  if (!caseDetectionDebouncer.shouldProcess(caseNumber, threadTs)) {
    console.log(
      `[Passive Handler] Skipping duplicate assistance for ${caseNumber} in thread ${threadTs} (debounced)`,
    );
    return;
  }

  contextAction.addMessageFromEvent(caseNumber, event);
  const context = contextAction.getContext(caseNumber, threadTs);

  if (!context || context.hasPostedAssistance) {
    return;
  }

  try {
    const channelInfo = await getChannelInfo(event.channel);
    if (channelInfo) {
      contextAction.updateChannelInfo(caseNumber, threadTs, channelInfo);
    }
  } catch (error) {
    console.warn("[Passive Handler] Could not fetch channel info:", error);
  }

  const posted = await postAction.execute({ event, caseNumber, context });
  if (posted) {
    contextAction.markAssistancePosted(caseNumber, threadTs);
  }
}

export async function processExistingThread(event: GenericMessageEvent): Promise<void> {
  const contextAction = getAddToContextAction();
  const detector = getResolutionDetector();
  const kbAction = getTriggerKBWorkflowAction();
  const stateMachine = getKBStateMachine();

  const contexts = contextAction.findContextsForThread(event.channel, event.thread_ts!);

  for (const context of contexts) {
    contextAction.addMessageFromEvent(context.caseNumber, event);

    if (stateMachine.isWaitingForUser(context.caseNumber, context.threadTs)) {
      console.log(`[Passive Handler] User response detected for ${context.caseNumber}`);
      await kbAction.handleUserResponse(context, event.text || "");
      continue;
    }

    const resolution = await detector.shouldTriggerKBWorkflow(context);
    if (resolution.isResolved) {
      console.log(
        `[Passive Handler] Triggering KB for ${context.caseNumber}: ${resolution.reason}`,
      );
      await kbAction.triggerWorkflow(context.caseNumber, context.channelId, context.threadTs);
      contextAction.markResolutionNotified(context.caseNumber, context.threadTs);
    } else if (context.isResolved && !resolution.isValidatedByServiceNow) {
      contextAction.resetResolutionFlag(context.caseNumber, context.threadTs);
    }
  }
}
