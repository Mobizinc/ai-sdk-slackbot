/**
 * Cron Job Setup
 * Initialize recurring background tasks
 *
 * Supports two modes:
 * 1. In-process cron (node-cron): Simple, single-server deployments
 * 2. External cron triggers: Scalable, cloud-native deployments
 */

import { sweepAbandonedInterviews } from "../projects/interview-abandonment-service";

/**
 * Initialize cron jobs
 * Called once on server startup
 *
 * For Vercel/cloud deployments, skip this and use /api/internal/sweep-abandonments endpoint instead
 */
export async function setupCronJobs(): Promise<void> {
  // Check if cron is enabled (disable on cloud platforms that don't support long-running processes)
  if (process.env.CRON_DISABLED === "true") {
    console.log("[Cron] Cron jobs disabled via CRON_DISABLED env var");
    return;
  }

  // Try to use node-cron if available
  try {
    const cron = await import("node-cron");

    // Schedule: Every 6 hours (0, 6, 12, 18 UTC)
    const abandonmentSweepSchedule = "0 */6 * * *";

    cron.schedule(abandonmentSweepSchedule, async () => {
      console.log("[Cron] Running interview abandonment sweep...");
      try {
        const result = await sweepAbandonedInterviews();
        console.log("[Cron] Abandonment sweep completed", result);

        // Alert if high error rate
        if (result.errors > 0) {
          console.warn("[Cron] Abandonment sweep had errors", {
            errors: result.errors,
            marked: result.marked,
          });
        }
      } catch (error) {
        console.error("[Cron] Abandonment sweep failed", error);
      }
    });

    console.log(`[Cron] Interview abandonment sweep scheduled: ${abandonmentSweepSchedule}`);
    console.log("[Cron] Jobs initialized");
  } catch (error) {
    // node-cron not available (expected on serverless platforms)
    console.log(
      "[Cron] node-cron not available — use /api/internal/sweep-abandonments endpoint instead",
      { error: (error as any)?.message },
    );
  }
}

/**
 * For testing: manually trigger sweep
 */
export async function triggerAbandonmentSweep(): Promise<void> {
  console.log("[Cron] Manual abandonment sweep triggered");
  const result = await sweepAbandonedInterviews();
  console.log("[Cron] Manual sweep completed", result);
}
