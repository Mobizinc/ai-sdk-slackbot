/**
 * Unit Tests for Get Request Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetRequestTool } from "../../../../../lib/agent/tools/servicenow/catalog/get-request.tool";
import type { Request } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getRequestRepository: vi.fn(),
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

import { getRequestRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Get Request Tool", () => {
  let mockRequestRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockRequest = (overrides?: Partial<Request>): Request => ({
    sysId: "req-sys-id-1",
    number: "REQ0012345",
    shortDescription: "Laptop request",
    description: "Need new laptop",
    state: "Pending Approval",
    stage: "Requested",
    requestedForName: "John Doe",
    requestedByName: "Manager Name",
    priority: "3",
    approvalState: "approved",
    openedAt: new Date("2025-01-01T10:00:00Z"),
    price: 1200,
    url: "https://instance.service-now.com/sc_request.do?sys_id=req-sys-id-1",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestRepo = { findByNumber: vi.fn() };
    (getRequestRepository as any).mockReturnValue(mockRequestRepo);
    tool = createGetRequestTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  it("should retrieve request by full number (REQ prefix)", async () => {
    const mockRequest = createMockRequest();
    mockRequestRepo.findByNumber.mockResolvedValue(mockRequest);

    const result = await tool.execute({ number: "REQ0012345" });

    expect(mockRequestRepo.findByNumber).toHaveBeenCalledWith("REQ0012345");
    expect(result.success).toBe(true);
    expect(result.data?.request.number).toBe("REQ0012345");
  });

  it("should normalize request number without REQ prefix", async () => {
    const mockRequest = createMockRequest();
    mockRequestRepo.findByNumber.mockResolvedValue(mockRequest);

    await tool.execute({ number: "12345" });

    expect(mockRequestRepo.findByNumber).toHaveBeenCalledWith("REQ0012345");
  });

  it("should return error when request not found", async () => {
    mockRequestRepo.findByNumber.mockResolvedValue(null);

    const result = await tool.execute({ number: "REQ9999999" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RECORD_NOT_FOUND");
    expect(result.error?.message).toContain("REQ9999999 was not found");
  });

  it("should handle repository errors", async () => {
    mockRequestRepo.findByNumber.mockRejectedValue(new Error("DB error"));

    const result = await tool.execute({ number: "REQ0012345" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FETCH_ERROR");
  });
});
