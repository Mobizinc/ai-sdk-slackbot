/**
 * Unit Tests for Get Requested Item Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetRequestedItemTool } from "../../../../../lib/agent/tools/servicenow/catalog/get-requested-item.tool";
import type { RequestedItem } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getRequestedItemRepository: vi.fn(),
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

import { getRequestedItemRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Get Requested Item Tool", () => {
  let mockRequestedItemRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockRequestedItem = (overrides?: Partial<RequestedItem>): RequestedItem => ({
    sysId: "ritm-sys-id-1",
    number: "RITM0046210",
    shortDescription: "Laptop - Dell XPS 15",
    description: "Standard developer laptop",
    requestNumber: "REQ0012345",
    catalogItemName: "Dell XPS 15 Laptop",
    state: "Work in Progress",
    stage: "Fulfillment",
    assignedToName: "IT Procurement",
    assignmentGroupName: "Hardware Team",
    openedAt: new Date("2025-01-01T10:00:00Z"),
    dueDate: new Date("2025-01-15T17:00:00Z"),
    price: 1200,
    quantity: 1,
    url: "https://instance.service-now.com/sc_req_item.do?sys_id=ritm-sys-id-1",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestedItemRepo = { findByNumber: vi.fn() };
    (getRequestedItemRepository as any).mockReturnValue(mockRequestedItemRepo);
    tool = createGetRequestedItemTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve requested item by full number (RITM prefix)", async () => {
    const mockItem = createMockRequestedItem();
    mockRequestedItemRepo.findByNumber.mockResolvedValue(mockItem);

    const result = await tool.execute({ number: "RITM0046210" });

    expect(mockRequestedItemRepo.findByNumber).toHaveBeenCalledWith("RITM0046210");
    expect(result.success).toBe(true);
    expect(result.data?.requestedItem.number).toBe("RITM0046210");
  });

  it("should normalize RITM number without prefix", async () => {
    const mockItem = createMockRequestedItem();
    mockRequestedItemRepo.findByNumber.mockResolvedValue(mockItem);

    await tool.execute({ number: "46210" });

    expect(mockRequestedItemRepo.findByNumber).toHaveBeenCalledWith("RITM0046210");
  });

  it("should return error when requested item not found", async () => {
    mockRequestedItemRepo.findByNumber.mockResolvedValue(null);

    const result = await tool.execute({ number: "RITM9999999" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RECORD_NOT_FOUND");
    expect(result.error?.message).toContain("RITM9999999 was not found");
  });

  it("should handle repository errors", async () => {
    mockRequestedItemRepo.findByNumber.mockRejectedValue(new Error("Network error"));

    const result = await tool.execute({ number: "RITM0046210" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
