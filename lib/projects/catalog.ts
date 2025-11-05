import { readFileSync } from "fs";
import { join } from "path";
import { projectCatalogSchema, type ProjectDefinition } from "./types";

interface CatalogCache {
  projects: ProjectDefinition[];
  loadedAt: number;
}

let catalogCache: CatalogCache | null = null;

const PROJECTS_PATH = join(process.cwd(), "data", "projects.json");

function loadCatalogFromDisk(): CatalogCache {
  const rawJson = readFileSync(PROJECTS_PATH, "utf-8");
  const parsed = JSON.parse(rawJson);
  const catalog = projectCatalogSchema.parse(parsed);

  // Normalize defaults (zod defaults applied during parse)
  const projects = catalog.projects;

  return {
    projects,
    loadedAt: Date.now(),
  };
}

function ensureCatalogLoaded(): CatalogCache {
  if (!catalogCache) {
    catalogCache = loadCatalogFromDisk();
  }
  return catalogCache;
}

export function refreshProjectCatalog(): void {
  catalogCache = loadCatalogFromDisk();
}

export function getProjectCatalog(): ProjectDefinition[] {
  const catalog = ensureCatalogLoaded();
  return catalog.projects;
}

export function getProjectById(projectId: string): ProjectDefinition | undefined {
  const catalog = ensureCatalogLoaded();
  return catalog.projects.find((project) => project.id === projectId);
}

export function listActiveProjects(): ProjectDefinition[] {
  const catalog = ensureCatalogLoaded();
  return catalog.projects.filter((project) => project.status === "active");
}
