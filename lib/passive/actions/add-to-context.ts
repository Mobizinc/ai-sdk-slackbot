/**
 * Add to Context Action
 *
 * Updates the context manager with message information.
 * Handles adding messages to case contexts and updating thread tracking.
 *
 * This module encapsulates all context manager updates for the passive flow.
 */

import type { GenericMessageEvent } from '../../slack-event-types';
import type { ContextManager } from '../../context-manager';

export interface AddToContextDeps {
  contextManager: ContextManager;
}

export interface MessageInfo {
  user: string;
  text: string;
  timestamp: string;
  thread_ts?: string;
}

/**
 * Add to Context Action
 * Manages all context updates for passive message flow
 */
export class AddToContextAction {
  constructor(private deps: AddToContextDeps) {}

  /**
   * Add a message to case context
   * Creates context if it doesn't exist
   */
  addMessageToCase(
    caseNumber: string,
    channelId: string,
    threadTs: string,
    messageInfo: MessageInfo
  ): void {
    this.deps.contextManager.addMessage(
      caseNumber,
      channelId,
      threadTs,
      messageInfo
    );

    console.log(
      `[Context Update] Added message to case ${caseNumber} in thread ${threadTs}`
    );
  }

  /**
   * Add message from Slack event
   * Convenience method that extracts message info from event
   */
  addMessageFromEvent(
    caseNumber: string,
    event: GenericMessageEvent
  ): void {
    const threadTs = event.thread_ts || event.ts;
    const channelId = event.channel;

    const messageInfo: MessageInfo = {
      user: event.user || 'unknown',
      text: event.text || '',
      timestamp: event.ts,
      thread_ts: event.thread_ts,
    };

    this.addMessageToCase(caseNumber, channelId, threadTs, messageInfo);
  }

  /**
   * Update channel info in context
   * Adds channel metadata for better context
   */
  updateChannelInfo(
    caseNumber: string,
    threadTs: string,
    channelInfo: {
      channelName?: string;
      channelTopic?: string;
      channelPurpose?: string;
    }
  ): void {
    const context = this.deps.contextManager.getContextSync(caseNumber, threadTs);

    if (!context) {
      console.warn(
        `[Context Update] No context found for ${caseNumber} in thread ${threadTs}`
      );
      return;
    }

    if (channelInfo.channelName) {
      context.channelName = channelInfo.channelName;
    }

    // Store additional info using type assertion (preserving original pattern)
    const extendedContext = context as any;
    if (channelInfo.channelTopic) {
      extendedContext.channelTopic = channelInfo.channelTopic;
    }
    if (channelInfo.channelPurpose) {
      extendedContext.channelPurpose = channelInfo.channelPurpose;
    }

    console.log(
      `[Context Update] Updated channel info for case ${caseNumber}`
    );
  }

  /**
   * Mark assistance as posted
   * Prevents duplicate assistance messages
   */
  markAssistancePosted(caseNumber: string, threadTs: string): void {
    const context = this.deps.contextManager.getContextSync(caseNumber, threadTs);

    if (context) {
      context.hasPostedAssistance = true;
      console.log(
        `[Context Update] Marked assistance posted for case ${caseNumber}`
      );
    }
  }

  /**
   * Mark resolution as notified
   * Prevents duplicate KB workflow triggers
   */
  markResolutionNotified(caseNumber: string, threadTs: string): void {
    const context = this.deps.contextManager.getContextSync(caseNumber, threadTs);

    if (context) {
      context._notified = true;
      console.log(
        `[Context Update] Marked resolution notified for case ${caseNumber}`
      );
    }
  }

  /**
   * Reset resolution flag
   * Used when ServiceNow doesn't confirm resolution
   */
  resetResolutionFlag(caseNumber: string, threadTs: string): void {
    const context = this.deps.contextManager.getContextSync(caseNumber, threadTs);

    if (context) {
      context.isResolved = false;
      console.log(
        `[Context Update] Reset resolution flag for case ${caseNumber}`
      );
    }
  }

  /**
   * Get context for a case
   * Wrapper for context manager access
   */
  getContext(caseNumber: string, threadTs: string) {
    return this.deps.contextManager.getContextSync(caseNumber, threadTs);
  }

  /**
   * Find all contexts for a thread
   * Used when processing messages in existing threads
   */
  findContextsForThread(channelId: string, threadTs: string) {
    // Access private field (preserving original pattern)
    const allContexts = Array.from(
      (this.deps.contextManager as any).contexts.values()
    );

    return allContexts.filter(
      (ctx) => ctx.threadTs === threadTs && ctx.channelId === channelId
    );
  }
}

// Singleton instance
let action: AddToContextAction | null = null;

/**
 * Get the add-to-context action singleton
 */
export function getAddToContextAction(): AddToContextAction {
  if (!action) {
    // Import lazily to avoid circular dependencies
    const { getContextManager } = require('../../context-manager');
    action = new AddToContextAction({
      contextManager: getContextManager(),
    });
  }
  return action;
}

/**
 * Reset the action instance (for testing)
 */
export function __resetAddToContextAction(): void {
  action = null;
}

/**
 * Set a custom action instance (for testing)
 */
export function __setAddToContextAction(instance: AddToContextAction): void {
  action = instance;
}