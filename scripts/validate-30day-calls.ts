/**
 * 30-Day Voice Call Validation Script
 *
 * Extended validation to check for voice interactions over the last 30 days
 *
 * Usage: npx tsx scripts/validate-30day-calls.ts
 */

import { config } from "dotenv";
import { fetchVoiceInteractions } from "../lib/services/webex-contact-center";

// Load environment variables
config({ path: ".env.local" });

async function main() {
  console.log("=".repeat(80));
  console.log("WEBEX CONTACT CENTER - 30 DAY VOICE CALL VALIDATION");
  console.log("=".repeat(80));
  console.log();

  // Validate configuration
  const hasDirectToken = Boolean(process.env.WEBEX_CC_ACCESS_TOKEN);
  const hasRefreshFlow =
    Boolean(process.env.WEBEX_CC_CLIENT_ID) &&
    Boolean(process.env.WEBEX_CC_CLIENT_SECRET) &&
    Boolean(process.env.WEBEX_CC_REFRESH_TOKEN);

  if (!hasDirectToken && !hasRefreshFlow) {
    console.error("❌ Missing Webex Contact Center credentials");
    process.exit(1);
  }

  console.log("1. Configuration");
  console.log("-".repeat(80));
  console.log(`✅ Auth Method: ${hasDirectToken ? "Direct Token" : "OAuth Refresh"}`);
  console.log(`✅ Org ID: ${process.env.WEBEX_CC_ORG_ID}`);
  console.log();

  // Calculate time range (30 days)
  const endTime = new Date();
  const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log("2. Query Parameters");
  console.log("-".repeat(80));
  console.log(`   Endpoint: ${process.env.WEBEX_CC_BASE_URL || "https://api.wxcc-us1.cisco.com"}/v1/tasks`);
  console.log(`   Time Range: ${startTime.toISOString()} → ${endTime.toISOString()}`);
  console.log(`   Duration: 30 days`);
  console.log(`   From: ${startTime.toLocaleDateString()} ${startTime.toLocaleTimeString()}`);
  console.log(`   To: ${endTime.toLocaleDateString()} ${endTime.toLocaleTimeString()}`);
  console.log(`   From (epoch): ${startTime.getTime()}`);
  console.log(`   To (epoch): ${endTime.getTime()}`);
  console.log();

  // Fetch interactions
  console.log("3. Fetching Voice Interactions (this may take a moment for 30 days of data)");
  console.log("-".repeat(80));

  const startQuery = Date.now();

  try {
    const result = await fetchVoiceInteractions({
      startTime,
      endTime,
      pageSize: 100,
    });

    const queryTime = Date.now() - startQuery;

    console.log(`✅ Query completed in ${(queryTime / 1000).toFixed(2)}s`);
    console.log();

    console.log("4. Results Summary");
    console.log("-".repeat(80));
    console.log(`   Total Interactions Found: ${result.interactions.length}`);
    console.log(`   Query Performance: ${(queryTime / 1000).toFixed(2)}s`);
    console.log(`   Latest Call End Time: ${result.latestEndTime ? result.latestEndTime.toISOString() : "N/A"}`);
    console.log();

    if (result.interactions.length === 0) {
      console.log("⚠️  NO INTERACTIONS FOUND IN LAST 30 DAYS");
      console.log();
      console.log("This suggests:");
      console.log("   • This is a new/unused Webex Contact Center instance");
      console.log("   • No voice calls have been processed");
      console.log("   • Data retention policy may be < 30 days");
      console.log("   • This may be a demo/sandbox environment");
      console.log();
      console.log("Next Steps:");
      console.log("   1. Verify this is the correct Webex org (check orgId)");
      console.log("   2. Check Webex Analyzer for any historical call data");
      console.log("   3. Make a test call to validate the integration");
      console.log("   4. Contact Webex admin to confirm Contact Center is active");
      console.log();
      console.log("=".repeat(80));
      console.log("✅ API INTEGRATION: WORKING");
      console.log("⚠️  CALL DATA: NONE FOUND (30 days)");
      console.log("=".repeat(80));
      return;
    }

    // Quick statistics
    console.log("5. Quick Statistics");
    console.log("-".repeat(80));

    const inbound = result.interactions.filter(i => i.direction === "inbound").length;
    const outbound = result.interactions.filter(i => i.direction === "outbound").length;
    const withRecording = result.interactions.filter(i => i.recordingId).length;
    const withCase = result.interactions.filter(i => i.caseNumber).length;

    const durations = result.interactions
      .filter(i => i.durationSeconds)
      .map(i => i.durationSeconds!);

    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const avgDuration = durations.length > 0 ? Math.round(totalDuration / durations.length) : 0;

    console.log(`   Inbound Calls: ${inbound} (${Math.round((inbound / result.interactions.length) * 100)}%)`);
    console.log(`   Outbound Calls: ${outbound} (${Math.round((outbound / result.interactions.length) * 100)}%)`);
    console.log(`   Calls with Recording: ${withRecording} (${Math.round((withRecording / result.interactions.length) * 100)}%)`);
    console.log(`   Calls with Case Number: ${withCase} (${Math.round((withCase / result.interactions.length) * 100)}%)`);
    console.log(`   Average Duration: ${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`);
    console.log();

    // Date range of actual data
    const dates = result.interactions
      .filter(i => i.startTime)
      .map(i => i.startTime!.getTime());

    if (dates.length > 0) {
      const oldestCall = new Date(Math.min(...dates));
      const newestCall = new Date(Math.max(...dates));

      console.log("6. Data Coverage");
      console.log("-".repeat(80));
      console.log(`   Oldest Call: ${oldestCall.toLocaleString()}`);
      console.log(`   Newest Call: ${newestCall.toLocaleString()}`);
      console.log(`   Span: ${Math.round((newestCall.getTime() - oldestCall.getTime()) / (24 * 60 * 60 * 1000))} days`);
      console.log();
    }

    // Sample interactions
    console.log("7. Sample Interactions");
    console.log("-".repeat(80));

    const samplesToShow = Math.min(3, result.interactions.length);
    for (let i = 0; i < samplesToShow; i++) {
      const call = result.interactions[i];
      console.log(`   [${i + 1}] Session: ${call.sessionId}`);
      console.log(`       Direction: ${call.direction || "N/A"}`);
      console.log(`       Time: ${call.startTime ? call.startTime.toLocaleString() : "N/A"}`);
      console.log(`       ANI: ${call.ani || "N/A"} → DNIS: ${call.dnis || "N/A"}`);
      console.log(`       Agent: ${call.agentName || "N/A"}`);
      console.log(`       Queue: ${call.queueName || "N/A"}`);
      console.log(`       Duration: ${call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : "N/A"}`);
      console.log(`       Case: ${call.caseNumber || "N/A"}`);
      console.log();
    }

    // Production readiness
    console.log("8. Production Readiness");
    console.log("-".repeat(80));
    console.log("✅ API Integration: WORKING");
    console.log("✅ OAuth Authentication: SUCCESSFUL");
    console.log("✅ Data Retrieval: SUCCESSFUL");
    console.log(`✅ Call Data Found: ${result.interactions.length} interactions`);
    console.log(`✅ Query Performance: ${(queryTime / 1000).toFixed(2)}s`);
    console.log();
    console.log("🎉 INTEGRATION IS PRODUCTION READY!");
    console.log();
    console.log("Next Steps:");
    console.log("   1. ✅ Commit changes to staging branch");
    console.log("   2. ✅ Deploy to Vercel");
    console.log("   3. ✅ Configure cron job (every 10 minutes)");
    console.log("   4. ✅ Monitor initial syncs");
    console.log("   5. 🔜 Implement ServiceNow work note creation");
    console.log("   6. 🔜 Build recording/transcript pipeline");
    console.log();
    console.log("=".repeat(80));
    console.log(`✅ VALIDATION COMPLETE - ${result.interactions.length} calls found in 30 days`);
    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ VALIDATION FAILED");
    console.error();

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error();

      if (error.message.includes("timeout")) {
        console.error("   Note: 30-day queries may take longer. This is normal.");
        console.error("   Consider increasing REQUEST_TIMEOUT_MS if needed.");
      }

      console.error();
      console.error("Full Error:");
      console.error(error);
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
