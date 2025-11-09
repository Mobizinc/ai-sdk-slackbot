/**
 * Project Interactivity Helpers
 * Extracted from api/interactivity.ts for testability and reusability
 * Handles: button clicks, duplicate detection, capacity checks, interest creation
 */

import { getSlackMessagingService } from "../services/slack-messaging";
import * as interestRepository from "../db/repositories/interest-repository";
import { checkCapacity } from "./capacity";
import type { ProjectDefinition } from "./types";

/**
 * Result of "I'm Interested" button click
 */
export interface InterestButtonResult {
  status: "interview_started" | "already_applied" | "waitlisted";
  message: string;
  interestId?: string;
}

/**
 * Result of "Join Waitlist" button click
 */
export interface WaitlistButtonResult {
  status: "waitlisted" | "already_waiting" | "already_applied";
  message: string;
  position?: number;
}

/**
 * Handle "I'm Interested" button click
 * Flow: duplicate check → capacity check → interest creation → interview start signal
 *
 * @returns Result with status and message for user feedback
 */
export async function handleInterestButtonClick(
  project: ProjectDefinition,
  userId: string,
  userName: string,
): Promise<InterestButtonResult> {
  try {
    // Step 1: Check for duplicate application (unless abandoned)
    const existingInterest = await interestRepository.findInterest(project.id, userId);

    if (existingInterest && existingInterest.status !== "abandoned") {
      // User has active interest — block re-application
      return {
        status: "already_applied",
        message: `You've already applied to *${project.name}*. We'll review your application soon.`,
      };
    }

    // Step 2: Check project capacity
    const hasCapacity = await checkCapacity(project);

    if (!hasCapacity) {
      // Project is full — add to waitlist
      let interest = existingInterest;

      if (!interest) {
        interest = await interestRepository.createInterest(project.id, userId, "waitlist");
      } else {
        // Update abandoned to waitlist
        await interestRepository.updateInterestStatus(interest.id, "waitlist");
      }

      return {
        status: "waitlisted",
        message: `*${project.name}* is currently at full capacity. You've been added to the waitlist!`,
        interestId: interest?.id,
      };
    }

    // Step 3: Create or update interest record
    let interest = existingInterest;

    if (!interest) {
      interest = await interestRepository.createInterest(project.id, userId, "pending");
    } else {
      // Retry for abandoned — restore to pending
      await interestRepository.updateInterestStatus(interest.id, "pending");
    }

    if (!interest) {
      throw new Error("Failed to create interest record");
    }

    // Step 4: Return success — caller will start interview
    return {
      status: "interview_started",
      message: `Starting interview for *${project.name}*...`,
      interestId: interest.id,
    };
  } catch (error) {
    console.error("[Project Interactivity] Error handling interest button click", {
      projectId: project.id,
      userId,
      error,
    });
    throw error;
  }
}

/**
 * Handle "Join Waitlist" button click
 * Flow: check existing status → create or update interest → return position
 *
 * @returns Result with status, message, and position in waitlist
 */
export async function handleWaitlistButtonClick(
  project: ProjectDefinition,
  userId: string,
): Promise<WaitlistButtonResult> {
  try {
    const existingInterest = await interestRepository.findInterest(project.id, userId);

    // Case 1: Already on waitlist
    if (existingInterest?.status === "waitlist") {
      const waitlist = await interestRepository.getWaitlist(project.id);
      const position = waitlist.findIndex((i) => i.id === existingInterest.id) + 1;

      return {
        status: "already_waiting",
        message: `You're already on the waitlist at position #${position}.`,
        position,
      };
    }

    // Case 2: Already applied (not abandoned)
    if (existingInterest && existingInterest.status !== "abandoned") {
      return {
        status: "already_applied",
        message: `You've already applied to *${project.name}*. We'll review your application soon.`,
      };
    }

    // Case 3: Create new waitlist entry (or restore from abandoned)
    let interest = existingInterest;

    if (!interest) {
      interest = await interestRepository.createInterest(project.id, userId, "waitlist");
    } else {
      await interestRepository.updateInterestStatus(interest.id, "waitlist");
    }

    if (!interest) {
      throw new Error("Failed to create waitlist interest");
    }

    // Get position in queue
    const waitlist = await interestRepository.getWaitlist(project.id);
    const position = waitlist.findIndex((i) => i.id === interest.id) + 1;

    return {
      status: "waitlisted",
      message: `You've been added to the waitlist at position #${position}. We'll notify you when a slot opens!`,
      position,
      interestId: interest.id,
    };
  } catch (error) {
    console.error("[Project Interactivity] Error handling waitlist button click", {
      projectId: project.id,
      userId,
      error,
    });
    throw error;
  }
}

/**
 * Send immediate DM feedback to user after button click
 * Ensures user sees their status in DM, not just waiting for blocks update
 *
 * Called immediately after button click, before any async interview logic
 */
export async function sendButtonActionFeedback(
  userId: string,
  projectName: string,
  result: InterestButtonResult | WaitlistButtonResult,
): Promise<void> {
  try {
    const slackMessaging = getSlackMessagingService();
    const dmConversation = await slackMessaging.openConversation(userId);

    if (!dmConversation.channelId) {
      console.warn("[Project Interactivity] Failed to open DM for feedback", { userId });
      return;
    }

    // Select emoji based on status
    const emoji = {
      interview_started: "🚀",
      waitlisted: "⏳",
      already_applied: "✅",
      already_waiting: "⏳",
    }[result.status] || "📝";

    const position =
      result.status === "waitlisted" && "position" in result && result.position
        ? ` (Position #${result.position})`
        : "";

    const dmText = `${emoji} ${result.message}${position}`;

    await slackMessaging.postMessage({
      channel: dmConversation.channelId,
      text: dmText,
    });
  } catch (error) {
    console.error("[Project Interactivity] Failed to send button feedback DM", {
      userId,
      projectName,
      error,
    });
    // Don't throw — silently fail, button interaction already logged
  }
}

/**
 * Learn More button helper (for reference)
 * Send project background/details to user
 */
export async function handleLearnMoreClick(
  project: ProjectDefinition,
  userId: string,
): Promise<void> {
  const slackMessaging = getSlackMessagingService();
  const dmConversation = await slackMessaging.openConversation(userId);

  if (!dmConversation.channelId) {
    console.warn("[Project Interactivity] Failed to open DM for learn more", { userId });
    return;
  }

  const content = [
    `📚 *About ${project.name}*`,
    "",
    project.background || "No background details available yet.",
    "",
    project.techStack?.length ? `*Tech: ${project.techStack.join(", ")}*` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await slackMessaging.postMessage({
    channel: dmConversation.channelId,
    text: content,
  });
}
