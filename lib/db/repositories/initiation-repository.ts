import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import {
  projectInitiationRequests,
  strategicEvaluations,
  type ProjectInitiationRequest,
  type NewProjectInitiationRequest,
  type StrategicEvaluation,
} from "../schema";

export async function fetchInitiationsByProject(
  projectId: string,
): Promise<ProjectInitiationRequest[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(projectInitiationRequests)
      .where(eq(projectInitiationRequests.projectId, projectId))
      .orderBy(desc(projectInitiationRequests.createdAt));
  } catch (error) {
    console.error("[InitiationRepository] Failed to fetch initiations", { projectId, error });
    return [];
  }
}

export async function fetchInitiationById(
  initiationId: string,
): Promise<ProjectInitiationRequest | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [initiation] = await db
      .select()
      .from(projectInitiationRequests)
      .where(eq(projectInitiationRequests.id, initiationId))
      .limit(1);
    return initiation ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to fetch initiation", { initiationId, error });
    return null;
  }
}

export async function getLatestDraft(projectId: string): Promise<ProjectInitiationRequest | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [latest] = await db
      .select()
      .from(projectInitiationRequests)
      .where(eq(projectInitiationRequests.projectId, projectId))
      .orderBy(desc(projectInitiationRequests.createdAt))
      .limit(1);
    return latest ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to get latest draft", { projectId, error });
    return null;
  }
}

export async function createInitiation(
  data: NewProjectInitiationRequest,
): Promise<ProjectInitiationRequest | null> {
  const db = getDb();
  if (!db) {
    console.error("[InitiationRepository] Database not available");
    return null;
  }

  try {
    const [created] = await db.insert(projectInitiationRequests).values(data).returning();
    return created ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to create initiation", { data, error });
    return null;
  }
}

export async function updateInitiation(
  initiationId: string,
  data: Partial<Omit<NewProjectInitiationRequest, "id">>,
): Promise<ProjectInitiationRequest | null> {
  const db = getDb();
  if (!db) {
    console.error("[InitiationRepository] Database not available");
    return null;
  }

  try {
    const [updated] = await db
      .update(projectInitiationRequests)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projectInitiationRequests.id, initiationId))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to update initiation", {
      initiationId,
      data,
      error,
    });
    return null;
  }
}

export async function fetchEvaluationsByProject(
  projectName: string,
): Promise<StrategicEvaluation[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db
      .select()
      .from(strategicEvaluations)
      .where(eq(strategicEvaluations.projectName, projectName))
      .orderBy(desc(strategicEvaluations.createdAt));
  } catch (error) {
    console.error("[InitiationRepository] Failed to fetch evaluations", { projectName, error });
    return [];
  }
}

export async function fetchEvaluationById(
  evaluationId: string,
): Promise<StrategicEvaluation | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [evaluation] = await db
      .select()
      .from(strategicEvaluations)
      .where(eq(strategicEvaluations.id, evaluationId))
      .limit(1);
    return evaluation ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to fetch evaluation", { evaluationId, error });
    return null;
  }
}

export async function getLatestEvaluation(
  projectName: string,
): Promise<StrategicEvaluation | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [latest] = await db
      .select()
      .from(strategicEvaluations)
      .where(eq(strategicEvaluations.projectName, projectName))
      .orderBy(desc(strategicEvaluations.createdAt))
      .limit(1);
    return latest ?? null;
  } catch (error) {
    console.error("[InitiationRepository] Failed to get latest evaluation", { projectName, error });
    return null;
  }
}
