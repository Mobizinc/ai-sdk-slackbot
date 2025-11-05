import { describe, expect, it, beforeEach } from "vitest";
import {
  getProjectById,
  getProjectCatalog,
  listActiveProjects,
  refreshProjectCatalog,
} from "../../lib/projects/catalog";

describe("Project catalog loader", () => {
  beforeEach(() => {
    refreshProjectCatalog();
  });

  it("loads the project catalog from disk", () => {
    const catalog = getProjectCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    const firstProject = catalog[0];
    expect(firstProject?.interview).toBeDefined();
    if (firstProject?.interview?.questions?.length) {
      expect(firstProject.interview.questions.length).toBeGreaterThan(0);
    } else {
      expect(firstProject?.interview?.generator).toBeDefined();
    }
  });

  it("returns active projects", () => {
    const activeProjects = listActiveProjects();
    expect(activeProjects.every((project) => project.status === "active")).toBe(true);
  });

  it("retrieves a project by id", () => {
    const activeProjects = listActiveProjects();
    const project = getProjectById(activeProjects[0]!.id);
    expect(project?.name).toBeTruthy();
  });
});
