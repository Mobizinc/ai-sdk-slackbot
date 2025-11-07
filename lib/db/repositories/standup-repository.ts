import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  projectStandups,
  projectStandupResponses,
  type ProjectStandup,
  type NewProjectStandup,
  type ProjectStandupResponse,
  type NewProjectStandupResponse,
} from "../schema";

export async function fetchStandupsByProject(projectId: string): Promise<ProjectStandup[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectStandups)
      .where(eq(projectStandups.projectId, projectId))
      .orderBy(desc(projectStandups.scheduledFor));
  } catch (error) {
    console.error("[StandupRepository] Failed to fetch standups", { projectId, error });
    return [];
  }
}

export async function fetchStandupById(standupId: string): Promise<ProjectStandup | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [standup] = await db
      .select()
      .from(projectStandups)
      .where(eq(projectStandups.id, standupId))
      .limit(1);
    return standup ?? null;
  } catch (error) {
    console.error("[StandupRepository] Failed to fetch standup", { standupId, error });
    return null;
  }
}

export async function fetchStandupResponses(
  standupId: string,
): Promise<ProjectStandupResponse[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectStandupResponses)
      .where(eq(projectStandupResponses.standupId, standupId))
      .orderBy(desc(projectStandupResponses.submittedAt));
  } catch (error) {
    console.error("[StandupRepository] Failed to fetch standup responses", { standupId, error });
    return [];
  }
}

export async function createStandup(data: NewProjectStandup): Promise<ProjectStandup | null> {
  const db = getDb();
  if (!db) {
    console.error("[StandupRepository] Database not available");
    return null;
  }

  try {
    const [created] = await db.insert(projectStandups).values(data).returning();
    return created ?? null;
  } catch (error) {
    console.error("[StandupRepository] Failed to create standup", { data, error });
    return null;
  }
}

export async function updateStandup(
  standupId: string,
  data: Partial<Omit<NewProjectStandup, "id">>,
): Promise<ProjectStandup | null> {
  const db = getDb();
  if (!db) {
    console.error("[StandupRepository] Database not available");
    return null;
  }

  try {
    const [updated] = await db
      .update(projectStandups)
      .set(data)
      .where(eq(projectStandups.id, standupId))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error("[StandupRepository] Failed to update standup", { standupId, data, error });
    return null;
  }
}

export async function getStandupCompletionRate(projectId: string): Promise<number> {
  const db = getDb();
  if (!db) {
    return 0;
  }

  try {
    // Get all completed standups
    const standups = await db
      .select()
      .from(projectStandups)
      .where(
        and(eq(projectStandups.projectId, projectId), eq(projectStandups.status, "completed")),
      );

    if (standups.length === 0) {
      return 0;
    }

    // Calculate average completion rate
    let totalRate = 0;
    for (const standup of standups) {
      const responses = await fetchStandupResponses(standup.id);
      // Assuming expected participants is stored in metadata
      const expectedParticipants = standup.metadata?.expectedParticipants || 1;
      const rate = (responses.length / expectedParticipants) * 100;
      totalRate += rate;
    }

    return totalRate / standups.length;
  } catch (error) {
    console.error("[StandupRepository] Failed to get completion rate", { projectId, error });
    return 0;
  }
}

export async function getBlockerFrequency(projectId: string): Promise<number> {
  const db = getDb();
  if (!db) {
    return 0;
  }

  try {
    const standups = await db
      .select()
      .from(projectStandups)
      .where(eq(projectStandups.projectId, projectId));

    if (standups.length === 0) {
      return 0;
    }

    let totalBlockers = 0;
    for (const standup of standups) {
      const responses = await db
        .select()
        .from(projectStandupResponses)
        .where(
          and(
            eq(projectStandupResponses.standupId, standup.id),
            eq(projectStandupResponses.blockerFlag, true),
          ),
        );
      totalBlockers += responses.length;
    }

    return totalBlockers;
  } catch (error) {
    console.error("[StandupRepository] Failed to get blocker frequency", { projectId, error });
    return 0;
  }
}

export async function fetchRecentStandups(
  projectId: string,
  limit: number = 5,
): Promise<ProjectStandup[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectStandups)
      .where(eq(projectStandups.projectId, projectId))
      .orderBy(desc(projectStandups.scheduledFor))
      .limit(limit);
  } catch (error) {
    console.error("[StandupRepository] Failed to fetch recent standups", { projectId, error });
    return [];
  }
}

export async function fetchUpcomingStandups(
  projectId: string,
  days: number = 7,
): Promise<ProjectStandup[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return await db
      .select()
      .from(projectStandups)
      .where(
        and(
          eq(projectStandups.projectId, projectId),
          gte(projectStandups.scheduledFor, now),
          lte(projectStandups.scheduledFor, future),
        ),
      )
      .orderBy(projectStandups.scheduledFor);
  } catch (error) {
    console.error("[StandupRepository] Failed to fetch upcoming standups", { projectId, error });
    return [];
  }
}
