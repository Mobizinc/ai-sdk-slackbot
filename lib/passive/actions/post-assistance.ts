/**
 * Post Assistance Action
 *
 * Posts intelligent assistance messages when cases are first detected.
 * Uses Phase 1 services for Slack messaging, case data, and search.
 *
 * Encapsulates the logic for determining when and how to post assistance.
 */

import type { GenericMessageEvent } from '../../slack-event-types';
import type { SlackMessagingService } from '../../services/slack-messaging';
import { getSlackMessagingService } from '../../services/slack-messaging';
import type { CaseDataService } from '../../services/case-data';
import { getCaseDataService } from '../../services/case-data';
import type { SearchFacadeService } from '../../services/search-facade';
import { getSearchFacadeService } from '../../services/search-facade';
import type { CaseContext } from '../../context-manager';
import { getChannelInfo } from '../../services/channel-info';
import {
  buildIntelligentAssistance,
  shouldProvideAssistance,
} from '../../services/intelligent-assistant';
import { MessageEmojis } from '../../utils/message-styling';

export interface PostAssistanceDeps {
  slackMessaging: SlackMessagingService;
  caseData: CaseDataService;
  searchFacade: SearchFacadeService;
}

export interface PostAssistanceParams {
  event: GenericMessageEvent;
  caseNumber: string;
  context: CaseContext | null;
}

/**
 * Post Assistance Action
 * Handles posting intelligent assistance for detected cases
 */
export class PostAssistanceAction {
  constructor(private deps: PostAssistanceDeps) {}

  /**
   * Post assistance message for a detected case
   * Returns true if assistance was posted, false if skipped
   */
  async execute(params: PostAssistanceParams): Promise<boolean> {
    const { event, caseNumber, context } = params;

    // Skip if already posted assistance
    if (context?.hasPostedAssistance) {
      console.log(
        `[Post Assistance] Already posted for case ${caseNumber}, skipping`
      );
      return false;
    }

    const channelId = event.channel;

    // Fetch and store channel info for better context
    let channelInfo: any = {};
    try {
      channelInfo = await getChannelInfo(channelId);
    } catch (error) {
      console.warn(`[Post Assistance] Could not fetch channel info:`, error);
      // Continue without channel info
    }

    // Fetch case details from ServiceNow
    const caseDetails = await this.deps.caseData.getCase(caseNumber);

    // Check if we should provide assistance for this case state
    if (!shouldProvideAssistance(caseDetails)) {
      console.log(
        `[Post Assistance] Skipping assistance for ${caseNumber} - case is not in an active state`
      );

      // Post minimal tracking message
      await this.postMinimalMessage(channelId, event.ts, caseNumber);
      return true; // We did post something
    }

    // Post full intelligent assistance
    await this.postIntelligentAssistance(
      channelId,
      event.ts,
      caseNumber,
      caseDetails,
      channelInfo
    );

    return true;
  }

  /**
   * Post minimal tracking message for inactive cases
   */
  private async postMinimalMessage(
    channelId: string,
    threadTs: string,
    caseNumber: string
  ): Promise<void> {
    const message = `${MessageEmojis.GREETING} I see you're working on *${caseNumber}*. I'll track this conversation for knowledge base generation. ${MessageEmojis.DOCUMENT}`;

    await this.deps.slackMessaging.postToThread({
      channel: channelId,
      threadTs: threadTs,
      text: message,
      unfurlLinks: false,
    });
  }

  /**
   * Post full intelligent assistance message
   */
  private async postIntelligentAssistance(
    channelId: string,
    threadTs: string,
    caseNumber: string,
    caseDetails: any,
    channelInfo: any
  ): Promise<void> {
    try {
      console.log(
        `[Post Assistance] Azure Search ${
          this.deps.searchFacade.isAzureSearchConfigured()
            ? 'ENABLED'
            : 'DISABLED'
        } for ${caseNumber}`
      );

      // Build intelligent message using existing service
      const message = await buildIntelligentAssistance(
        caseNumber,
        caseDetails,
        this.deps.searchFacade.isAzureSearchConfigured()
          ? (this.deps.searchFacade as any)
          : null,
        channelInfo?.channelName,
        channelInfo?.channelTopic,
        channelInfo?.channelPurpose
      );

      // Post to thread
      await this.deps.slackMessaging.postToThread({
        channel: channelId,
        threadTs: threadTs,
        text: message,
        unfurlLinks: false,
      });

      console.log(
        `[Post Assistance] Posted intelligent assistance for ${caseNumber}`
      );
    } catch (error) {
      console.error(
        `[Post Assistance] Error posting for ${caseNumber}:`,
        error
      );
      // Try to post a fallback message
      await this.postMinimalMessage(channelId, threadTs, caseNumber);
    }
  }
}

// Singleton instance
let action: PostAssistanceAction | null = null;

/**
 * Get the post assistance action singleton
 */
export function getPostAssistanceAction(): PostAssistanceAction {
  if (!action) {
    action = new PostAssistanceAction({
      slackMessaging: getSlackMessagingService(),
      caseData: getCaseDataService(),
      searchFacade: getSearchFacadeService(),
    });
  }
  return action;
}

/**
 * Reset the action instance (for testing)
 */
export function __resetPostAssistanceAction(): void {
  action = null;
}

/**
 * Set a custom action instance (for testing)
 */
export function __setPostAssistanceAction(instance: PostAssistanceAction): void {
  action = instance;
}
