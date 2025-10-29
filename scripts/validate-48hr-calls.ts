/**
 * 48-Hour Voice Call Validation Script
 *
 * Comprehensive validation of Webex Contact Center voice interactions
 * over the last 48 hours to assess production readiness.
 *
 * Usage: npx tsx scripts/validate-48hr-calls.ts
 */

import { config } from "dotenv";

// Load environment variables FIRST - before any service imports
// This ensures environment variables are available when modules initialize
config({ path: ".env.local" });

import { fetchVoiceInteractions } from "../lib/services/webex-contact-center";

interface CallStatistics {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  unknownDirection: number;
  callsWithRecording: number;
  callsWithCaseNumber: number;
  averageDuration: number;
  totalDuration: number;
  queueDistribution: Record<string, number>;
  agentDistribution: Record<string, number>;
  wrapUpCodeDistribution: Record<string, number>;
  hourlyDistribution: Record<string, number>;
  missingFields: {
    sessionId: number;
    startTime: number;
    endTime: number;
    direction: number;
    ani: number;
    dnis: number;
    agentId: number;
    queueName: number;
  };
}

function analyzeInteractions(interactions: any[]): CallStatistics {
  const stats: CallStatistics = {
    totalCalls: interactions.length,
    inboundCalls: 0,
    outboundCalls: 0,
    unknownDirection: 0,
    callsWithRecording: 0,
    callsWithCaseNumber: 0,
    averageDuration: 0,
    totalDuration: 0,
    queueDistribution: {},
    agentDistribution: {},
    wrapUpCodeDistribution: {},
    hourlyDistribution: {},
    missingFields: {
      sessionId: 0,
      startTime: 0,
      endTime: 0,
      direction: 0,
      ani: 0,
      dnis: 0,
      agentId: 0,
      queueName: 0,
    },
  };

  interactions.forEach((call) => {
    // Direction analysis
    if (call.direction === "inbound") {
      stats.inboundCalls++;
    } else if (call.direction === "outbound") {
      stats.outboundCalls++;
    } else {
      stats.unknownDirection++;
    }

    // Recording analysis
    if (call.recordingId) {
      stats.callsWithRecording++;
    }

    // Case number analysis
    if (call.caseNumber) {
      stats.callsWithCaseNumber++;
    }

    // Duration analysis
    if (call.durationSeconds) {
      stats.totalDuration += call.durationSeconds;
    }

    // Queue distribution
    if (call.queueName) {
      stats.queueDistribution[call.queueName] =
        (stats.queueDistribution[call.queueName] || 0) + 1;
    }

    // Agent distribution
    if (call.agentName) {
      stats.agentDistribution[call.agentName] =
        (stats.agentDistribution[call.agentName] || 0) + 1;
    }

    // Wrap-up code distribution
    if (call.wrapUpCode) {
      stats.wrapUpCodeDistribution[call.wrapUpCode] =
        (stats.wrapUpCodeDistribution[call.wrapUpCode] || 0) + 1;
    }

    // Hourly distribution
    if (call.startTime) {
      const hour = new Date(call.startTime).getHours();
      const hourKey = `${hour.toString().padStart(2, "0")}:00`;
      stats.hourlyDistribution[hourKey] =
        (stats.hourlyDistribution[hourKey] || 0) + 1;
    }

    // Missing fields analysis
    if (!call.sessionId) stats.missingFields.sessionId++;
    if (!call.startTime) stats.missingFields.startTime++;
    if (!call.endTime) stats.missingFields.endTime++;
    if (!call.direction) stats.missingFields.direction++;
    if (!call.ani) stats.missingFields.ani++;
    if (!call.dnis) stats.missingFields.dnis++;
    if (!call.agentId) stats.missingFields.agentId++;
    if (!call.queueName) stats.missingFields.queueName++;
  });

  // Calculate average duration
  if (stats.totalCalls > 0) {
    stats.averageDuration = Math.round(stats.totalDuration / stats.totalCalls);
  }

  return stats;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("WEBEX CONTACT CENTER - 48 HOUR VOICE CALL VALIDATION");
  console.log("=".repeat(80));
  console.log();

  // Validate configuration
  console.log("1. Configuration Check");
  console.log("-".repeat(80));

  const hasDirectToken = Boolean(process.env.WEBEX_CC_ACCESS_TOKEN);
  const hasRefreshFlow =
    Boolean(process.env.WEBEX_CC_CLIENT_ID) &&
    Boolean(process.env.WEBEX_CC_CLIENT_SECRET) &&
    Boolean(process.env.WEBEX_CC_REFRESH_TOKEN);

  if (!hasDirectToken && !hasRefreshFlow) {
    console.error("❌ Missing Webex Contact Center credentials");
    console.error("   Please set environment variables in .env.local");
    process.exit(1);
  }

  console.log(`✅ Auth Method: ${hasDirectToken ? "Direct Token" : "OAuth Refresh"}`);
  console.log(`✅ Org ID: ${process.env.WEBEX_CC_ORG_ID}`);
  console.log();

  // Calculate time range (48 hours)
  const endTime = new Date();
  const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000);

  console.log("2. Query Parameters");
  console.log("-".repeat(80));
  console.log(`   Endpoint: ${process.env.WEBEX_CC_BASE_URL || "https://api.wxcc-us1.cisco.com"}/v1/tasks`);
  console.log(`   Time Range: ${startTime.toISOString()} → ${endTime.toISOString()}`);
  console.log(`   Duration: 48 hours`);
  console.log(`   From (epoch): ${startTime.getTime()}`);
  console.log(`   To (epoch): ${endTime.getTime()}`);
  console.log(`   Channel Type: telephony`);
  console.log();

  // Fetch interactions
  console.log("3. Fetching Voice Interactions");
  console.log("-".repeat(80));
  console.log("   Querying API...");

  const startQuery = Date.now();

  try {
    const result = await fetchVoiceInteractions({
      startTime,
      endTime,
      pageSize: 100,
    });

    const queryTime = Date.now() - startQuery;

    console.log(`✅ Query completed in ${queryTime}ms`);
    console.log();

    console.log("4. Results Summary");
    console.log("-".repeat(80));
    console.log(`   Total Interactions: ${result.interactions.length}`);
    console.log(`   Latest End Time: ${result.latestEndTime ? result.latestEndTime.toISOString() : "N/A"}`);
    console.log(`   Query Performance: ${queryTime}ms`);
    console.log();

    if (result.interactions.length === 0) {
      console.log("⚠️  NO INTERACTIONS FOUND");
      console.log();
      console.log("Possible Reasons:");
      console.log("   1. No voice calls occurred in the last 48 hours");
      console.log("   2. Data retention policy limits historical data");
      console.log("   3. Time zone mismatch (check if using UTC)");
      console.log("   4. Permission scopes limit data visibility");
      console.log("   5. Business hours - may be outside calling hours");
      console.log();
      console.log("Recommendations:");
      console.log("   • Verify Contact Center has active call traffic");
      console.log("   • Check data retention settings in Webex Control Hub");
      console.log("   • Try querying during business hours");
      console.log("   • Make a test call and re-run this validation");
      console.log();
      console.log("=".repeat(80));
      console.log("✅ API CONNECTIVITY: WORKING");
      console.log("⚠️  DATA AVAILABILITY: NO CALLS FOUND");
      console.log("=".repeat(80));
      return;
    }

    // Analyze interactions
    console.log("5. Call Statistics");
    console.log("-".repeat(80));

    const stats = analyzeInteractions(result.interactions);

    console.log(`   Total Calls: ${stats.totalCalls}`);
    console.log(`   Inbound: ${stats.inboundCalls} (${Math.round((stats.inboundCalls / stats.totalCalls) * 100)}%)`);
    console.log(`   Outbound: ${stats.outboundCalls} (${Math.round((stats.outboundCalls / stats.totalCalls) * 100)}%)`);
    console.log(`   Unknown Direction: ${stats.unknownDirection}`);
    console.log();
    console.log(`   Calls with Recording: ${stats.callsWithRecording} (${Math.round((stats.callsWithRecording / stats.totalCalls) * 100)}%)`);
    console.log(`   Calls with Case Number: ${stats.callsWithCaseNumber} (${Math.round((stats.callsWithCaseNumber / stats.totalCalls) * 100)}%)`);
    console.log();
    console.log(`   Total Duration: ${formatDuration(stats.totalDuration)}`);
    console.log(`   Average Duration: ${formatDuration(stats.averageDuration)}`);
    console.log();

    // Queue distribution
    if (Object.keys(stats.queueDistribution).length > 0) {
      console.log("6. Queue Distribution");
      console.log("-".repeat(80));
      Object.entries(stats.queueDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([queue, count]) => {
          const percentage = Math.round((count / stats.totalCalls) * 100);
          console.log(`   ${queue}: ${count} calls (${percentage}%)`);
        });
      console.log();
    }

    // Agent distribution
    if (Object.keys(stats.agentDistribution).length > 0) {
      console.log("7. Top Agents (by call volume)");
      console.log("-".repeat(80));
      Object.entries(stats.agentDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([agent, count]) => {
          const percentage = Math.round((count / stats.totalCalls) * 100);
          console.log(`   ${agent}: ${count} calls (${percentage}%)`);
        });
      console.log();
    }

    // Wrap-up codes
    if (Object.keys(stats.wrapUpCodeDistribution).length > 0) {
      console.log("8. Wrap-Up Code Distribution");
      console.log("-".repeat(80));
      Object.entries(stats.wrapUpCodeDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([code, count]) => {
          const percentage = Math.round((count / stats.totalCalls) * 100);
          console.log(`   ${code}: ${count} calls (${percentage}%)`);
        });
      console.log();
    }

    // Hourly distribution
    if (Object.keys(stats.hourlyDistribution).length > 0) {
      console.log("9. Hourly Call Distribution");
      console.log("-".repeat(80));
      Object.entries(stats.hourlyDistribution)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([hour, count]) => {
          const bar = "█".repeat(Math.ceil((count / stats.totalCalls) * 50));
          console.log(`   ${hour}: ${bar} ${count}`);
        });
      console.log();
    }

    // Data quality assessment
    console.log("10. Data Quality Assessment");
    console.log("-".repeat(80));

    const totalMissingFields = Object.values(stats.missingFields).reduce((a, b) => a + b, 0);

    if (totalMissingFields === 0) {
      console.log("✅ All critical fields present in all interactions");
    } else {
      console.log("⚠️  Missing Fields Detected:");
      Object.entries(stats.missingFields).forEach(([field, count]) => {
        if (count > 0) {
          const percentage = Math.round((count / stats.totalCalls) * 100);
          console.log(`   ${field}: ${count} missing (${percentage}%)`);
        }
      });
    }
    console.log();

    // Sample interaction
    console.log("11. Sample Interaction (Most Recent)");
    console.log("-".repeat(80));
    const sample = result.interactions[0];
    console.log(`   Session ID: ${sample.sessionId}`);
    console.log(`   Contact ID: ${sample.contactId || "N/A"}`);
    console.log(`   Case Number: ${sample.caseNumber || "N/A"}`);
    console.log(`   Direction: ${sample.direction || "N/A"}`);
    console.log(`   ANI (Caller): ${sample.ani || "N/A"}`);
    console.log(`   DNIS (Called): ${sample.dnis || "N/A"}`);
    console.log(`   Agent: ${sample.agentName || "N/A"} (${sample.agentId || "N/A"})`);
    console.log(`   Queue: ${sample.queueName || "N/A"}`);
    console.log(`   Start: ${sample.startTime ? sample.startTime.toISOString() : "N/A"}`);
    console.log(`   End: ${sample.endTime ? sample.endTime.toISOString() : "N/A"}`);
    console.log(`   Duration: ${sample.durationSeconds ? formatDuration(sample.durationSeconds) : "N/A"}`);
    console.log(`   Wrap-Up: ${sample.wrapUpCode || "N/A"}`);
    console.log(`   Recording: ${sample.recordingId || "N/A"}`);
    console.log();
    console.log("   Raw Payload (first 500 chars):");
    console.log(`   ${JSON.stringify(sample.rawPayload).substring(0, 500)}...`);
    console.log();

    // Production readiness assessment
    console.log("12. Production Readiness Assessment");
    console.log("-".repeat(80));

    const checks = {
      "API Connectivity": true,
      "OAuth Authentication": true,
      "Data Retrieval": result.interactions.length > 0,
      "Data Quality": totalMissingFields / stats.totalCalls < 0.1, // < 10% missing
      "Performance": queryTime < 10000, // < 10 seconds
      "Recording Availability": stats.callsWithRecording > 0,
      "Case Linking": stats.callsWithCaseNumber > 0,
    };

    let passCount = 0;
    Object.entries(checks).forEach(([check, passed]) => {
      const status = passed ? "✅" : "⚠️ ";
      console.log(`   ${status} ${check}`);
      if (passed) passCount++;
    });
    console.log();

    const readinessScore = Math.round((passCount / Object.keys(checks).length) * 100);

    console.log(`   Production Readiness Score: ${readinessScore}%`);
    console.log();

    if (readinessScore >= 80) {
      console.log("✅ PRODUCTION READY - Integration is working correctly");
      console.log();
      console.log("Next Steps:");
      console.log("   1. Deploy to staging environment");
      console.log("   2. Configure cron job (recommended: every 10 minutes)");
      console.log("   3. Set up monitoring and alerting");
      console.log("   4. Test ServiceNow work note creation");
      console.log("   5. Implement recording/transcript pipeline (future)");
    } else {
      console.log("⚠️  NEEDS ATTENTION - Some checks failed");
      console.log();
      console.log("Recommended Actions:");
      if (!checks["Data Quality"]) {
        console.log("   • Investigate missing fields in API responses");
      }
      if (!checks["Performance"]) {
        console.log("   • Optimize query parameters or increase timeout");
      }
      if (!checks["Recording Availability"]) {
        console.log("   • Verify recording feature is enabled in Contact Center");
      }
      if (!checks["Case Linking"]) {
        console.log("   • Ensure case number is passed in interaction attributes");
      }
    }

    console.log();
    console.log("=".repeat(80));
    console.log(`✅ VALIDATION COMPLETE - ${stats.totalCalls} calls analyzed`);
    console.log("=".repeat(80));

  } catch (error) {
    console.error("❌ VALIDATION FAILED");
    console.error();

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error();

      if (error.message.includes("401")) {
        console.error("   Authentication failed - check credentials");
      } else if (error.message.includes("403")) {
        console.error("   Forbidden - verify OAuth scopes");
      } else if (error.message.includes("404")) {
        console.error("   Not found - check API endpoint and region");
      } else if (error.message.includes("timeout")) {
        console.error("   Request timeout - API may be slow");
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
