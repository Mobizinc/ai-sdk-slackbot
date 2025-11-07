import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  projectInterviews,
  type ProjectInterview,
  type NewProjectInterview,
} from "../schema";

export interface InterviewStats {
  total: number;
  avgMatchScore: number;
  conversionRate: number;
  topConcerns: string[];
}

export async function fetchInterviewsByProject(projectId: string): Promise<ProjectInterview[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterviews)
      .where(eq(projectInterviews.projectId, projectId))
      .orderBy(desc(projectInterviews.completedAt));
  } catch (error) {
    console.error("[InterviewRepository] Failed to fetch interviews", { projectId, error });
    return [];
  }
}

export async function fetchInterviewById(
  interviewId: string,
): Promise<ProjectInterview | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [interview] = await db
      .select()
      .from(projectInterviews)
      .where(eq(projectInterviews.id, interviewId))
      .limit(1);
    return interview ?? null;
  } catch (error) {
    console.error("[InterviewRepository] Failed to fetch interview", { interviewId, error });
    return null;
  }
}

export async function createInterview(
  data: NewProjectInterview,
): Promise<ProjectInterview | null> {
  const db = getDb();
  if (!db) {
    console.error("[InterviewRepository] Database not available");
    return null;
  }

  try {
    const [created] = await db.insert(projectInterviews).values(data).returning();
    return created ?? null;
  } catch (error) {
    console.error("[InterviewRepository] Failed to create interview", { data, error });
    return null;
  }
}

export async function updateInterview(
  interviewId: string,
  data: Partial<Omit<NewProjectInterview, "id">>,
): Promise<ProjectInterview | null> {
  const db = getDb();
  if (!db) {
    console.error("[InterviewRepository] Database not available");
    return null;
  }

  try {
    const [updated] = await db
      .update(projectInterviews)
      .set(data)
      .where(eq(projectInterviews.id, interviewId))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error("[InterviewRepository] Failed to update interview", { interviewId, data, error });
    return null;
  }
}

export async function getInterviewStats(projectId: string): Promise<InterviewStats> {
  const db = getDb();
  if (!db) {
    return {
      total: 0,
      avgMatchScore: 0,
      conversionRate: 0,
      topConcerns: [],
    };
  }

  try {
    const interviews = await fetchInterviewsByProject(projectId);

    if (interviews.length === 0) {
      return {
        total: 0,
        avgMatchScore: 0,
        conversionRate: 0,
        topConcerns: [],
      };
    }

    // Calculate average match score
    const totalScore = interviews.reduce((sum, interview) => sum + interview.matchScore, 0);
    const avgMatchScore = totalScore / interviews.length;

    // Calculate conversion rate (interviews with high scores)
    const highScoreInterviews = interviews.filter((i) => i.matchScore >= 70);
    const conversionRate = (highScoreInterviews.length / interviews.length) * 100;

    // Extract top concerns
    const concernsMap = new Map<string, number>();
    interviews.forEach((interview) => {
      if (interview.concerns) {
        const concerns = interview.concerns.split(/[,;]/).map((c) => c.trim());
        concerns.forEach((concern) => {
          if (concern) {
            concernsMap.set(concern, (concernsMap.get(concern) || 0) + 1);
          }
        });
      }
    });

    const topConcerns = Array.from(concernsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);

    return {
      total: interviews.length,
      avgMatchScore: Math.round(avgMatchScore),
      conversionRate: Math.round(conversionRate),
      topConcerns,
    };
  } catch (error) {
    console.error("[InterviewRepository] Failed to get interview stats", { projectId, error });
    return {
      total: 0,
      avgMatchScore: 0,
      conversionRate: 0,
      topConcerns: [],
    };
  }
}

export async function fetchRecentInterviews(
  projectId: string,
  limit: number = 10,
): Promise<ProjectInterview[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterviews)
      .where(eq(projectInterviews.projectId, projectId))
      .orderBy(desc(projectInterviews.completedAt))
      .limit(limit);
  } catch (error) {
    console.error("[InterviewRepository] Failed to fetch recent interviews", { projectId, error });
    return [];
  }
}

export async function fetchInterviewsByCand(
  candidateSlackId: string,
): Promise<ProjectInterview[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInterviews)
      .where(eq(projectInterviews.candidateSlackId, candidateSlackId))
      .orderBy(desc(projectInterviews.completedAt));
  } catch (error) {
    console.error("[InterviewRepository] Failed to fetch interviews by candidate", {
      candidateSlackId,
      error,
    });
    return [];
  }
}
