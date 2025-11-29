/**
 * Unit Tests for Get Project Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetProjectTool } from "../../../../../lib/agent/tools/servicenow/spm/get-project.tool";
import type { SPMProject } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getSPMProject: vi.fn(),
  },
}));

import { serviceNowClient } from "../../../../../lib/tools/servicenow";

describe("Get Project Tool", () => {
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockProject = (overrides?: Partial<SPMProject>): SPMProject => ({
    sysId: "prj-sys-id-1",
    number: "PRJ0100115",
    shortDescription: "Azure Migration Project",
    description: "Migrate services to Azure cloud",
    state: "Work in Progress",
    priority: "2",
    assignedToName: "John PM",
    assignmentGroupName: "Cloud Team",
    projectManagerName: "Jane Manager",
    sponsorName: "CTO",
    percentComplete: 45,
    lifecycleStage: "Execution",
    active: true,
    openedAt: new Date("2025-01-01T10:00:00Z"),
    dueDate: new Date("2025-06-30T17:00:00Z"),
    url: "https://instance.service-now.com/pm_project.do?sys_id=prj-sys-id-1",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tool = createGetProjectTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve project by number", async () => {
    const mockProject = createMockProject();
    (serviceNowClient.getSPMProject as any).mockResolvedValue(mockProject);

    const result = await tool.execute({ projectNumber: "PRJ0100115" });

    expect(serviceNowClient.getSPMProject).toHaveBeenCalledWith("PRJ0100115", expect.any(Object));
    expect(result.success).toBe(true);
    expect(result.data?.project.number).toBe("PRJ0100115");
  });

  it("should return error when project not found", async () => {
    (serviceNowClient.getSPMProject as any).mockResolvedValue(null);

    const result = await tool.execute({ projectNumber: "PRJ9999999" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RECORD_NOT_FOUND");
  });

  it("should handle errors gracefully", async () => {
    (serviceNowClient.getSPMProject as any).mockRejectedValue(new Error("Service error"));

    const result = await tool.execute({ projectNumber: "PRJ0100115" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
