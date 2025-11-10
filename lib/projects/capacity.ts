/**
 * Project Capacity Management
 * Handles checking project capacity, waitlist management, and slot availability
 */

import { getActiveInterestCount, getWaitlist } from "../db/repositories/interest-repository";
import type { ProjectDefinition } from "./types";

export interface CapacityStatus {
  maxCandidates: number | null;
  currentApplications: number;
  isFull: boolean;
  availableSlots: number;
  waitlistSize: number;
  canApply: boolean;
}

/**
 * Check if a project has available capacity
 * Returns false if maxCandidates is reached, true otherwise
 */
export async function checkCapacity(project: ProjectDefinition): Promise<boolean> {
  // No limit if maxCandidates not set
  if (project.maxCandidates == null) {
    return true;
  }

  try {
    const activeCount = await getActiveInterestCount(project.id);
    return activeCount < project.maxCandidates;
  } catch (error) {
    console.error("[Capacity] Failed to check capacity", { projectId: project.id, error });
    // Default to allowing applications if check fails
    return true;
  }
}

/**
 * Get detailed capacity status for a project
 * Useful for UI rendering and decision making
 */
export async function getProjectCapacityStatus(
  project: ProjectDefinition,
): Promise<CapacityStatus> {
  const maxCandidates = project.maxCandidates ?? null;
  const hasCapacityLimit = maxCandidates !== null;

  try {
    const activeCount = await getActiveInterestCount(project.id);
    const waitlist = await getWaitlist(project.id);

    const isFull = hasCapacityLimit ? activeCount >= maxCandidates : false;
    const availableSlots = hasCapacityLimit ? Math.max(0, maxCandidates - activeCount) : Infinity;

    return {
      maxCandidates,
      currentApplications: activeCount,
      isFull,
      availableSlots: availableSlots === Infinity ? -1 : availableSlots,
      waitlistSize: waitlist.length,
      canApply: !isFull,
    };
  } catch (error) {
    console.error("[Capacity] Failed to get capacity status", {
      projectId: project.id,
      error,
    });

    return {
      maxCandidates,
      currentApplications: 0,
      isFull: false,
      availableSlots: maxCandidates ?? -1,
      waitlistSize: 0,
      canApply: true,
    };
  }
}

/**
 * Format capacity status for display
 * Returns a human-readable message about project capacity
 */
export function formatCapacityMessage(status: CapacityStatus): string {
  if (status.maxCandidates == null) {
    return "Unlimited slots available";
  }

  const { currentApplications, maxCandidates, isFull, waitlistSize } = status;

  if (isFull) {
    if (waitlistSize > 0) {
      return `🔴 Project Full • ${waitlistSize} on waitlist`;
    }
    return "🔴 Project Full";
  }

  const remaining = maxCandidates - currentApplications;
  if (remaining === 1) {
    return `🟡 1 slot remaining`;
  }
  if (remaining <= 3) {
    return `🟡 ${remaining} slots remaining`;
  }

  return `🟢 ${remaining} slots available`;
}

/**
 * Check if project is accepting new applications
 * Returns true if project can still accept applications
 */
export async function isProjectAcceptingApplications(
  project: ProjectDefinition,
): Promise<boolean> {
  // Check capacity
  const hasCapacity = await checkCapacity(project);
  if (!hasCapacity) {
    return false;
  }

  // Check if project is active (not expired, not archived)
  if (project.status !== "active" && project.status !== "posted") {
    return false;
  }

  // Check if project hasn't expired
  if (project.expiresDate) {
    const expires =
      typeof project.expiresDate === "string"
        ? new Date(project.expiresDate)
        : new Date(project.expiresDate);
    if (!Number.isNaN(expires.getTime()) && new Date() > expires) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate how many slots will open when someone is accepted/rejected
 * Used for waitlist promotion logic
 */
export function calculateNewAvailableSlots(
  currentStatus: CapacityStatus,
  action: "accept" | "reject" | "abandon",
): number {
  if (currentStatus.maxCandidates == null) {
    return 0;
  }

  // Only "accept" frees up a slot by moving an interviewed candidate to accepted
  // "reject" and "abandon" just remove candidates from active count
  if (action === "accept") {
    return 1;
  }

  // rejection and abandonment don't free slots, they just reduce active count
  return 0;
}

/**
 * Check if a candidate should be promoted from waitlist
 * Returns true if there are available slots and someone on waitlist
 */
export async function shouldPromoteFromWaitlist(
  project: ProjectDefinition,
): Promise<boolean> {
  if (!project.maxCandidates) {
    return false;
  }

  try {
    const status = await getProjectCapacityStatus(project);
    return status.availableSlots > 0 && status.waitlistSize > 0;
  } catch (error) {
    console.error("[Capacity] Failed to check waitlist promotion", {
      projectId: project.id,
      error,
    });
    return false;
  }
}
