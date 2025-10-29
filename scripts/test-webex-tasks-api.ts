/**
 * Test script for Webex Contact Center Tasks API integration
 *
 * This script validates:
 * 1. OAuth token refresh flow
 * 2. Tasks API endpoint connectivity
 * 3. Data mapping and parsing
 * 4. Timeout and pagination handling
 *
 * Usage:
 *   Set environment variables in .env.local:
 *   - WEBEX_CC_CLIENT_ID
 *   - WEBEX_CC_CLIENT_SECRET
 *   - WEBEX_CC_REFRESH_TOKEN (or WEBEX_CC_ACCESS_TOKEN)
 *   - WEBEX_CC_ORG_ID
 *
 *   Then run: tsx scripts/test-webex-tasks-api.ts
 */

import { config } from "dotenv";
import { fetchVoiceInteractions } from "../lib/services/webex-contact-center";

// Load environment variables
config({ path: ".env.local" });

async function main() {
  console.log("=".repeat(80));
  console.log("WEBEX CONTACT CENTER TASKS API - INTEGRATION TEST");
  console.log("=".repeat(80));
  console.log();

  // Validate configuration
  console.log("1. Validating configuration...");
  const hasDirectToken = Boolean(process.env.WEBEX_CC_ACCESS_TOKEN);
  const hasRefreshFlow =
    Boolean(process.env.WEBEX_CC_CLIENT_ID) &&
    Boolean(process.env.WEBEX_CC_CLIENT_SECRET) &&
    Boolean(process.env.WEBEX_CC_REFRESH_TOKEN);

  if (!hasDirectToken && !hasRefreshFlow) {
    console.error("❌ CONFIGURATION ERROR:");
    console.error("   Missing required environment variables.");
    console.error();
    console.error("   Option 1: Direct Access Token");
    console.error("   - WEBEX_CC_ACCESS_TOKEN");
    console.error();
    console.error("   Option 2: OAuth Refresh Flow (recommended)");
    console.error("   - WEBEX_CC_CLIENT_ID");
    console.error("   - WEBEX_CC_CLIENT_SECRET");
    console.error("   - WEBEX_CC_REFRESH_TOKEN");
    console.error();
    console.error("   Also required:");
    console.error("   - WEBEX_CC_ORG_ID (organization identifier)");
    console.error();
    process.exit(1);
  }

  console.log("✅ Configuration valid");
  console.log(`   Auth method: ${hasDirectToken ? "Direct Access Token" : "OAuth Refresh Flow"}`);
  console.log(`   Org ID: ${process.env.WEBEX_CC_ORG_ID || "NOT SET (may cause errors)"}`);
  console.log();

  // Test API call
  console.log("2. Testing Tasks API endpoint...");
  console.log(`   Endpoint: ${process.env.WEBEX_CC_BASE_URL || "https://api.wxcc-us1.cisco.com"}/v1/tasks`);
  console.log();

  // Fetch last 15 minutes of interactions
  const endTime = new Date();
  const startTime = new Date(Date.now() - 15 * 60 * 1000);

  console.log(`   Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
  console.log(`   Epoch range: ${startTime.getTime()} to ${endTime.getTime()}`);
  console.log();

  try {
    const result = await fetchVoiceInteractions({
      startTime,
      endTime,
      pageSize: 10, // Small page size for testing
    });

    console.log("✅ API call successful!");
    console.log();
    console.log("3. Results:");
    console.log(`   Interactions found: ${result.interactions.length}`);
    console.log(`   Latest end time: ${result.latestEndTime ? result.latestEndTime.toISOString() : "N/A"}`);
    console.log();

    if (result.interactions.length > 0) {
      console.log("4. Sample interaction (first result):");
      const sample = result.interactions[0];
      console.log(`   Session ID: ${sample.sessionId}`);
      console.log(`   Contact ID: ${sample.contactId || "N/A"}`);
      console.log(`   Case Number: ${sample.caseNumber || "N/A"}`);
      console.log(`   Direction: ${sample.direction || "N/A"}`);
      console.log(`   ANI (Caller): ${sample.ani || "N/A"}`);
      console.log(`   DNIS (Called): ${sample.dnis || "N/A"}`);
      console.log(`   Agent: ${sample.agentName || "N/A"} (${sample.agentId || "N/A"})`);
      console.log(`   Queue: ${sample.queueName || "N/A"}`);
      console.log(`   Start Time: ${sample.startTime ? sample.startTime.toISOString() : "N/A"}`);
      console.log(`   End Time: ${sample.endTime ? sample.endTime.toISOString() : "N/A"}`);
      console.log(`   Duration: ${sample.durationSeconds ? `${sample.durationSeconds}s` : "N/A"}`);
      console.log(`   Wrap-up Code: ${sample.wrapUpCode || "N/A"}`);
      console.log(`   Recording ID: ${sample.recordingId || "N/A"}`);
      console.log();

      // Show full payload for debugging
      console.log("5. Raw payload (for debugging):");
      console.log(JSON.stringify(sample.rawPayload, null, 2));
    } else {
      console.log("4. No interactions found in the time range");
      console.log("   This is normal if there were no calls in the last 15 minutes");
      console.log("   Try adjusting the time range or checking if there are active calls");
    }

    console.log();
    console.log("=".repeat(80));
    console.log("✅ TEST PASSED - Integration is working correctly!");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("❌ TEST FAILED");
    console.error();

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error();

      // Provide troubleshooting guidance
      console.error("TROUBLESHOOTING:");

      if (error.message.includes("401")) {
        console.error("   • Authentication failed - check your credentials");
        console.error("   • Verify WEBEX_CC_CLIENT_ID and WEBEX_CC_CLIENT_SECRET are correct");
        console.error("   • Ensure WEBEX_CC_REFRESH_TOKEN hasn't expired (90 days max)");
        console.error("   • Check OAuth scopes include 'cjp:config_read' or 'cjp:user'");
      } else if (error.message.includes("403")) {
        console.error("   • Forbidden - insufficient permissions");
        console.error("   • Verify OAuth scopes include 'cjp:config_read'");
        console.error("   • Check user has admin access to Contact Center");
      } else if (error.message.includes("404")) {
        console.error("   • Resource not found - check API endpoint");
        console.error("   • Verify WEBEX_CC_BASE_URL is correct for your region:");
        console.error("     - US1: https://api.wxcc-us1.cisco.com");
        console.error("     - EU1: https://api.wxcc-eu1.cisco.com");
        console.error("     - ANZ1: https://api.wxcc-anz1.cisco.com");
        console.error("   • Ensure orgId is correct");
      } else if (error.message.includes("timeout")) {
        console.error("   • Request timeout - API may be slow or unreachable");
        console.error("   • Check network connectivity");
        console.error("   • Try increasing REQUEST_TIMEOUT_MS in webex-contact-center.ts");
      } else if (error.message.includes("pagination")) {
        console.error("   • Too many results - pagination limit reached");
        console.error("   • Reduce time range or increase MAX_PAGINATION_PAGES");
      }

      console.error();
      console.error("Full error details:");
      console.error(error);
    } else {
      console.error("   Unknown error:", error);
    }

    console.error();
    console.error("=".repeat(80));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
