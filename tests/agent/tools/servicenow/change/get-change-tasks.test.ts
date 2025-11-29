/**
 * Unit Tests for Get Change Tasks Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetChangeTasksTool } from "../../../../../lib/agent/tools/servicenow/change/get-change-tasks.tool";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getChangeRepository: vi.fn(),
}));

import { getChangeRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Get Change Tasks Tool", () => {
  let mockChangeRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockTasks = () => [
    {
      sys_id: "task-1",
      change: { display_value: "CHG0012345" },
      state: { display_value: "Pending" },
      from_state: { display_value: "New" },
      to_state: { display_value: "Assess" },
      sys_created_on: "2025-01-15 10:00:00",
      sys_created_by: { display_value: "admin" },
    },
    {
      sys_id: "task-2",
      change: { display_value: "CHG0012345" },
      state: { display_value: "Complete" },
      from_state: { display_value: "Assess" },
      to_state: { display_value: "Authorize" },
      sys_created_on: "2025-01-16 14:00:00",
      sys_created_by: { display_value: "approver" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeRepo = { fetchStateTransitions: vi.fn() };
    (getChangeRepository as any).mockReturnValue(mockChangeRepo);
    tool = createGetChangeTasksTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve change tasks by changeSysId", async () => {
    const mockTasks = createMockTasks();
    mockChangeRepo.fetchStateTransitions.mockResolvedValue(mockTasks);

    const result = await tool.execute({ changeSysId: "chg-sys-id-123" });

    expect(mockChangeRepo.fetchStateTransitions).toHaveBeenCalledWith("chg-sys-id-123");
    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(2);
    expect(result.data?.tasks).toHaveLength(2);
  });

  it("should handle empty task list", async () => {
    mockChangeRepo.fetchStateTransitions.mockResolvedValue([]);

    const result = await tool.execute({ changeSysId: "chg-sys-id-123" });

    expect(result.success).toBe(true);
    expect(result.data?.totalCount).toBe(0);
    expect(result.data?.message).toContain("No change tasks found");
  });

  it("should extract display values from reference fields", async () => {
    const mockTasks = createMockTasks();
    mockChangeRepo.fetchStateTransitions.mockResolvedValue(mockTasks);

    const result = await tool.execute({ changeSysId: "chg-sys-id-123" });

    expect(result.data?.tasks[0].state).toBe("Pending");
    expect(result.data?.tasks[0].fromState).toBe("New");
    expect(result.data?.tasks[0].toState).toBe("Assess");
    expect(result.data?.tasks[0].createdBy).toBe("admin");
  });

  it("should handle repository errors", async () => {
    mockChangeRepo.fetchStateTransitions.mockRejectedValue(new Error("DB error"));

    const result = await tool.execute({ changeSysId: "chg-sys-id-123" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
