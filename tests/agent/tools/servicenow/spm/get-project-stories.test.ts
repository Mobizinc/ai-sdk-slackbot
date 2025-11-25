/**
 * Unit Tests for Get Project Stories Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetProjectStoriesTool } from "../../../../../lib/agent/tools/servicenow/spm/get-project-stories.tool";

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getSPMProjectStories: vi.fn(),
  },
}));

import { serviceNowClient } from "../../../../../lib/tools/servicenow";

describe("Get Project Stories Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createGetProjectStoriesTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve stories for a project", async () => {
    const mockStories = [
      { sysId: "s1", number: "STORY001", shortDescription: "User login", state: "Done", storyPoints: 5, url: "url1" },
      { sysId: "s2", number: "STORY002", shortDescription: "Dashboard", state: "In Progress", storyPoints: 8, url: "url2" },
    ];
    (serviceNowClient.getSPMProjectStories as any).mockResolvedValue(mockStories);

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(serviceNowClient.getSPMProjectStories).toHaveBeenCalledWith("project-sys-id-1", expect.any(Object));
    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(2);
    expect(result.data?.stories).toHaveLength(2);
  });

  it("should handle empty story list", async () => {
    (serviceNowClient.getSPMProjectStories as any).mockResolvedValue([]);

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(0);
    expect(result.data?.message).toContain("No stories found");
  });

  it("should handle errors", async () => {
    (serviceNowClient.getSPMProjectStories as any).mockRejectedValue(new Error("API error"));

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
