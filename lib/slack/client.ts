import { WebClient } from '@slack/web-api';
import { config } from '../config';

let slackClient: WebClient | null = null;

export function getSlackClient(): WebClient {
  if (!slackClient) {
    const { slackBotToken } = config;

    if (!slackBotToken) {
      throw new Error('SLACK_BOT_TOKEN is not configured');
    }

    slackClient = new WebClient(slackBotToken);
  }

  return slackClient;
}

// For testing only
export function __setSlackClient(client: WebClient): void {
  slackClient = client;
}

export function __resetSlackClient(): void {
  slackClient = null;
}
