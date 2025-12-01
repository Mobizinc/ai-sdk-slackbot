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

  reset(): void {
    this.pending.clear();
  }
}

const caseDetectionDebouncer = new CaseDetectionDebouncer();
const ASSISTANCE_COOLDOWN_MS = 12 * 60 * 1000; // 12 minutes default
const assistanceCooldowns = new Map<string, number>(); // key: channel:thread

/**
 * Detect if a message is delegating work to another user
 * These patterns indicate the sender is asking someone else to handle the case,
 * so the bot should not intervene with assistance.
 */
export function isDelegationMessage(event: GenericMessageEvent): boolean {
  const text = event.text || '';
  const textLower = text.toLowerCase();
  
  // Check if message mentions any user (delegation indicator)
  // Note: Bot mentions are already filtered out in shouldSkipMessage()
  const hasMention = /<@[UW][A-Z0-9]+>/i.test(text);
  
  // Delegation phrases
  const delegationPhrases = [
    'please take a look',
    'can you take a look',
    'could you take a look',
    'can you look',
    'could you look',
    'can you review',
    'please review',
    'please check',
    'can you check',
    'take a look at',
    'could you review',
    'could you check',
    'please handle',
    'can you handle',
    'assigning',
    'assigned to',
  ];
  
  const hasDelegationPhrase = delegationPhrases.some(phrase => textLower.includes(phrase));
  
  // If message mentions someone AND has delegation language, it's delegation
  if (hasMention && hasDelegationPhrase) {
    return true;
  }
  
  return false;
}

export function shouldSkipMessage(event: GenericMessageEvent, botUserId: string): boolean {
  return !!(
    event.bot_id ||
    event.user === botUserId ||
    !event.text?.trim() ||
    event.text.includes(`<@${botUserId}>`)
  );
}

function isLowValueMessage(text: string): boolean {
  const lower = text.toLowerCase();
  const politeOpeners = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
  const fyiPhrases = ["fyi", "heads up", "for your information"];
  const thankPhrases = ["thanks", "thank you", "thx", "ty"];
  const statusPhrases = ["please update", "update these cases", "need update", "any updates", "status update"];

  const hasQuestion = text.includes("?");
  const isShort = text.trim().split(/\s+/).length <= 4;

  const matchesPolite = politeOpeners.some((p) => lower.startsWith(p));
  const matchesFyi = fyiPhrases.some((p) => lower.includes(p));
  const matchesThanks = thankPhrases.some((p) => lower.includes(p));
  const matchesStatusOnly = statusPhrases.some((p) => lower.includes(p));

  // Treat as low-value if it's only greetings/thanks/fyi/update ask without a question
  if (hasQuestion) return false;
  if (matchesThanks || matchesFyi) return true;
  if (matchesPolite && isShort) return true;
  if (matchesStatusOnly && !hasQuestion) return true;

  return false;
}

function isWithinCooldown(channelId: string, threadTs: string): boolean {
  const key = `${channelId}:${threadTs}`;
  const last = assistanceCooldowns.get(key);
  return !!(last && Date.now() - last < ASSISTANCE_COOLDOWN_MS);
}

function markCooldown(channelId: string, threadTs: string): void {
  const key = `${channelId}:${threadTs}`;
  assistanceCooldowns.set(key, Date.now());
}

export async function processCaseDetection(
  event: GenericMessageEvent,
  caseNumber: string,
  options?: { allowAssistance?: boolean },
): Promise<boolean> {
  const allowAssistance = options?.allowAssistance !== false;
  const contextAction = getAddToContextAction();
  const postAction = getPostAssistanceAction();
  const threadTs = event.thread_ts || event.ts;
  const threadKey = `${event.channel}:${threadTs}`;

  if (!caseDetectionDebouncer.shouldProcess(caseNumber, threadTs)) {
    console.log(
      `[Passive Handler] Skipping duplicate assistance for ${caseNumber} in thread ${threadTs} (debounced)`,
    );
    return false;
  }

  contextAction.addMessageFromEvent(caseNumber, event);
  const context = contextAction.getContext(caseNumber, threadTs);

  if (!context || context.hasPostedAssistance) {
    return false;
  }

  try {
    const channelInfo = await getChannelInfo(event.channel);
    if (channelInfo) {
      contextAction.updateChannelInfo(caseNumber, threadTs, channelInfo);
    }
  } catch (error) {
    console.warn("[Passive Handler] Could not fetch channel info:", error);
  }

  let posted = false;
  if (allowAssistance) {
    if (isWithinCooldown(event.channel, threadTs)) {
      console.log(
        `[Passive Handler] Skipping assistance for ${caseNumber} in thread ${threadTs} (cooldown)`,
      );
      return false;
    }

    const messageText = event.text || "";
    if (isLowValueMessage(messageText)) {
      console.log(
        `[Passive Handler] Skipping assistance for ${caseNumber} in thread ${threadTs} (low-value message)`,
      );
      return false;
    }

    posted = await postAction.execute({ event, caseNumber, context });
    if (posted) {
      contextAction.markAssistancePosted(caseNumber, threadTs);
      markCooldown(event.channel, threadTs);
    }
  }

  return posted;
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

// Test helper
export function __resetCaseDetectionDebouncer(): void {
  caseDetectionDebouncer.reset();
}

// Test helper
export function __resetAssistanceCooldowns(): void {
  assistanceCooldowns.clear();
}
