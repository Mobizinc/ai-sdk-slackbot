/**
 * Channel information service for fetching and caching Slack channel metadata.
 * Used to provide contextual hints (not authoritative data) for case tracking.
 */

import { client } from "../slack-utils";

interface ChannelInfo {
  channelId: string;
  channelName: string;
  potentialCustomer?: string;
}

// In-memory cache to avoid repeated API calls
const channelCache = new Map<string, ChannelInfo>();

/**
 * Extract potential customer hint from channel name.
 * Common patterns: altus-helpdesk → altus, acme_support → acme
 * Returns undefined if no clear pattern detected.
 */
function extractCustomerHint(channelName: string): string | undefined {
  if (!channelName) return undefined;

  const normalized = channelName.toLowerCase();

  // Skip generic/common channel names
  const genericChannels = [
    "general",
    "random",
    "help",
    "support",
    "helpdesk",
    "tickets",
    "cases",
    "tech-support",
    "it-support",
  ];
  if (genericChannels.includes(normalized)) return undefined;

  // Try to extract customer from patterns like "customer-team" or "customer_team"
  const parts = normalized.split(/[-_]/);
  if (parts.length >= 2) {
    // Return first part if it's not a generic term
    const firstPart = parts[0];
    if (!genericChannels.includes(firstPart) && firstPart.length > 2) {
      return firstPart;
    }
  }

  return undefined;
}

/**
 * Get channel information from Slack API with caching.
 * Returns channel name and potential customer hint (not authoritative).
 */
export async function getChannelInfo(
  channelId: string
): Promise<ChannelInfo | null> {
  // Check cache first
  if (channelCache.has(channelId)) {
    return channelCache.get(channelId)!;
  }

  try {
    const result = await client.conversations.info({
      channel: channelId,
    });

    if (!result.channel) {
      console.warn(`No channel info found for ${channelId}`);
      return null;
    }

    const channelName = result.channel.name || channelId;
    const potentialCustomer = extractCustomerHint(channelName);

    const info: ChannelInfo = {
      channelId,
      channelName,
      potentialCustomer,
    };

    // Cache for future use
    channelCache.set(channelId, info);

    return info;
  } catch (error) {
    console.error(`Error fetching channel info for ${channelId}:`, error);
    return null;
  }
}

/**
 * Clear the channel cache (useful for testing)
 */
export function clearChannelCache(): void {
  channelCache.clear();
}
