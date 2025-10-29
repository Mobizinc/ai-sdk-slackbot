/**
 * ServiceNow Context Helper
 *
 * Extracts user and channel context from various sources (Slack events, messages, etc.)
 * to ensure deterministic feature flag behavior across the application.
 *
 * This fixes the user context determinism issue: instead of random hashing,
 * we consistently pass the same userId for the same user, ensuring stable
 * OLD/NEW path routing during gradual rollout.
 */

import type { SlackEvent, AppMentionEvent, GenericMessageEvent, ReactionAddedEvent } from "../slack-event-types";

/**
 * ServiceNow operation context for feature flag routing
 */
export interface ServiceNowContext {
  userId?: string;
  channelId?: string;
}

/**
 * Extract ServiceNow context from Slack event
 *
 * This ensures consistent userId/channelId is available for feature flag decisions.
 * The same user will always get the same path (NEW or OLD) during percentage rollout.
 */
export function getServiceNowContextFromEvent(event: SlackEvent): ServiceNowContext {
  const context: ServiceNowContext = {};

  switch (event.type) {
    case "app_mention":
      context.userId = event.user;
      context.channelId = event.channel;
      break;

    case "message":
      context.userId = event.user;
      context.channelId = event.channel;
      break;

    case "reaction_added":
      context.userId = event.user;
      context.channelId = event.item.channel;
      break;

    case "assistant_thread_started":
      context.channelId = event.assistant_thread.channel_id;
      // Note: assistant_thread events may not have user field
      break;

    case "assistant_thread_context_changed":
      context.channelId = event.assistant_thread.channel_id;
      break;

    default:
      // Unknown event type - return empty context
      break;
  }

  return context;
}

/**
 * Extract ServiceNow context from message-like object
 *
 * Many handlers work with partial message objects that may not be full Slack events.
 * This helper extracts what's available.
 */
export function getServiceNowContextFromMessage(message: {
  user?: string;
  channel?: string;
  channel_id?: string;
  user_id?: string;
}): ServiceNowContext {
  return {
    userId: message.user ?? message.user_id,
    channelId: message.channel ?? message.channel_id,
  };
}

/**
 * Extract ServiceNow context from any object with user/channel properties
 *
 * Generic fallback for various data structures across the codebase.
 */
export function getServiceNowContextFromAny(obj: any): ServiceNowContext {
  if (!obj || typeof obj !== "object") {
    return {};
  }

  return {
    userId: obj.user ?? obj.userId ?? obj.user_id,
    channelId: obj.channel ?? obj.channelId ?? obj.channel_id,
  };
}

/**
 * Create ServiceNow context with explicit values
 *
 * For use cases where userId/channelId are already known.
 */
export function createServiceNowContext(
  userId?: string,
  channelId?: string,
): ServiceNowContext {
  return { userId, channelId };
}

/**
 * Create system context (for background jobs, cron, etc.)
 *
 * When operations run without user context (scheduled jobs, webhooks),
 * use a stable system identifier to ensure consistent feature flag behavior.
 *
 * @param identifier - Unique identifier for the system operation (e.g., "cron-case-queue", "webhook-servicenow")
 */
export function createSystemContext(identifier: string): ServiceNowContext {
  return {
    userId: `system:${identifier}`,
    channelId: undefined,
  };
}

/**
 * Merge multiple contexts, preferring non-empty values
 *
 * Useful when context might come from multiple sources.
 */
export function mergeServiceNowContexts(...contexts: ServiceNowContext[]): ServiceNowContext {
  const merged: ServiceNowContext = {};

  for (const context of contexts) {
    if (context.userId && !merged.userId) {
      merged.userId = context.userId;
    }
    if (context.channelId && !merged.channelId) {
      merged.channelId = context.channelId;
    }
  }

  return merged;
}

/**
 * Check if context has required information for deterministic routing
 */
export function hasValidContext(context: ServiceNowContext): boolean {
  return Boolean(context.userId || context.channelId);
}
