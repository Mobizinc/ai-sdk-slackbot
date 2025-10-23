/**
 * Passive Message Handler - Main Orchestrator
 *
 * Thin orchestrator that coordinates detectors and actions for passive message handling.
 * This module delegates all work to specialized modules, keeping the orchestration
 * logic lean relative to the legacy implementation. (Current size ~145 LOC; still
 * targeted for future trimming once downstream modules are stabilized.)
 */

import type { GenericMessageEvent } from '../slack-event-types';
import { extractCaseNumbers } from './detectors/case-number-extractor';
import { getTriggerKBWorkflowAction } from './actions/trigger-kb-workflow';
import { shouldSkipMessage, processCaseDetection, processExistingThread } from './handler-utils';

/**
 * Main entry point for passive message handling
 * Matches original handlePassiveMessage signature
 */
export async function handlePassiveMessage(
  event: GenericMessageEvent,
  botUserId: string
): Promise<void> {
  // Skip bot's own messages, empty messages, and @mentions
  if (shouldSkipMessage(event, botUserId)) {
    return;
  }

  // Process case numbers in the message
  const caseNumbers = extractCaseNumbers(event.text || '');
  for (const caseNumber of caseNumbers) {
    await processCaseDetection(event, caseNumber);
  }

  // Process existing threads for resolution and user responses
  if (event.thread_ts) {
    await processExistingThread(event);
  }
}

/**
 * Trigger KB workflow for resolved case
 * Matches original notifyResolution signature
 */
export async function notifyResolution(
  caseNumber: string,
  channelId: string,
  threadTs: string
): Promise<void> {
  const kbAction = getTriggerKBWorkflowAction();
  await kbAction.triggerWorkflow(caseNumber, channelId, threadTs);
}

/**
 * Clean up timed-out KB gathering sessions
 * Matches original cleanupTimedOutGathering signature
 */
export async function cleanupTimedOutGathering(): Promise<void> {
  const kbAction = getTriggerKBWorkflowAction();
  await kbAction.cleanupTimedOut();
}


