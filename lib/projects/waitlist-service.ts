/**
 * Waitlist Promotion Service
 * Handles promotion of candidates from waitlist to pending when slots open
 * Triggered by: interview acceptance, rejection, withdrawal, or manual admin action
 */

import { getSlackMessagingService } from "../services/slack-messaging";
import * as interestRepository from "../db/repositories/interest-repository";
import { shouldPromoteFromWaitlist } from "./capacity";
import { getProjectById } from "./catalog";
import type { ProjectDefinition } from "./types";

export interface WaitlistPromotionEvent {
  projectId: string;
  triggeredBy: "interview_accepted" | "interview_rejected" | "candidate_withdrew" | "manual_admin";
  mentorId?: string;
  timestamp: Date;
}

/**
 * Trigger 1: Interview accepted (score >= 70)
 * Called from: lib/projects/interview-session.ts persistInterviewResult()
 *
 * When a candidate is accepted, we have capacity to promote next in line
 */
export async function onInterviewAccepted(
  projectId: string,
  acceptedCandidateId: string,
): Promise<void> {
  try {
    console.log(`[Waitlist] Interview accepted, checking for promotion opportunity`, {
      projectId,
      acceptedCandidateId,
    });

    await promoteFromWaitlist({
      projectId,
      triggeredBy: "interview_accepted",
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[Waitlist] Error in onInterviewAccepted", { projectId, error });
    // Don't throw — acceptance should complete even if promotion fails
  }
}

/**
 * Trigger 2: Interview rejected (score < 70)
 * Called from: lib/projects/interview-session.ts persistInterviewResult()
 *
 * Rejection doesn't fill a slot, but we should move rejected candidate out of pending
 * to make room for next waitlist candidate
 */
export async function onInterviewRejected(
  projectId: string,
  rejectedCandidateId: string,
): Promise<void> {
  try {
    console.log(`[Waitlist] Interview rejected, checking for promotion opportunity`, {
      projectId,
      rejectedCandidateId,
    });

    await promoteFromWaitlist({
      projectId,
      triggeredBy: "interview_rejected",
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[Waitlist] Error in onInterviewRejected", { projectId, error });
  }
}

/**
 * Trigger 3: Candidate explicitly withdraws
 * Called from: /api/projects/withdraw endpoint (future)
 *
 * User decides to withdraw their application, freeing a slot
 */
export async function onCandidateWithdrew(
  projectId: string,
  candidateId: string,
): Promise<void> {
  try {
    console.log(`[Waitlist] Candidate withdrew, marking abandoned and checking promotion`, {
      projectId,
      candidateId,
    });

    // Find and mark as abandoned
    const interest = await interestRepository.findInterest(projectId, candidateId);
    if (interest && interest.status !== "abandoned") {
      await interestRepository.markAbandoned(interest.id);
    }

    // Promote next in line
    await promoteFromWaitlist({
      projectId,
      triggeredBy: "candidate_withdrew",
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[Waitlist] Error in onCandidateWithdrew", { projectId, error });
  }
}

/**
 * Trigger 4: Admin increases maxCandidates
 * Called from: /api/admin/projects/:id/update-capacity (future)
 *
 * When mentor increases slots, promote N candidates from waitlist
 */
export async function onMaxCandidatesIncreased(
  projectId: string,
  previousMax: number,
  newMax: number,
): Promise<void> {
  try {
    const slotsAdded = newMax - previousMax;
    console.log(`[Waitlist] maxCandidates increased, promoting up to ${slotsAdded} candidates`, {
      projectId,
      previousMax,
      newMax,
    });

    // Promote multiple times (once per new slot)
    for (let i = 0; i < slotsAdded; i++) {
      await promoteFromWaitlist({
        projectId,
        triggeredBy: "manual_admin",
        timestamp: new Date(),
      });
    }
  } catch (error) {
    console.error("[Waitlist] Error in onMaxCandidatesIncreased", { projectId, error });
  }
}

/**
 * Core promotion logic
 * Checks if slot available and promotes next candidate from waitlist
 */
async function promoteFromWaitlist(event: WaitlistPromotionEvent): Promise<void> {
  try {
    // Fetch project
    const project = await getProjectById(event.projectId);
    if (!project) {
      console.warn("[Waitlist] Project not found during promotion", { projectId: event.projectId });
      return;
    }

    // Check if we should promote (has capacity + waitlist not empty)
    const shouldPromote = await shouldPromoteFromWaitlist(project);
    if (!shouldPromote) {
      console.log("[Waitlist] No promotion needed", {
        projectId: project.id,
        reason: "Either at capacity or no waitlist",
      });
      return;
    }

    // Get next candidate in line
    const nextCandidate = await interestRepository.getNextInWaitlist(project.id);
    if (!nextCandidate) {
      console.log("[Waitlist] No one on waitlist to promote", { projectId: project.id });
      return;
    }

    console.log("[Waitlist] Promoting candidate from waitlist", {
      projectId: project.id,
      candidateId: nextCandidate.candidateSlackId,
      interestId: nextCandidate.id,
    });

    // Update status from waitlist to pending
    await interestRepository.updateInterestStatus(nextCandidate.id, "pending");

    // Notify candidate via DM
    await sendWaitlistPromotionNotification(project, nextCandidate.candidateSlackId);
  } catch (error) {
    console.error("[Waitlist] Error during promotion", { event, error });
    // Log but don't throw — we don't want promotion failures to block upstream logic
  }
}

/**
 * Send DM notification to promoted candidate
 * Invites them to interview or take next step
 */
async function sendWaitlistPromotionNotification(
  project: ProjectDefinition,
  candidateId: string,
): Promise<void> {
  try {
    const slackMessaging = getSlackMessagingService();
    const dmConversation = await slackMessaging.openConversation(candidateId);

    if (!dmConversation.channelId) {
      console.warn("[Waitlist] Failed to open DM for promotion notification", { candidateId });
      return;
    }

    const message = [
      `🎉 Great news! A slot just opened for *${project.name}*.`,
      "",
      `You've been moved to the top of our list. Ready to interview?`,
      `Just reply "ready" or "yes" and I'll send you the interview questions.`,
      "",
      `(If you're no longer interested, you can say "withdraw" or we'll keep you in mind for future opportunities.)`,
    ].join("\n");

    await slackMessaging.postMessage({
      channel: dmConversation.channelId,
      text: message,
    });
  } catch (error) {
    console.error("[Waitlist] Failed to send promotion notification", {
      candidateId,
      projectId: project.id,
      error,
    });
    // Don't throw — notification failure shouldn't block promotion
  }
}

/**
 * Get waitlist metrics for a project
 * Useful for dashboards and reporting
 */
export async function getWaitlistMetrics(projectId: string) {
  try {
    const waitlist = await interestRepository.getWaitlist(projectId);
    const stats = await interestRepository.getProjectInterestStats(projectId);

    return {
      waitlistSize: waitlist.length,
      waitlistOldestWaitTime:
        waitlist.length > 0
          ? Math.floor((Date.now() - waitlist[0].createdAt.getTime()) / 1000 / 60) // minutes
          : 0,
      activeApplications: stats.interviewing + stats.pending,
      acceptedCandidates: stats.accepted,
      rejectedCandidates: stats.rejected,
      abandonedCandidates: stats.abandoned,
    };
  } catch (error) {
    console.error("[Waitlist] Error getting metrics", { projectId, error });
    return {
      waitlistSize: 0,
      waitlistOldestWaitTime: 0,
      activeApplications: 0,
      acceptedCandidates: 0,
      rejectedCandidates: 0,
      abandonedCandidates: 0,
    };
  }
}
