import { readFileSync } from "fs";
import { join } from "path";
import { fetchAllProjects, fetchProjectById as fetchProjectRecordById } from "../db/repositories/projects-repository";
import { projectCatalogSchema, projectSchema, type ProjectDefinition } from "./types";
import type { ProjectRecord } from "../db/schema";

interface CatalogCache {
  projects: ProjectDefinition[];
  loadedAt: number;
  source: "database" | "file";
}

let catalogCache: CatalogCache | null = null;
let loadingPromise: Promise<CatalogCache> | null = null;

const PROJECTS_PATH = join(process.cwd(), "data", "projects.json");

function loadCatalogFromDisk(): CatalogCache {
  const rawJson = readFileSync(PROJECTS_PATH, "utf-8");
  const parsed = JSON.parse(rawJson);
  const catalog = projectCatalogSchema.parse(parsed);

  return {
    projects: catalog.projects,
    loadedAt: Date.now(),
    source: "file",
  };
}

function recordToProjectDefinition(record: ProjectRecord): ProjectDefinition {
  const project = projectSchema.parse({
    id: record.id,
    name: record.name,
    status: record.status,
    githubUrl: record.githubUrl ?? undefined,
    summary: record.summary,
    background: record.background ?? undefined,
    techStack: record.techStack ?? [],
    skillsRequired: record.skillsRequired ?? [],
    skillsNiceToHave: record.skillsNiceToHave ?? [],
    difficultyLevel: record.difficultyLevel ?? undefined,
    estimatedHours: record.estimatedHours ?? undefined,
    learningOpportunities: record.learningOpportunities ?? [],
    openTasks: record.openTasks ?? [],
    mentor: record.mentorSlackUserId
      ? {
          slackUserId: record.mentorSlackUserId,
          name: record.mentorName ?? record.mentorSlackUserId,
        }
      : undefined,
    interview: record.interviewConfig ?? undefined,
    standup: record.standupConfig ?? undefined,
    maxCandidates: record.maxCandidates ?? undefined,
    postedDate: record.postedDate ? record.postedDate.toISOString() : undefined,
    expiresDate: record.expiresDate ? record.expiresDate.toISOString() : undefined,
    channelId: record.channelId ?? undefined,
  });

  return project;
}

async function loadCatalogFromDatabase(): Promise<CatalogCache | null> {
  const records = await fetchAllProjects();
  if (!records || records.length === 0) {
    return null;
  }

  const projects = records.map(recordToProjectDefinition);
  return {
    projects,
    loadedAt: Date.now(),
    source: "database",
  };
}

async function loadCatalog(): Promise<CatalogCache> {
  const fromDb = await loadCatalogFromDatabase();
  if (fromDb) {
    return fromDb;
  }

  return loadCatalogFromDisk();
}

async function ensureCatalogLoaded(forceReload = false): Promise<CatalogCache> {
  if (forceReload) {
    catalogCache = null;
    loadingPromise = null;
  }

  if (catalogCache) {
    return catalogCache;
  }

  if (!loadingPromise) {
    loadingPromise = loadCatalog()
      .then((result) => {
        catalogCache = result;
        return result;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }

  return loadingPromise;
}

export async function refreshProjectCatalog(): Promise<void> {
  await ensureCatalogLoaded(true);
}

export async function getProjectCatalog(): Promise<ProjectDefinition[]> {
  const catalog = await ensureCatalogLoaded();
  return catalog.projects;
}

export async function getProjectById(projectId: string): Promise<ProjectDefinition | undefined> {
  const catalog = await ensureCatalogLoaded();
  const existing = catalog.projects.find((project) => project.id === projectId);
  if (existing) {
    return existing;
  }

  if (catalog.source === "database") {
    const record = await fetchProjectRecordById(projectId);
    if (record) {
      const project = recordToProjectDefinition(record);
      catalog.projects = [...catalog.projects, project];
      catalogCache = catalog;
      return project;
    }
  }

  return undefined;
}

export async function listActiveProjects(): Promise<ProjectDefinition[]> {
  const catalog = await ensureCatalogLoaded();
  return catalog.projects.filter((project) => project.status === "active");
}
