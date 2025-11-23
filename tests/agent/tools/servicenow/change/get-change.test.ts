/**
 * Unit Tests for Get Change Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetChangeTool } from "@/agent/tools/servicenow/change/get-change.tool";
import type { ChangeRequest } from "@/infrastructure/servicenow/repositories/change-repository.impl";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getChangeRepository: vi.fn(),
}));

vi.mock("../../../../../lib/utils/case-number-normalizer", () => ({
  normalizeCaseId: vi.fn((prefix, number) => {
    if (number.startsWith(prefix)) return number;
    const numPart = number.replace(/\D/g, "");
    return `${prefix}${numPart.padStart(7, "0")}`;
  }),
  findMatchingCaseNumber: vi.fn(() => null),
}));

import { getChangeRepository } from "@/infrastructure/servicenow/repositories";

describe("Get Change Tool", () => {
  let mockChangeRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockChange = (overrides?: Partial<ChangeRequest>): ChangeRequest => ({
    sys_id: "chg-sys-id-1",
    number: "CHG0012345",
    short_description: "Database upgrade",
    description: "Upgrade production database to v2.0",
    state: "Scheduled",
    type: "Normal",
    category: "Software",
    priority: "2",
    risk: "Moderate",
    impact: "2",
    assigned_to: { display_value: "John Admin" },
    assignment_group: { display_value: "Database Team" },
    requested_by: { display_value: "Jane Manager" },
    start_date: "2025-02-01 20:00:00",
    end_date: "2025-02-01 23:00:00",
    work_start: "2025-02-01 20:30:00",
    work_end: "2025-02-01 22:30:00",
    business_justification: "Performance improvements",
    implementation_plan: "Step-by-step upgrade procedure",
    rollback_plan: "Restore from backup",
    test_plan: "Validate connections and queries",
    opened_at: "2025-01-15 10:00:00",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeRepo = { fetchChangeByNumber: vi.fn() };
    (getChangeRepository as any).mockReturnValue(mockChangeRepo);
    tool = createGetChangeTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve change by full number (CHG prefix)", async () => {
    const mockChange = createMockChange();
    mockChangeRepo.fetchChangeByNumber.mockResolvedValue(mockChange);

    const result = await tool.execute({ number: "CHG0012345" });

    expect(mockChangeRepo.fetchChangeByNumber).toHaveBeenCalledWith("CHG0012345");
    expect(result.success).toBe(true);
    expect(result.data?.change.number).toBe("CHG0012345");
    expect(result.data?.change.shortDescription).toBe("Database upgrade");
  });

  it("should normalize change number without CHG prefix", async () => {
    const mockChange = createMockChange();
    mockChangeRepo.fetchChangeByNumber.mockResolvedValue(mockChange);

    await tool.execute({ number: "12345" });

    expect(mockChangeRepo.fetchChangeByNumber).toHaveBeenCalledWith("CHG0012345");
  });

  it("should return error when change not found", async () => {
    mockChangeRepo.fetchChangeByNumber.mockResolvedValue(null);

    const result = await tool.execute({ number: "CHG9999999" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RECORD_NOT_FOUND");
    expect(result.error?.message).toContain("CHG9999999 was not found");
  });

  it("should extract display values from reference fields", async () => {
    const mockChange = createMockChange();
    mockChangeRepo.fetchChangeByNumber.mockResolvedValue(mockChange);

    const result = await tool.execute({ number: "CHG0012345" });

    expect(result.data?.change.assignedTo).toBe("John Admin");
    expect(result.data?.change.assignmentGroup).toBe("Database Team");
    expect(result.data?.change.requestedBy).toBe("Jane Manager");
  });

  it("should include implementation and rollback plans", async () => {
    const mockChange = createMockChange();
    mockChangeRepo.fetchChangeByNumber.mockResolvedValue(mockChange);

    const result = await tool.execute({ number: "CHG0012345" });

    expect(result.data?.change.implementationPlan).toBe("Step-by-step upgrade procedure");
    expect(result.data?.change.rollbackPlan).toBe("Restore from backup");
    expect(result.data?.change.testPlan).toBe("Validate connections and queries");
  });

  it("should handle repository errors", async () => {
    mockChangeRepo.fetchChangeByNumber.mockRejectedValue(new Error("Network error"));

    const result = await tool.execute({ number: "CHG0012345" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
