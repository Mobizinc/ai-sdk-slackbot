/**
 * Slack Messaging Service
 *
 * Centralized service for all Slack message operations.
 * Provides a clean API for posting messages, updating messages, and managing threads.
 *
 * Benefits:
 * - Single place for all Slack API interactions
 * - Consistent error handling
 * - Easier to mock in tests
 * - Simplified retry logic
 */

import { WebClient } from '@slack/web-api';
import type { CoreMessage } from '../instrumented-ai';

export interface PostMessageOptions {
  channel: string;
  text: string;
  threadTs?: string;
  unfurlLinks?: boolean;
}

export interface UpdateMessageOptions {
  channel: string;
  ts: string;
  text: string;
}

export interface MessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
}

/**
 * Slack Messaging Service
 * Wraps Slack WebClient with consistent error handling and logging
 */
export class SlackMessagingService {
  constructor(private client: WebClient) {}

  /**
   * Post a message to a Slack channel or thread
   */
  async postMessage(options: PostMessageOptions): Promise<MessageResult> {
    try {
      const result = await this.client.chat.postMessage({
        channel: options.channel,
        text: options.text,
        thread_ts: options.threadTs,
        unfurl_links: options.unfurlLinks ?? false,
      });

      return {
        ok: result.ok ?? false,
        ts: result.ts,
        channel: result.channel,
      };
    } catch (error) {
      console.error('[Slack Messaging] Failed to post message:', error);
      throw error;
    }
  }

  /**
   * Post a message to a thread (convenience method)
   */
  async postToThread(params: {
    channel: string;
    threadTs: string;
    text: string;
    unfurlLinks?: boolean;
  }): Promise<MessageResult> {
    return this.postMessage({
      channel: params.channel,
      text: params.text,
      threadTs: params.threadTs,
      unfurlLinks: params.unfurlLinks ?? false,
    });
  }

  /**
   * Update an existing message
   */
  async updateMessage(options: UpdateMessageOptions): Promise<void> {
    try {
      await this.client.chat.update({
        channel: options.channel,
        ts: options.ts,
        text: options.text,
      });
    } catch (error) {
      console.error('[Slack Messaging] Failed to update message:', error);
      throw error;
    }
  }

  /**
   * Get conversation replies (thread messages)
   */
  async getThreadReplies(params: {
    channel: string;
    threadTs: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      const result = await this.client.conversations.replies({
        channel: params.channel,
        ts: params.threadTs,
        limit: params.limit ?? 50,
      });

      return result.messages ?? [];
    } catch (error) {
      console.error('[Slack Messaging] Failed to get thread replies:', error);
      throw error;
    }
  }

  /**
   * Get thread messages formatted as CoreMessage array
   * (Replicates getThread from slack-utils.ts)
   */
  async getThread(
    channelId: string,
    threadTs: string,
    botUserId: string
  ): Promise<CoreMessage[]> {
    const messages = await this.getThreadReplies({
      channel: channelId,
      threadTs: threadTs,
      limit: 50,
    });

    if (!messages || messages.length === 0) {
      throw new Error('No messages found in thread');
    }

    const result = messages
      .map((message) => {
        const isBot = !!message.bot_id;
        if (!message.text) return null;

        // For app mentions, remove the mention prefix
        // For IM messages, keep the full text
        let content = message.text;
        if (!isBot && content.includes(`<@${botUserId}>`)) {
          content = content.replace(`<@${botUserId}> `, '');
        }

        return {
          role: isBot ? 'assistant' : 'user',
          content: content,
        } as CoreMessage;
      })
      .filter((msg): msg is CoreMessage => msg !== null);

    return result;
  }

  /**
   * Set assistant thread status (for Slack Assistant API)
   * Automatically handles unsupported channels/scopes
   */
  createStatusUpdater(channel: string, threadTs: string) {
    let assistantStatusSupported = true;

    return async (status: string) => {
      if (!assistantStatusSupported) return;

      try {
        await this.client.assistant.threads.setStatus({
          channel_id: channel,
          thread_ts: threadTs,
          status: status,
        });
      } catch (error: unknown) {
        const slackError =
          typeof error === 'object' && error !== null ? (error as any) : null;
        const apiError = slackError?.data?.error ?? slackError?.message;
        const apiErrorString = String(apiError ?? '');

        if (
          apiErrorString === 'missing_scope' ||
          apiErrorString === 'method_not_supported_for_channel_type' ||
          apiErrorString.includes('missing_scope') ||
          apiErrorString.includes('method_not_supported_for_channel_type')
        ) {
          assistantStatusSupported = false;
          console.warn(
            '[Slack Messaging] Disabling assistant thread status updates:',
            apiErrorString
          );
          return;
        }

        throw error;
      }
    };
  }

  /**
   * Get bot's user ID
   */
  async getBotUserId(): Promise<string> {
    try {
      const { user_id: botUserId } = await this.client.auth.test();

      if (!botUserId) {
        throw new Error('botUserId is undefined');
      }

      return botUserId;
    } catch (error) {
      console.error('[Slack Messaging] Failed to get bot user ID:', error);
      throw error;
    }
  }

  /**
   * Format markdown text to Slack mrkdwn
   * Handles common conversions
   */
  formatMarkdown(text: string): string {
    // Note: Slack uses mrkdwn, which is similar but not identical to markdown
    // For now, pass through as-is. Can add conversions if needed.
    return text;
  }
}

// Singleton instance
let slackMessagingService: SlackMessagingService | null = null;

/**
 * Get the Slack messaging service singleton
 */
export function getSlackMessagingService(): SlackMessagingService {
  if (!slackMessagingService) {
    // Import client lazily to avoid circular dependency
    const { client } = require('../slack-utils');
    slackMessagingService = new SlackMessagingService(client);
  }
  return slackMessagingService;
}

/**
 * Reset the service instance (for testing)
 */
export function __resetSlackMessagingService(): void {
  slackMessagingService = null;
}

/**
 * Set a custom service instance (for testing)
 */
export function __setSlackMessagingService(service: SlackMessagingService): void {
  slackMessagingService = service;
}
