import { and, count, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb } from "../client";
import { projects, type ProjectRecord, type NewProjectRecord } from "../schema";

export interface ProjectFilters {
  status?: string | string[];
  mentorSlackUserId?: string;
  type?: string | string[];
  source?: string | string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectStats {
  total: number;
  draft: number;
  active: number;
  paused: number;
  completed: number;
  archived: number;
}

export async function fetchAllProjects(filters?: ProjectFilters): Promise<ProjectRecord[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  try {
    const conditions = buildProjectFilters(filters);

    // Build query with all conditions applied
    const baseQuery = db
      .select()
      .from(projects)
      .$dynamic();

    const withConditions = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const withOrdering = withConditions.orderBy(sql`${projects.updatedAt} DESC`);

    const withLimit = filters?.limit
      ? withOrdering.limit(filters.limit)
      : withOrdering;

    const finalQuery = filters?.offset
      ? withLimit.offset(filters.offset)
      : withLimit;

    return await finalQuery;
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

export async function createProject(data: NewProjectRecord): Promise<ProjectRecord | null> {
  const db = getDb();
  if (!db) {
    console.error("[ProjectsRepository] Database not available");
    return null;
  }

  try {
    const [created] = await db
      .insert(projects)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return created ?? null;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to create project", { data, error });
    return null;
  }
}

export async function updateProject(
  id: string,
  data: Partial<Omit<NewProjectRecord, "id">>,
): Promise<ProjectRecord | null> {
  const db = getDb();
  if (!db) {
    console.error("[ProjectsRepository] Database not available");
    return null;
  }

  try {
    const [updated] = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();
    return updated ?? null;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to update project", { id, data, error });
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    console.error("[ProjectsRepository] Database not available");
    return false;
  }

  try {
    // Soft delete: set status to 'archived'
    await db
      .update(projects)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));
    return true;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to delete project", { id, error });
    return false;
  }
}

export async function getProjectStats(): Promise<ProjectStats> {
  const db = getDb();
  if (!db) {
    return { total: 0, draft: 0, active: 0, paused: 0, completed: 0, archived: 0 };
  }

  try {
    const results = await db
      .select({
        status: projects.status,
        count: count(),
      })
      .from(projects)
      .groupBy(projects.status);

    const stats: ProjectStats = {
      total: 0,
      draft: 0,
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };

    for (const row of results) {
      const statusKey = row.status as keyof Omit<ProjectStats, "total">;
      if (statusKey in stats) {
        stats[statusKey] = Number(row.count);
        stats.total += Number(row.count);
      }
    }

    return stats;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to get project stats", error);
    return { total: 0, draft: 0, active: 0, paused: 0, completed: 0, archived: 0 };
  }
}

export async function countProjects(filters?: ProjectFilters): Promise<number> {
  const db = getDb();
  if (!db) {
    return 0;
  }

  try {
    const conditions = buildProjectFilters(filters);

    const baseQuery = db
      .select({ count: count() })
      .from(projects)
      .$dynamic();

    const finalQuery = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const [result] = await finalQuery;
    return result?.count ? Number(result.count) : 0;
  } catch (error) {
    console.error("[ProjectsRepository] Failed to count projects", error);
    return 0;
  }
}

// Helper function to build filter conditions
function buildProjectFilters(filters?: ProjectFilters) {
  const conditions: any[] = [];

  if (!filters) {
    return conditions;
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(projects.status, filters.status));
    } else {
      conditions.push(eq(projects.status, filters.status));
    }
  }

  if (filters.type) {
    if (Array.isArray(filters.type)) {
      conditions.push(inArray(projects.type, filters.type));
    } else {
      conditions.push(eq(projects.type, filters.type));
    }
  }

  if (filters.source) {
    if (Array.isArray(filters.source)) {
      conditions.push(inArray(projects.source, filters.source));
    } else {
      conditions.push(eq(projects.source, filters.source));
    }
  }

  if (filters.mentorSlackUserId) {
    conditions.push(eq(projects.mentorSlackUserId, filters.mentorSlackUserId));
  }

  if (filters.search) {
    conditions.push(
      sql`(${projects.name} ILIKE ${`%${filters.search}%`} OR ${projects.summary} ILIKE ${`%${filters.search}%`})`,
    );
  }

  return conditions;
}
