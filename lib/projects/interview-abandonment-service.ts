/**
 * Interview Abandonment Service
 * Detects interviews started but not completed within 24 hours
 * Marks as abandoned and triggers waitlist promotion
 *
 * Runs as periodic cron job (every 6 hours)
 */

import { and, isNull, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { projectInterviews } from "../db/schema";
import { getSlackMessagingService } from "../services/slack-messaging";
import * as interestRepository from "../db/repositories/interest-repository";
import * as waitlistService from "./waitlist-service";

const ABANDONMENT_THRESHOLD_HOURS = 24;

export interface AbandonmentSweepResult {
  checked: number;
  marked: number;
  promotions: number;
  errors: number;
}

/**
 * Sweep for abandoned interviews
 * Interviews are considered abandoned if:
 * 1. Interview was started (has startedAt)
 * 2. Never completed (completedAt is NULL)
 * 3. Started >24 hours ago
 * 4. Status is not "completed" in DB
 *
 * Called by: cron job (every 6 hours)
 */
export async function sweepAbandonedInterviews(): Promise<AbandonmentSweepResult> {
  const db = getDb();
  if (!db) {
    console.error("[Abandonment Sweep] Database not available");
    return { checked: 0, marked: 0, promotions: 0, errors: 0 };
  }

  const result: AbandonmentSweepResult = {
    checked: 0,
    marked: 0,
    promotions: 0,
    errors: 0,
  };

  try {
    const cutoffTime = new Date(Date.now() - ABANDONMENT_THRESHOLD_HOURS * 60 * 60 * 1000);

    console.log("[Abandonment Sweep] Starting sweep", {
      cutoffTime: cutoffTime.toISOString(),
      thresholdHours: ABANDONMENT_THRESHOLD_HOURS,
    });

    // Find interviews started but never completed, older than threshold
    const abandonedInterviews = await db
      .select()
      .from(projectInterviews)
      .where(
        and(
          isNull(projectInterviews.completedAt), // Not completed
          lt(projectInterviews.startedAt, cutoffTime), // Started >24h ago
        )
      );

    result.checked = abandonedInterviews.length;
    console.log(`[Abandonment Sweep] Found ${abandonedInterviews.length} potentially abandoned interviews`);

    // Process each abandoned interview
    for (const interview of abandonedInterviews) {
      try {
        // Find linked interest record
        const interest = await interestRepository.findInterest(
          interview.projectId,
          interview.candidateSlackId,
        );

        if (!interest) {
          console.warn(
            "[Abandonment Sweep] Interview has no linked interest (data inconsistency)",
            {
              interviewId: interview.id,
              projectId: interview.projectId,
              candidateId: interview.candidateSlackId,
            },
          );
          continue;
        }

        // Only mark as abandoned if currently interviewing
        if (interest.status !== "interviewing") {
          console.log(
            "[Abandonment Sweep] Interview interest already resolved, skipping",
            {
              interestId: interest.id,
              currentStatus: interest.status,
            },
          );
          continue;
        }

        // Mark interest as abandoned
        await interestRepository.markAbandoned(interest.id);
        result.marked++;

        console.log("[Abandonment Sweep] Marked interview as abandoned", {
          interestId: interest.id,
          candidateId: interview.candidateSlackId,
          projectId: interview.projectId,
          minutesOverdue: Math.floor(
            (Date.now() - interview.startedAt.getTime()) / 1000 / 60,
          ),
        });

        // Try to promote from waitlist
        try {
          await waitlistService.onInterviewRejected(interview.projectId, interview.candidateSlackId);
          result.promotions++;
        } catch (promoteError) {
          console.error("[Abandonment Sweep] Failed to promote after abandonment", {
            projectId: interview.projectId,
            error: promoteError,
          });
          result.errors++;
        }

        // Optionally notify candidate
        try {
          await sendAbandonmentNotification(interview.candidateSlackId, interview.projectId);
        } catch (notifyError) {
          console.warn("[Abandonment Sweep] Failed to notify candidate of abandonment", {
            candidateId: interview.candidateSlackId,
            error: notifyError,
          });
          // Don't count as error — notification is best-effort
        }
      } catch (error) {
        console.error("[Abandonment Sweep] Error processing interview", {
          interviewId: interview.id,
          error,
        });
        result.errors++;
      }
    }

    console.log("[Abandonment Sweep] Sweep complete", result);
    return result;
  } catch (error) {
    console.error("[Abandonment Sweep] Fatal error during sweep", error);
    result.errors++;
    return result;
  }
}

/**
 * Send DM notification to candidate about abandoned interview
 * Lets them know they can reapply
 */
async function sendAbandonmentNotification(
  candidateId: string,
  projectId: string,
): Promise<void> {
  const slackMessaging = getSlackMessagingService();
  const dmConversation = await slackMessaging.openConversation(candidateId);

  if (!dmConversation.channelId) {
    console.warn("[Abandonment Sweep] Failed to open DM for notification", { candidateId });
    return;
  }

  const message = [
    `We haven't heard from you in 24 hours, so we've closed your interview.`,
    `No worries! You can apply again anytime and we'll give you another chance.`,
  ].join("\n");

  await slackMessaging.postMessage({
    channel: dmConversation.channelId,
    text: message,
  });
}

/**
 * Get abandonment metrics
 * Useful for dashboards and monitoring
 */
export async function getAbandonmentMetrics() {
  const db = getDb();
  if (!db) {
    return {
      totalAbandoned: 0,
      recentAbandoned: 0,
      abandonmentRate: 0,
    };
  }

  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get all interviews without completion
    const totalAbandoned = await db
      .select()
      .from(projectInterviews)
      .where(isNull(projectInterviews.completedAt));

    // Get recent abandonments (in last 24h)
    const recentAbandoned = await db
      .select()
      .from(projectInterviews)
      .where(
        and(
          isNull(projectInterviews.completedAt),
          lt(projectInterviews.startedAt, cutoffTime),
        ),
      );

    // Calculate abandonment rate
    const allInterviews = await db.select().from(projectInterviews);
    const abandonmentRate =
      allInterviews.length > 0
        ? Math.round((totalAbandoned.length / allInterviews.length) * 100)
        : 0;

    return {
      totalAbandoned: totalAbandoned.length,
      recentAbandoned: recentAbandoned.length,
      abandonmentRate,
    };
  } catch (error) {
    console.error("[Abandonment] Error getting metrics", error);
    return {
      totalAbandoned: 0,
      recentAbandoned: 0,
      abandonmentRate: 0,
    };
  }
}

