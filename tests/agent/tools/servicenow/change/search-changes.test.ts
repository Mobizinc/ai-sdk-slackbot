/**
 * Unit Tests for Search Changes Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSearchChangesTool } from "../../../../../lib/agent/tools/servicenow/change/search-changes.tool";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getChangeRepository: vi.fn(),
}));

import { getChangeRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Search Changes Tool", () => {
  let mockChangeRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockChanges = () => [
    {
      sys_id: "chg-1",
      number: "CHG0001",
      short_description: "Server upgrade",
      state: { display_value: "Scheduled" },
      type: { display_value: "Normal" },
      priority: { display_value: "2 - High" },
      risk: { display_value: "Moderate" },
    },
    {
      sys_id: "chg-2",
      number: "CHG0002",
      short_description: "Emergency patch",
      state: { display_value: "Implement" },
      type: { display_value: "Emergency" },
      priority: { display_value: "1 - Critical" },
      risk: { display_value: "High" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockChangeRepo = { fetchChanges: vi.fn() };
    (getChangeRepository as any).mockReturnValue(mockChangeRepo);
    tool = createSearchChangesTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should search changes with query", async () => {
    const mockChanges = createMockChanges();
    mockChangeRepo.fetchChanges.mockResolvedValue(mockChanges);

    const result = await tool.execute({ query: "upgrade" });

    expect(mockChangeRepo.fetchChanges).toHaveBeenCalledWith(
      expect.objectContaining({ short_descriptionLIKE: "upgrade" }),
      expect.objectContaining({ maxRecords: 25 })
    );
    expect(result.success).toBe(true);
    expect(result.data?.totalFound).toBe(2);
  });

  it("should filter by state", async () => {
    const mockChanges = [createMockChanges()[0]];
    mockChangeRepo.fetchChanges.mockResolvedValue(mockChanges);

    await tool.execute({ state: "Scheduled" });

    expect(mockChangeRepo.fetchChanges).toHaveBeenCalledWith(
      expect.objectContaining({ state: "Scheduled" }),
      expect.any(Object)
    );
  });

  it("should filter by type", async () => {
    const mockChanges = [createMockChanges()[1]];
    mockChangeRepo.fetchChanges.mockResolvedValue(mockChanges);

    await tool.execute({ type: "Emergency" });

    expect(mockChangeRepo.fetchChanges).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Emergency" }),
      expect.any(Object)
    );
  });

  it("should handle empty results", async () => {
    mockChangeRepo.fetchChanges.mockResolvedValue([]);

    const result = await tool.execute({ query: "nonexistent" });

    expect(result.success).toBe(true);
    expect(result.data?.totalFound).toBe(0);
    expect(result.data?.message).toContain("No changes found");
  });

  it("should extract display values from reference fields", async () => {
    const mockChanges = createMockChanges();
    mockChangeRepo.fetchChanges.mockResolvedValue(mockChanges);

    const result = await tool.execute({ query: "upgrade" });

    expect(result.data?.changes[0].state).toBe("Scheduled");
    expect(result.data?.changes[0].type).toBe("Normal");
    expect(result.data?.changes[1].risk).toBe("High");
  });

  it("should handle repository errors", async () => {
    mockChangeRepo.fetchChanges.mockRejectedValue(new Error("Service error"));

    const result = await tool.execute({ query: "upgrade" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
