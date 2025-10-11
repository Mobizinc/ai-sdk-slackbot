#!/usr/bin/env ts-node
/**
 * Infrastructure Discovery Script
 *
 * Scans Slack channels for infrastructure mentions (IPs, hostnames, share paths)
 * and cross-references against ServiceNow CMDB to find undocumented infrastructure.
 *
 * Usage:
 *   ts-node scripts/discover-infrastructure.ts --channel altus-support --days 90
 */

import { WebClient } from "@slack/web-api";
import { serviceNowClient } from "../lib/tools/servicenow";
import { extractInfrastructureReferences } from "../lib/services/troubleshooting-assistant";

interface DiscoveredInfrastructure {
  value: string;
  type: "ip" | "hostname" | "share_path";
  mentions: number;
  firstSeen: Date;
  lastSeen: Date;
  contexts: string[];
  inCMDB: boolean;
  relatedCases?: string[];
}

interface DiscoveryOptions {
  channelName: string;
  daysBack: number;
  limit?: number;
}

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Fetch messages from a Slack channel
 */
async function fetchChannelMessages(
  channelId: string,
  oldestTimestamp: number
): Promise<any[]> {
  const messages: any[] = [];
  let cursor: string | undefined;

  try {
    do {
      const result: any = await slack.conversations.history({
        channel: channelId,
        oldest: oldestTimestamp.toString(),
        limit: 200,
        cursor,
      });

      if (result.messages) {
        messages.push(...result.messages);
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    return messages;
  } catch (error) {
    console.error(`Error fetching messages: ${error}`);
    return messages;
  }
}

/**
 * Extract case numbers from message text
 */
function extractCaseNumbers(text: string): string[] {
  const casePattern = /\b(SCS|INC)\d{7}\b/g;
  return text.match(casePattern) || [];
}

/**
 * Check if infrastructure item exists in CMDB
 */
async function checkCMDB(
  value: string,
  type: "ip" | "hostname" | "share_path"
): Promise<boolean> {
  if (!serviceNowClient.isConfigured()) {
    console.warn("ServiceNow not configured - skipping CMDB checks");
    return false;
  }

  try {
    if (type === "ip") {
      const results = await serviceNowClient.searchConfigurationItems({
        ipAddress: value,
        limit: 1,
      });
      return results.length > 0;
    } else if (type === "hostname") {
      const results = await serviceNowClient.searchConfigurationItems({
        name: value,
        limit: 1,
      });
      return results.length > 0;
    } else if (type === "share_path") {
      // Extract IP or hostname from UNC path
      const match = value.match(/\\\\([^\\]+)/);
      if (match) {
        const host = match[1];
        const results = await serviceNowClient.searchConfigurationItems({
          name: host,
          limit: 1,
        });
        return results.length > 0;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error checking CMDB for ${value}: ${error}`);
    return false;
  }
}

/**
 * Discover infrastructure from Slack channel
 */
async function discoverInfrastructure(
  options: DiscoveryOptions
): Promise<Map<string, DiscoveredInfrastructure>> {
  const { channelName, daysBack } = options;

  console.log(`\n🔍 Scanning #${channelName} for infrastructure mentions...\n`);

  // Find channel ID
  const channelsList: any = await slack.conversations.list({
    types: "public_channel,private_channel",
  });

  const channel = channelsList.channels?.find(
    (c: any) => c.name === channelName
  );

  if (!channel) {
    throw new Error(`Channel #${channelName} not found`);
  }

  console.log(`📡 Found channel: #${channel.name} (${channel.id})\n`);

  // Calculate timestamp for X days back
  const now = Date.now() / 1000;
  const oldestTimestamp = now - daysBack * 24 * 60 * 60;

  // Fetch messages
  console.log(`📥 Fetching messages from last ${daysBack} days...\n`);
  const messages = await fetchChannelMessages(channel.id, oldestTimestamp);

  console.log(`✅ Retrieved ${messages.length} messages\n`);
  console.log(`🔎 Extracting infrastructure references...\n`);

  // Track discovered infrastructure
  const discovered = new Map<string, DiscoveredInfrastructure>();

  for (const message of messages) {
    if (!message.text) continue;

    const timestamp = new Date(parseFloat(message.ts) * 1000);
    const refs = extractInfrastructureReferences(message.text);
    const cases = extractCaseNumbers(message.text);

    // Process IPs
    for (const ip of refs.ipAddresses) {
      if (!discovered.has(ip)) {
        discovered.set(ip, {
          value: ip,
          type: "ip",
          mentions: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          contexts: [],
          inCMDB: false,
          relatedCases: [],
        });
      }

      const item = discovered.get(ip)!;
      item.mentions++;
      item.lastSeen = timestamp;
      if (item.contexts.length < 3) {
        item.contexts.push(message.text.substring(0, 150));
      }
      if (cases.length > 0) {
        item.relatedCases = [
          ...new Set([...(item.relatedCases || []), ...cases]),
        ];
      }
    }

    // Process hostnames
    for (const hostname of refs.hostnames) {
      if (!discovered.has(hostname)) {
        discovered.set(hostname, {
          value: hostname,
          type: "hostname",
          mentions: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          contexts: [],
          inCMDB: false,
          relatedCases: [],
        });
      }

      const item = discovered.get(hostname)!;
      item.mentions++;
      item.lastSeen = timestamp;
      if (item.contexts.length < 3) {
        item.contexts.push(message.text.substring(0, 150));
      }
      if (cases.length > 0) {
        item.relatedCases = [
          ...new Set([...(item.relatedCases || []), ...cases]),
        ];
      }
    }

    // Process share paths
    for (const sharePath of refs.sharePaths) {
      if (!discovered.has(sharePath)) {
        discovered.set(sharePath, {
          value: sharePath,
          type: "share_path",
          mentions: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          contexts: [],
          inCMDB: false,
          relatedCases: [],
        });
      }

      const item = discovered.get(sharePath)!;
      item.mentions++;
      item.lastSeen = timestamp;
      if (item.contexts.length < 3) {
        item.contexts.push(message.text.substring(0, 150));
      }
      if (cases.length > 0) {
        item.relatedCases = [
          ...new Set([...(item.relatedCases || []), ...cases]),
        ];
      }
    }
  }

  console.log(`✅ Found ${discovered.size} unique infrastructure references\n`);

  // Check CMDB for each item
  if (serviceNowClient.isConfigured()) {
    console.log(`🔗 Cross-checking against ServiceNow CMDB...\n`);
    for (const [key, item] of discovered.entries()) {
      item.inCMDB = await checkCMDB(item.value, item.type);
    }
  } else {
    console.log(`⚠️  ServiceNow not configured - skipping CMDB checks\n`);
  }

  return discovered;
}

/**
 * Generate report
 */
function generateReport(discovered: Map<string, DiscoveredInfrastructure>) {
  const items = Array.from(discovered.values()).sort(
    (a, b) => b.mentions - a.mentions
  );

  const missing = items.filter((i) => !i.inCMDB);
  const documented = items.filter((i) => i.inCMDB);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 INFRASTRUCTURE DISCOVERY REPORT`);
  console.log(`${"=".repeat(80)}\n`);

  console.log(`📈 Summary:`);
  console.log(`   Total discovered: ${items.length}`);
  console.log(`   📗 In CMDB: ${documented.length}`);
  console.log(`   📕 Missing from CMDB: ${missing.length}\n`);

  if (missing.length > 0) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`📕 MISSING FROM CMDB (Priority Order)\n`);

    missing.forEach((item, i) => {
      console.log(`${i + 1}. ${item.value} (${item.type})`);
      console.log(`   Mentions: ${item.mentions}`);
      console.log(
        `   First seen: ${item.firstSeen.toISOString().split("T")[0]}`
      );
      console.log(`   Last seen: ${item.lastSeen.toISOString().split("T")[0]}`);

      if (item.relatedCases && item.relatedCases.length > 0) {
        console.log(`   Related cases: ${item.relatedCases.join(", ")}`);
      }

      if (item.contexts.length > 0) {
        console.log(`   Context example: "${item.contexts[0]}..."`);
      }
      console.log();
    });
  }

  if (documented.length > 0) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`📗 DOCUMENTED IN CMDB\n`);

    documented.forEach((item, i) => {
      console.log(
        `${i + 1}. ${item.value} (${item.type}) - ${item.mentions} mentions`
      );
    });
    console.log();
  }

  console.log(`${"=".repeat(80)}\n`);

  // Return structured data for potential JSON export
  return {
    summary: {
      total: items.length,
      documented: documented.length,
      missing: missing.length,
    },
    missing: missing.map((i) => ({
      value: i.value,
      type: i.type,
      mentions: i.mentions,
      firstSeen: i.firstSeen.toISOString(),
      lastSeen: i.lastSeen.toISOString(),
      relatedCases: i.relatedCases,
      contexts: i.contexts,
    })),
    documented: documented.map((i) => ({
      value: i.value,
      type: i.type,
      mentions: i.mentions,
    })),
  };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let channelName = "altus-support";
  let daysBack = 90;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--days" && args[i + 1]) {
      daysBack = parseInt(args[i + 1], 10);
      i++;
    }
  }

  console.log(`\n🚀 Infrastructure Discovery Tool`);
  console.log(`   Channel: #${channelName}`);
  console.log(`   Time range: Last ${daysBack} days\n`);

  try {
    const discovered = await discoverInfrastructure({ channelName, daysBack });
    const report = generateReport(discovered);

    // Optionally export to JSON
    const exportPath = `./infrastructure-discovery-${channelName}-${Date.now()}.json`;
    const fs = require("fs");
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2));
    console.log(`💾 Full report exported to: ${exportPath}\n`);
  } catch (error) {
    console.error(`\n❌ Error: ${error}\n`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
