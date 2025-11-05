/**
 * Populate Slack Channel IDs in Business Contexts
 *
 * This script helps add Slack channelIds to business contexts in the database.
 * This enables automatic client detection based on which Slack channel messages arrive in.
 *
 * Usage:
 *   npx tsx scripts/populate-slack-channel-ids.ts
 *
 * Note: You can also update business-contexts.json and re-import using:
 *   npm run db:import-contexts
 */

import { getBusinessContextRepository } from "../lib/db/repositories/business-context-repository";
import { getDb } from "../lib/db/client";

/**
 * Channel ID mappings
 * Add your Slack channel IDs here
 *
 * To find a Slack channel ID:
 * 1. Right-click the channel in Slack
 * 2. Select "View channel details"
 * 3. Scroll down - the channel ID is at the bottom
 * 4. Or use the URL: https://app.slack.com/client/WORKSPACE_ID/CHANNEL_ID
 */
const channelMappings: Record<string, Array<{ name: string; channelId: string; notes?: string }>> = {
  "Altus Community Healthcare": [
    {
      name: "altus-helpdesk",
      channelId: "C0968PZTPHB", // From Issue #47
      notes: "Primary triage channel for Altus end-user support"
    },
    // Add more Altus channels here
  ],

  // Add more clients here
  // "Neighbors Emergency Center": [
  //   {
  //     name: "neighbors-support",
  //     channelId: "C1234567890",
  //     notes: "Neighbors support channel"
  //   }
  // ],
};

async function populateChannelIds() {
  console.log("🔧 Populating Slack Channel IDs in Business Contexts...\n");

  const db = getDb();
  if (!db) {
    console.error("❌ Database connection not available");
    console.error("   Make sure DATABASE_URL is set in your environment");
    process.exit(1);
  }

  const repo = getBusinessContextRepository();
  let successCount = 0;
  let failureCount = 0;

  for (const [entityName, channels] of Object.entries(channelMappings)) {
    console.log(`\n📋 Processing: ${entityName}`);

    try {
      // Find the business context
      const context = await repo.findByName(entityName);

      if (!context) {
        console.error(`   ❌ Business context not found: ${entityName}`);
        console.error(`      Run: npm run db:import-contexts`);
        failureCount++;
        continue;
      }

      // Merge with existing channels
      const existingChannels = Array.isArray(context.slackChannels) ? context.slackChannels : [];
      const mergedChannels = [...existingChannels];

      for (const newChannel of channels) {
        // Check if channel already exists
        const existingIndex = mergedChannels.findIndex(
          (ch: any) => ch.channelId === newChannel.channelId || ch.name === newChannel.name
        );

        if (existingIndex >= 0) {
          // Update existing channel
          mergedChannels[existingIndex] = {
            ...mergedChannels[existingIndex],
            ...newChannel,
          };
          console.log(`   ✏️  Updated: ${newChannel.name} (${newChannel.channelId})`);
        } else {
          // Add new channel
          mergedChannels.push(newChannel);
          console.log(`   ✅ Added: ${newChannel.name} (${newChannel.channelId})`);
        }
      }

      // Update the business context
      const updated = await repo.update(context.id, {
        slackChannels: mergedChannels,
      });

      if (updated) {
        console.log(`   ✅ Updated ${entityName} successfully`);
        successCount++;
      } else {
        console.error(`   ❌ Failed to update ${entityName}`);
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${entityName}:`, error);
      failureCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Successfully updated: ${successCount} business contexts`);
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount} business contexts`);
  }
  console.log("=".repeat(60));

  console.log("\n📝 Next Steps:");
  console.log("   1. Verify the updates:");
  console.log("      Visit http://localhost:3000/api/business-contexts");
  console.log("");
  console.log("   2. Test channel-based detection:");
  console.log("      Send a message in #altus-helpdesk and check logs for:");
  console.log('      "✅ Auto-detected from Slack channel ID"');
  console.log("");
  console.log("   3. Add more channel mappings to this script as needed");
}

// Run the script
populateChannelIds()
  .then(() => {
    console.log("\n✅ Channel ID population complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Channel ID population failed:", error);
    process.exit(1);
  });
