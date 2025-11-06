import { describe, expect, it, beforeEach } from "vitest";
import {
  getProjectById,
  getProjectCatalog,
  listActiveProjects,
  refreshProjectCatalog,
} from "../../lib/projects/catalog";

describe("Project catalog loader", () => {
  beforeEach(async () => {
    await refreshProjectCatalog();
  });

  it("loads the project catalog from disk", async () => {
    const catalog = await getProjectCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    const firstProject = catalog[0];
    expect(firstProject?.interview).toBeDefined();
    if (firstProject?.interview?.questions?.length) {
      expect(firstProject.interview.questions.length).toBeGreaterThan(0);
    } else {
      expect(firstProject?.interview?.generator).toBeDefined();
    }
  });

  it("returns active projects", async () => {
    const activeProjects = await listActiveProjects();
    expect(activeProjects.every((project) => project.status === "active")).toBe(true);
  });

  it("retrieves a project by id", async () => {
    const activeProjects = await listActiveProjects();
    const project = await getProjectById(activeProjects[0]!.id);
    expect(project?.name).toBeTruthy();
  });
});
