/**
 * Unit Tests for Get Project Epics Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetProjectEpicsTool } from "@/agent/tools/servicenow/spm/get-project-epics.tool";

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getSPMProjectEpics: vi.fn(),
  },
}));

import { serviceNowClient } from "@/tools/servicenow";

describe("Get Project Epics Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createGetProjectEpicsTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve epics for a project", async () => {
    const mockEpics = [
      { sysId: "e1", number: "EPIC001", shortDescription: "Phase 1", state: "Open", url: "url1" },
      { sysId: "e2", number: "EPIC002", shortDescription: "Phase 2", state: "Closed", url: "url2" },
    ];
    (serviceNowClient.getSPMProjectEpics as any).mockResolvedValue(mockEpics);

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(serviceNowClient.getSPMProjectEpics).toHaveBeenCalledWith("project-sys-id-1", expect.any(Object));
    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(2);
    expect(result.data?.epics).toHaveLength(2);
  });

  it("should handle empty epic list", async () => {
    (serviceNowClient.getSPMProjectEpics as any).mockResolvedValue([]);

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(0);
    expect(result.data?.message).toContain("No epics found");
  });

  it("should handle errors", async () => {
    (serviceNowClient.getSPMProjectEpics as any).mockRejectedValue(new Error("API error"));

    const result = await tool.execute({ projectSysId: "project-sys-id-1" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
