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
import type { ChatMessage } from '../agent/types';

export interface PostMessageOptions {
  channel: string;
  text: string;
  threadTs?: string;
  unfurlLinks?: boolean;
  blocks?: any[]; // Slack Block Kit blocks
}

export interface UpdateMessageOptions {
  channel: string;
  ts: string;
  text?: string;
  blocks?: any[]; // Slack Block Kit blocks
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
  private lastUpdateTimes = new Map<string, number>();
  private readonly UPDATE_RATE_LIMIT_MS = 3000; // Slack enforces 3-second minimum between updates

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
        blocks: options.blocks,
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
    blocks?: any[];
  }): Promise<MessageResult> {
    return this.postMessage({
      channel: params.channel,
      text: params.text,
      threadTs: params.threadTs,
      unfurlLinks: params.unfurlLinks ?? false,
      blocks: params.blocks,
    });
  }

  /**
   * Update an existing message with rate limiting and retry logic
   *
   * Implements:
   * - 3-second rate limit between updates to same message
   * - Exponential backoff retry on race conditions
   * - Automatic waiting when rate limited
   */
  async updateMessage(options: UpdateMessageOptions): Promise<void> {
    const messageKey = `${options.channel}:${options.ts}`;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Enforce 3-second rate limit
        const lastUpdate = this.lastUpdateTimes.get(messageKey) || 0;
        const elapsed = Date.now() - lastUpdate;

        if (elapsed < this.UPDATE_RATE_LIMIT_MS) {
          const waitTime = this.UPDATE_RATE_LIMIT_MS - elapsed;
          console.log(
            `[Slack Messaging] Rate limiting ${messageKey}, waiting ${waitTime}ms ` +
            `(${elapsed}ms since last update)`
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Update the message
        const updateParams: any = {
          channel: options.channel,
          ts: options.ts,
        };

        // When blocks are present, they should be the primary content
        // Text is only used as fallback for notifications/search
        if (options.blocks && options.blocks.length > 0) {
          // Validate block count (Slack limit: 50 blocks per message)
          if (options.blocks.length > 50) {
            console.error(`[Slack Messaging] Too many blocks: ${options.blocks.length} (max 50)`);
            throw new Error(`Block count exceeds Slack limit: ${options.blocks.length} blocks (max 50)`);
          }

          // Validate blocks before sending
          for (let i = 0; i < options.blocks.length; i++) {
            const block = options.blocks[i];
            if (!block.type) {
              console.error(`[Slack Messaging] Block ${i} missing required 'type' field:`, block);
              throw new Error(`Invalid block at index ${i}: missing 'type' field`);
            }

            // Validate section block text length (Slack limit: 3000 characters)
            if (block.type === 'section' && block.text?.text) {
              const textLength = block.text.text.length;
              if (textLength > 3000) {
                console.error(`[Slack Messaging] Section block ${i} text exceeds 3000 chars: ${textLength}`);
                throw new Error(
                  `Section block ${i} text exceeds Slack limit: ${textLength} chars (max 3000). ` +
                  `Use splitTextIntoSectionBlocks() utility to split long text.`
                );
              }
            }
          }

          updateParams.blocks = options.blocks;
          // Include text as fallback if provided
          if (options.text) {
            updateParams.text = options.text;
          }

          console.log(`[Slack Messaging] Updating message with ${options.blocks.length} Block Kit blocks`);
          console.log(`[Slack Messaging] First 3 blocks:`, JSON.stringify(options.blocks.slice(0, 3), null, 2));
          console.log(`[Slack Messaging] Fallback text:`, options.text?.substring(0, 100));
        } else {
          // Text-only message
          updateParams.text = options.text || "Message sent";
        }

        const response = await this.client.chat.update(updateParams);

        // Log the Slack API response for debugging
        console.log(`[Slack Messaging] Update response:`, {
          ok: response.ok,
          channel: response.channel,
          ts: response.ts,
          text: response.message?.text?.substring(0, 100),
          hasBlocks: !!response.message?.blocks,
          blockCount: response.message?.blocks?.length || 0,
        });

        // Track successful update time
        this.lastUpdateTimes.set(messageKey, Date.now());

        // Success - exit retry loop
        return;

      } catch (error: any) {
        attempt++;

        // Check if it's a race condition or conflict error
        const isRaceCondition =
          error?.data?.error === 'edit_window_closed' ||
          error?.data?.error === 'message_not_found' ||
          error?.data?.error === 'conflict';

        if (isRaceCondition && attempt < maxRetries) {
          const backoffTime = 500 * Math.pow(2, attempt - 1); // Exponential backoff: 500ms, 1s, 2s
          console.warn(
            `[Slack Messaging] Race condition on message update (attempt ${attempt}/${maxRetries}), ` +
            `retrying in ${backoffTime}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        }

        // Not a race condition or max retries reached
        console.error(`[Slack Messaging] Failed to update message after ${attempt} attempts:`, {
          error: error?.data?.error || error?.message,
          errorDetails: error?.data,
          hadBlocks: !!options.blocks,
          blockCount: options.blocks?.length || 0,
          textPreview: options.text?.substring(0, 100),
        });
        throw error;
      }
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
   * Get thread messages formatted as ChatMessage array
   * (Replicates getThread from slack-utils.ts)
   */
  async getThread(
    channelId: string,
    threadTs: string,
    botUserId: string
  ): Promise<ChatMessage[]> {
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
        } as ChatMessage;
      })
      .filter((msg): msg is ChatMessage => msg !== null);

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

  /**
   * Upload a file to Slack
   */
  async uploadFile(params: {
    channelId: string;
    filename: string;
    title: string;
    initialComment?: string;
    file: Buffer;
  }): Promise<{ ok: boolean }> {
    try {
      await this.client.files.uploadV2({
        channel_id: params.channelId,
        filename: params.filename,
        title: params.title,
        initial_comment: params.initialComment,
        file: params.file,
      });
      return { ok: true };
    } catch (error: any) {
      console.error('[Slack Messaging] Error uploading file:', error);
      if (error.data?.error === 'missing_scope') {
        console.error('[Slack Messaging] Missing required scope for files.uploadV2');
      }
      throw error;
    }
  }

  /**
   * Get conversation info
   */
  async getConversationInfo(channelId: string): Promise<any> {
    try {
      const result = await this.client.conversations.info({
        channel: channelId,
      });
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error getting conversation info:', error);
      throw error;
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(params: {
    channel: string;
    latest: string;
    limit: number;
    inclusive: boolean;
  }): Promise<any> {
    try {
      const result = await this.client.conversations.history(params);
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error getting conversation history:', error);
      throw error;
    }
  }

  /**
   * Open a modal view
   */
  async openView(params: { triggerId: string; view: any }): Promise<any> {
    try {
      const result = await this.client.views.open({
        trigger_id: params.triggerId,
        view: params.view,
      });
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error opening view:', error);
      throw error;
    }
  }

  /**
   * Update an existing modal view (for multi-step workflows)
   */
  async updateView(params: { viewId: string; view: any; hash?: string }): Promise<any> {
    try {
      const updateParams: any = {
        view_id: params.viewId,
        view: params.view,
      };

      if (params.hash) {
        updateParams.hash = params.hash;
      }

      const result = await this.client.views.update(updateParams);
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error updating view:', error);
      throw error;
    }
  }

  /**
   * Push a new modal view onto the stack (for sub-modals)
   */
  async pushView(params: { triggerId: string; view: any }): Promise<any> {
    try {
      const result = await this.client.views.push({
        trigger_id: params.triggerId,
        view: params.view,
      });
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error pushing view:', error);
      throw error;
    }
  }

  /**
   * Look up user by email
   */
  async lookupUserByEmail(email: string): Promise<any> {
    try {
      const result = await this.client.users.lookupByEmail({
        email: email,
      });
      return result;
    } catch (error) {
      console.error('[Slack Messaging] Error looking up user by email:', error);
      throw error;
    }
  }

  /**
   * Open a direct message conversation
   */
  async openConversation(userId: string): Promise<{ channelId?: string }> {
    try {
      const result = await this.client.conversations.open({
        users: userId,
      });
      return { channelId: result.channel?.id };
    } catch (error) {
      console.error('[Slack Messaging] Error opening conversation:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(params: { channel: string; ts: string }): Promise<void> {
    try {
      await this.client.chat.delete({
        channel: params.channel,
        ts: params.ts,
      });
    } catch (error) {
      console.error('[Slack Messaging] Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Set assistant suggested prompts
   */
  async setAssistantSuggestedPrompts(params: {
    channelId: string;
    threadTs: string;
    prompts: Array<{ title: string; message: string }>;
  }): Promise<void> {
    try {
      // Slack API requires at least one prompt
      if (!params.prompts || params.prompts.length === 0) {
        console.warn('[Slack Messaging] Cannot set suggested prompts: empty array');
        return;
      }

      await this.client.assistant.threads.setSuggestedPrompts({
        channel_id: params.channelId,
        thread_ts: params.threadTs,
        prompts: params.prompts as [{ title: string; message: string }, ...{ title: string; message: string }[]],
      });
    } catch (error: any) {
      if (error.data?.error === 'missing_scope') {
        console.error('[Slack Messaging] Missing assistant scope for setSuggestedPrompts');
        return; // Gracefully handle missing scope
      }
      console.error('[Slack Messaging] Error setting suggested prompts:', error);
      throw error;
    }
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
    // In test environment, require() might not work due to Vitest module resolution
    try {
      const { getSlackClient } = require('../slack/client');
      slackMessagingService = new SlackMessagingService(getSlackClient());
    } catch (error: any) {
      // In tests, if require fails, create a mock WebClient
      if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
        const mockClient = {
          chat: { postMessage: () => Promise.resolve({ ok: true }), update: () => Promise.resolve({ ok: true }) },
          files: { uploadV2: () => Promise.resolve({ ok: true }) },
          conversations: { info: () => Promise.resolve({ ok: true }) },
          auth: { test: () => Promise.resolve({ ok: true, user_id: "U123456" }) },
          users: { lookupByEmail: () => Promise.resolve({ ok: true }) },
          views: { open: () => Promise.resolve({ ok: true }), update: () => Promise.resolve({ ok: true }) },
        } as any;
        slackMessagingService = new SlackMessagingService(mockClient);
      } else {
        throw error;
      }
    }
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
