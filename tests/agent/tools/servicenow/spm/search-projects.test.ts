/**
 * Unit Tests for Search Projects Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSearchProjectsTool } from "../../../../../lib/agent/tools/servicenow/spm/search-projects.tool";

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    searchSPMProjects: vi.fn(),
  },
}));

import { serviceNowClient } from "../../../../../lib/tools/servicenow";

describe("Search Projects Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createSearchProjectsTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should search projects with name filter", async () => {
    const mockResults = {
      projects: [{ sysId: "p1", number: "PRJ0001", shortDescription: "Azure Migration", url: "url1" }],
      totalCount: 1,
    };
    (serviceNowClient.searchSPMProjects as any).mockResolvedValue(mockResults);

    const result = await tool.execute({ projectName: "Azure" });

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(1);
  });

  it("should search with multiple filters", async () => {
    const mockResults = { projects: [], totalCount: 0 };
    (serviceNowClient.searchSPMProjects as any).mockResolvedValue(mockResults);

    await tool.execute({
      projectState: "Open",
      projectPriority: "2",
      projectManager: "John",
    });

    expect(serviceNowClient.searchSPMProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "Open",
        priority: "2",
        projectManager: "John",
      }),
      expect.any(Object)
    );
  });

  it("should handle empty results", async () => {
    const mockResults = { projects: [], totalCount: 0 };
    (serviceNowClient.searchSPMProjects as any).mockResolvedValue(mockResults);

    const result = await tool.execute({ projectName: "NonExistent" });

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(0);
    expect(result.data?.message).toContain("No projects found");
  });

  it("should handle errors", async () => {
    (serviceNowClient.searchSPMProjects as any).mockRejectedValue(new Error("Search failed"));

    const result = await tool.execute({ projectName: "Azure" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
