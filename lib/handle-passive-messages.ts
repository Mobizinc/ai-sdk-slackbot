import type { GenericMessageEvent } from "./slack-event-types";
import { handlePassiveMessage as handlePassiveMessageRefactored } from "./passive";

/**
 * Backward-compatible entry point for passive message handling.
 * The refactored passive pipeline is now the only implementation.
 */
export async function handlePassiveMessage(
  event: GenericMessageEvent,
  botUserId: string,
): Promise<void> {
  return handlePassiveMessageRefactored(event, botUserId);
}

export { cleanupTimedOutGathering, extractCaseNumbers, notifyResolution } from "./passive";
