/**
 * Webex Contact Center Captures API Test Script
 *
 * Tests the recording download functionality using actual task IDs
 * from the database that have captureRequested=true
 *
 * Usage: npx tsx scripts/test-webex-captures-api.ts
 */

import { config } from "dotenv";
import {
  getCapturesByTaskIds,
  downloadRecording,
} from "../lib/services/webex-contact-center";

// Load environment variables
config({ path: ".env.local" });

async function main() {
  console.log("=".repeat(80));
  console.log("WEBEX CONTACT CENTER - CAPTURES API TEST");
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

  if (!process.env.WEBEX_CC_ORG_ID) {
    console.error("❌ Missing WEBEX_CC_ORG_ID");
    process.exit(1);
  }

  console.log("1. Configuration");
  console.log("-".repeat(80));
  console.log(`✅ Auth Method: ${hasDirectToken ? "Direct Token" : "OAuth Refresh"}`);
  console.log(`✅ Org ID: ${process.env.WEBEX_CC_ORG_ID}`);
  console.log();

  // Test Task IDs - These are from the 30-day validation that showed captureRequested=true
  // You can get these from your database or from the validation output
  const testTaskIds = [
    "388904b6-6d0a-4c11-915c-07fec05aeb9c", // Sample from validation (Umar Ahmed, 11m 42s)
    // Add more task IDs here if you want to test multiple recordings
  ];

  console.log("2. Test Task IDs");
  console.log("-".repeat(80));
  console.log(`   Testing with ${testTaskIds.length} task ID(s):`);
  testTaskIds.forEach((id, idx) => {
    console.log(`   [${idx + 1}] ${id}`);
  });
  console.log();

  // Test 1: Fetch Recording Metadata
  console.log("3. Fetching Recording Metadata");
  console.log("-".repeat(80));

  try {
    const startTime = Date.now();
    const captures = await getCapturesByTaskIds(testTaskIds, 3600);
    const queryTime = Date.now() - startTime;

    console.log(`✅ Captures API responded in ${queryTime}ms`);
    console.log(`   Recordings found: ${captures.length}`);
    console.log();

    if (captures.length === 0) {
      console.log("⚠️  NO RECORDINGS FOUND");
      console.log();
      console.log("Possible Reasons:");
      console.log("   • Recording processing not complete (wait 2-5 minutes after call ends)");
      console.log("   • Recordings expired (24-48 hour retention)");
      console.log("   • captureRequested was true but recording failed");
      console.log("   • Task IDs don't have recordings");
      console.log();
      console.log("Next Steps:");
      console.log("   • Check recent calls in Webex Analyzer for recording availability");
      console.log("   • Make a test call and request recording");
      console.log("   • Wait 5 minutes and try again");
      console.log();
      console.log("=".repeat(80));
      console.log("✅ API CONNECTIVITY: WORKING");
      console.log("⚠️  RECORDINGS: NONE AVAILABLE FOR TEST TASK IDS");
      console.log("=".repeat(80));
      return;
    }

    // Display recording details
    console.log("4. Recording Details");
    console.log("-".repeat(80));

    captures.forEach((capture, idx) => {
      console.log(`   [${idx + 1}] Capture ID: ${capture.id}`);
      console.log(`       Task ID: ${capture.taskId}`);
      console.log(`       Status: ${capture.status || "N/A"}`);
      console.log(`       Format: ${capture.format || "N/A"}`);
      console.log(`       Duration: ${capture.durationMs ? `${Math.round(capture.durationMs / 1000)}s` : "N/A"}`);
      console.log(`       Start Time: ${capture.startTime ? new Date(capture.startTime).toLocaleString() : "N/A"}`);
      console.log(`       End Time: ${capture.endTime ? new Date(capture.endTime).toLocaleString() : "N/A"}`);
      console.log(`       Download URL: ${capture.filepath.substring(0, 100)}...`);
      console.log();
    });

    // Test 2: Download First Recording
    if (captures.length > 0 && captures[0].filepath) {
      console.log("5. Testing Recording Download");
      console.log("-".repeat(80));

      const firstCapture = captures[0];
      const outputPath = `/tmp/webex-recording-test-${Date.now()}.${firstCapture.format || "mp3"}`;

      console.log(`   Downloading recording for task: ${firstCapture.taskId}`);
      console.log(`   Output file: ${outputPath}`);
      console.log();

      const downloadStart = Date.now();
      const fileSize = await downloadRecording(firstCapture.filepath, outputPath);
      const downloadTime = Date.now() - downloadStart;

      console.log(`✅ Download successful!`);
      console.log(`   File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Download time: ${(downloadTime / 1000).toFixed(2)}s`);
      console.log(`   Speed: ${((fileSize / 1024 / 1024) / (downloadTime / 1000)).toFixed(2)} MB/s`);
      console.log(`   File saved to: ${outputPath}`);
      console.log();

      const fs = await import("fs/promises");
      const stats = await fs.stat(outputPath);
      console.log(`✅ File verification:`);
      console.log(`   Exists: ${stats.isFile()}`);
      console.log(`   Size matches: ${stats.size === fileSize}`);
      console.log();
    }

    // Summary
    console.log("6. Test Summary");
    console.log("-".repeat(80));
    console.log(`✅ Captures API: WORKING`);
    console.log(`✅ Recording Metadata Retrieval: SUCCESS`);
    console.log(`✅ Download URLs Generated: ${captures.length} URL(s)`);
    console.log(`✅ Recording Download: ${captures.length > 0 ? "TESTED" : "SKIPPED (no recordings)"}`);
    console.log();

    console.log("Next Steps:");
    console.log("   1. ✅ Integrate Captures API into sync-webex-voice.ts cron job");
    console.log("   2. ✅ Update database schema with recording metadata fields");
    console.log("   3. ✅ Set up S3 storage for permanent recording retention");
    console.log("   4. 🔜 Build transcription pipeline");
    console.log();

    console.log("=".repeat(80));
    console.log(`✅ TEST PASSED - ${captures.length} recording(s) retrieved and tested`);
    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ TEST FAILED");
    console.error();

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error();

      if (error.message.includes("401")) {
        console.error("   • Authentication failed - check OAuth credentials");
      } else if (error.message.includes("403")) {
        console.error("   • Forbidden - verify OAuth scopes include 'cjp:config_read'");
      } else if (error.message.includes("404")) {
        console.error("   • Not found - no recordings exist for these task IDs");
      } else if (error.message.includes("timeout")) {
        console.error("   • Request timeout - API may be slow");
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
