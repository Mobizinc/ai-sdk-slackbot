import { and, eq, ne, desc, gte, lte } from "drizzle-orm";
import { getDb } from "../client";
import {
  projectInterests,
  type ProjectInterest,
  type NewProjectInterest,
} from "../schema";

/**
 * Create a new interest record when candidate clicks "I'm Interested"
 * Tracks candidate interest status and prevents duplicate applications
 */
export async function createInterest(
  projectId: string,
  candidateSlackId: string,
  status: string = "pending",
): Promise<ProjectInterest | null> {
  const db = getDb();
  if (!db) {
    console.error("[InterestRepository] Database not available");
    return null;
  }

  try {
    const [created] = await db
      .insert(projectInterests)
      .values({
        projectId,
        candidateSlackId,
        status,
      })
      .returning();
    return created ?? null;
  } catch (error) {
    console.error("[InterestRepository] Failed to create interest", {
      projectId,
      candidateSlackId,
      error,
    });
    return null;
  }
}

/**
 * Check if candidate has already applied to this project
 * Returns the most recent interest record if it exists
 */
export async function findInterest(
  projectId: string,
  candidateSlackId: string,
): Promise<ProjectInterest | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [interest] = await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          eq(projectInterests.candidateSlackId, candidateSlackId),
        ),
      )
      .orderBy(desc(projectInterests.createdAt))
      .limit(1);
    return interest ?? null;
  } catch (error) {
    console.error("[InterestRepository] Failed to find interest", {
      projectId,
      candidateSlackId,
      error,
    });
    return null;
  }
}

/**
 * Check if candidate has an active (non-abandoned) interest in this project
 * Returns true if they have any interest other than abandoned
 */
export async function hasActiveInterest(
  projectId: string,
  candidateSlackId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    const [interest] = await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          eq(projectInterests.candidateSlackId, candidateSlackId),
          ne(projectInterests.status, "abandoned"),
        ),
      )
      .limit(1);
    return !!interest;
  } catch (error) {
    console.error("[InterestRepository] Failed to check active interest", {
      projectId,
      candidateSlackId,
      error,
    });
    return false;
  }
}

/**
 * Fetch an interest record by id
 */
export async function getInterestById(interestId: string): Promise<ProjectInterest | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [interest] = await db
      .select()
      .from(projectInterests)
      .where(eq(projectInterests.id, interestId))
      .limit(1);
    return interest ?? null;
  } catch (error) {
    console.error("[InterestRepository] Failed to fetch interest by id", {
      interestId,
      error,
    });
    return null;
  }
}

/**
 * Update interest status (e.g., pending → interviewing → accepted/rejected)
 */
export async function updateInterestStatus(
  interestId: string,
  status: string,
  interviewId?: string,
): Promise<ProjectInterest | null> {
  const db = getDb();
  if (!db) {
    console.error("[InterestRepository] Database not available");
    return null;
  }

  try {
    const updates: any = {
      status,
      updatedAt: new Date(),
    };

    if (interviewId) {
      updates.interviewId = interviewId;
    }

    if (status === "abandoned") {
      updates.abandonedAt = new Date();
    }

    const [updated] = await db
      .update(projectInterests)
      .set(updates)
      .where(eq(projectInterests.id, interestId))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error("[InterestRepository] Failed to update interest status", {
      interestId,
      status,
      error,
    });
    return null;
  }
}

/**
 * Get count of active interests for a project (for capacity checks)
 * Only counts non-abandoned, non-waitlist interests
 */
export async function getActiveInterestCount(projectId: string): Promise<number> {
  const db = getDb();
  if (!db) {
    return 0;
  }

  try {
    const interests = await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          ne(projectInterests.status, "abandoned"),
          ne(projectInterests.status, "waitlist"),
          ne(projectInterests.status, "rejected"),
        ),
      );
    return interests.length;
  } catch (error) {
    console.error("[InterestRepository] Failed to get active interest count", {
      projectId,
      error,
    });
    return 0;
  }
}

/**
 * Get waitlist for a project (candidates waiting for a slot)
 * Returns interests with "waitlist" status, ordered by creation time
 */
export async function getWaitlist(projectId: string): Promise<ProjectInterest[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          eq(projectInterests.status, "waitlist"),
        ),
      )
      .orderBy(projectInterests.createdAt);
  } catch (error) {
    console.error("[InterestRepository] Failed to get waitlist", { projectId, error });
    return [];
  }
}

/**
 * Get the next person on the waitlist
 */
export async function getNextInWaitlist(projectId: string): Promise<ProjectInterest | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [next] = await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          eq(projectInterests.status, "waitlist"),
        ),
      )
      .orderBy(projectInterests.createdAt)
      .limit(1);
    return next ?? null;
  } catch (error) {
    console.error("[InterestRepository] Failed to get next in waitlist", {
      projectId,
      error,
    });
    return null;
  }
}

/**
 * Mark an interest as abandoned (user didn't complete interview)
 */
export async function markAbandoned(interestId: string): Promise<ProjectInterest | null> {
  return updateInterestStatus(interestId, "abandoned");
}

/**
 * Get all interests for a candidate across all projects
 */
export async function getInterestsByCandidate(
  candidateSlackId: string,
): Promise<ProjectInterest[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterests)
      .where(eq(projectInterests.candidateSlackId, candidateSlackId))
      .orderBy(desc(projectInterests.createdAt));
  } catch (error) {
    console.error("[InterestRepository] Failed to get candidate interests", {
      candidateSlackId,
      error,
    });
    return [];
  }
}

/**
 * Get completed interviews for a project (those with accepted status)
 */
export async function getAcceptedCandidates(projectId: string): Promise<ProjectInterest[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterests)
      .where(
        and(
          eq(projectInterests.projectId, projectId),
          eq(projectInterests.status, "accepted"),
        ),
      )
      .orderBy(desc(projectInterests.updatedAt));
  } catch (error) {
    console.error("[InterestRepository] Failed to get accepted candidates", {
      projectId,
      error,
    });
    return [];
  }
}

/**
 * Get all interests for a project with detailed status breakdown
 */
export async function getProjectInterestStats(projectId: string) {
  const db = getDb();
  if (!db) {
    return {
      pending: 0,
      interviewing: 0,
      accepted: 0,
      rejected: 0,
      abandoned: 0,
      waitlist: 0,
      total: 0,
    };
  }

  try {
    const interests = await db
      .select()
      .from(projectInterests)
      .where(eq(projectInterests.projectId, projectId));

    const stats = {
      pending: interests.filter((i) => i.status === "pending").length,
      interviewing: interests.filter((i) => i.status === "interviewing").length,
      accepted: interests.filter((i) => i.status === "accepted").length,
      rejected: interests.filter((i) => i.status === "rejected").length,
      abandoned: interests.filter((i) => i.status === "abandoned").length,
      waitlist: interests.filter((i) => i.status === "waitlist").length,
      total: interests.length,
    };

    return stats;
  } catch (error) {
    console.error("[InterestRepository] Failed to get interest stats", { projectId, error });
    return {
      pending: 0,
      interviewing: 0,
      accepted: 0,
      rejected: 0,
      abandoned: 0,
      waitlist: 0,
      total: 0,
    };
  }
}