/**
 * Manual cleanup utility
 * Rescan and fix any interviews with inconsistent state
 */
export async function fixInconsistencies(): Promise<{ fixed: number; errors: number }> {
  const db = getDb();
  if (!db) {
    return { fixed: 0, errors: 0 };
  }

  let fixed = 0;
  let errors = 0;

  try {
    // Find interviews without linked interests
    const orphanedInterviews = await db
      .select()
      .from(projectInterviews)
      .where(isNull(projectInterviews.interestId));

    console.log("[Abandonment] Found orphaned interviews:", orphanedInterviews.length);

    for (const interview of orphanedInterviews) {
      try {
        // Try to find or create interest
        let interest = await interestRepository.findInterest(
          interview.projectId,
          interview.candidateSlackId,
        );

        if (!interest) {
          // Create one
          interest = await interestRepository.createInterest(
            interview.projectId,
            interview.candidateSlackId,
            interview.completedAt ? "rejected" : "abandoned", // Assume abandoned if not completed
          );
        }

        // Link to interview
        if (interest) {
          await db
            .update(projectInterviews)
            .set({ interestId: interest.id })
            .where((t) => t.id === interview.id);

          fixed++;
        }
      } catch (error) {
        console.error("[Abandonment] Error fixing interview", { interviewId: interview.id, error });
        errors++;
      }
    }

    console.log("[Abandonment] Inconsistency fix complete", { fixed, errors });
    return { fixed, errors };
  } catch (error) {
    console.error("[Abandonment] Fatal error during inconsistency fix", error);
    return { fixed, errors: 1 };
  }
}
