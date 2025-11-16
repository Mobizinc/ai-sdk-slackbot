/**
 * Unit Tests for Get Catalog Task Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetCatalogTaskTool } from "../../../../../lib/agent/tools/servicenow/catalog/get-catalog-task.tool";
import type { CatalogTask } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCatalogTaskRepository: vi.fn(),
}));

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/utils/case-number-normalizer", () => ({
  normalizeCaseId: vi.fn((prefix, number) => {
    if (number.startsWith(prefix)) return number;
    const numPart = number.replace(/\D/g, "");
    return `${prefix}${numPart.padStart(7, "0")}`;
  }),
  findMatchingCaseNumber: vi.fn(() => null),
}));

import { getCatalogTaskRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Get Catalog Task Tool", () => {
  let mockCatalogTaskRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCatalogTask = (overrides?: Partial<CatalogTask>): CatalogTask => ({
    sysId: "sctask-sys-id-1",
    number: "SCTASK0049921",
    shortDescription: "Provision laptop",
    description: "Provision and configure Dell XPS 15",
    requestItemNumber: "RITM0046210",
    requestNumber: "REQ0012345",
    state: "Work in Progress",
    active: true,
    assignedToName: "John Tech",
    assignmentGroupName: "Hardware Fulfillment",
    priority: "3",
    openedAt: new Date("2025-01-02T09:00:00Z"),
    dueDate: new Date("2025-01-10T17:00:00Z"),
    workNotes: "Ordered laptop from vendor",
    url: "https://instance.service-now.com/sc_task.do?sys_id=sctask-sys-id-1",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCatalogTaskRepo = { findByNumber: vi.fn() };
    (getCatalogTaskRepository as any).mockReturnValue(mockCatalogTaskRepo);
    tool = createGetCatalogTaskTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve catalog task by full number (SCTASK prefix)", async () => {
    const mockTask = createMockCatalogTask();
    mockCatalogTaskRepo.findByNumber.mockResolvedValue(mockTask);

    const result = await tool.execute({ number: "SCTASK0049921" });

    expect(mockCatalogTaskRepo.findByNumber).toHaveBeenCalledWith("SCTASK0049921");
    expect(result.success).toBe(true);
    expect(result.data?.catalogTask.number).toBe("SCTASK0049921");
  });

  it("should normalize SCTASK number without prefix", async () => {
    const mockTask = createMockCatalogTask();
    mockCatalogTaskRepo.findByNumber.mockResolvedValue(mockTask);

    await tool.execute({ number: "49921" });

    expect(mockCatalogTaskRepo.findByNumber).toHaveBeenCalledWith("SCTASK0049921");
  });

  it("should return error when catalog task not found", async () => {
    mockCatalogTaskRepo.findByNumber.mockResolvedValue(null);

    const result = await tool.execute({ number: "SCTASK9999999" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RECORD_NOT_FOUND");
    expect(result.error?.message).toContain("SCTASK9999999 was not found");
  });

  it("should handle repository errors", async () => {
    mockCatalogTaskRepo.findByNumber.mockRejectedValue(new Error("Service error"));

    const result = await tool.execute({ number: "SCTASK0049921" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });

  it("should include work notes and close notes", async () => {
    const mockTask = createMockCatalogTask({
      workNotes: "In progress",
      closeNotes: "Completed successfully",
    });
    mockCatalogTaskRepo.findByNumber.mockResolvedValue(mockTask);

    const result = await tool.execute({ number: "SCTASK0049921" });

    expect(result.data?.catalogTask.workNotes).toBe("In progress");
    expect(result.data?.catalogTask.closeNotes).toBe("Completed successfully");
  });
});
