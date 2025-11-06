import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { projects, type ProjectRecord } from "../schema";

export async function fetchAllProjects(): Promise<ProjectRecord[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    return await db.select().from(projects);
  } catch (error) {
    console.error("[ProjectsRepository] Failed to fetch projects", error);
    return [];
  }
}

export async function fetchProjectById(id: string): Promise<ProjectRecord | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return row ?? null;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to fetch project", { id, error });
    return null;
  }
}
