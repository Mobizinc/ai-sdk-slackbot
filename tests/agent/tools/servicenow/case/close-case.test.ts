/**
 * Unit Tests for Close Case Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCloseCaseTool } from "@/agent/tools/servicenow/case/close-case.tool";
import type { Case } from "@/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
}));

import { getCaseRepository } from "@/infrastructure/servicenow/repositories";

describe("Close Case Tool", () => {
  let mockCaseRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-closed",
    number: "SCS5555555",
    shortDescription: "Resolved customer case",
    description: "Case has been resolved",
    state: "Closed",
    priority: "3",
    assignedTo: "John Doe",
    assignmentGroup: "Customer Support",
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-closed",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCaseRepo = {
      close: vi.fn(),
    };
    (getCaseRepository as any).mockReturnValue(mockCaseRepo);
    tool = createCloseCaseTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Case Closure", () => {
    it("should close case with sysId only", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        undefined,
        undefined
      );
      expect(result.success).toBe(true);
      expect(result.data?.case.number).toBe("SCS5555555");
      expect(result.data?.case.state).toBe("Closed");
      expect(result.data?.message).toContain("Successfully closed case SCS5555555");
    });

    it("should close case with closeCode only", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "resolved",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        "resolved",
        undefined
      );
      expect(result.success).toBe(true);
    });

    it("should close case with closeNotes only", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeNotes: "Customer confirmed issue is resolved",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        undefined,
        "Customer confirmed issue is resolved"
      );
      expect(result.success).toBe(true);
    });

    it("should close case with both closeCode and closeNotes", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "Issue fixed and tested by customer",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        "resolved",
        "Issue fixed and tested by customer"
      );
      expect(result.success).toBe(true);
    });

    it("should return formatted closed case object", async () => {
      const mockCase = createMockCase({
        state: "Closed",
        number: "SCS1234567",
      });
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "All issues addressed",
      });

      expect(result.success).toBe(true);
      expect(result.data?.case).toMatchObject({
        sysId: "case-sys-id-closed",
        number: "SCS1234567",
        shortDescription: expect.any(String),
        state: "Closed",
        url: expect.stringContaining("case.do"),
      });
    });

    it("should update status during closure", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is closing case...");
    });

    it("should handle special characters in closeNotes", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const specialNotes = "Issue fixed: Customer needs to update & restart app < important";
      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeNotes: specialNotes,
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        undefined,
        specialNotes
      );
      expect(result.success).toBe(true);
    });

    it("should handle multiline closeNotes", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const multilineNotes = "Step 1: Applied patch\nStep 2: Tested in production\nStep 3: Verified by customer";
      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeNotes: multilineNotes,
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        undefined,
        multilineNotes
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should require sysId parameter", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(mockCaseRepo.close).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository close error", async () => {
      mockCaseRepo.close.mockRejectedValue(
        new Error("Failed to close case in ServiceNow")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to close case in ServiceNow");
      expect(result.error?.details).toEqual({ sysId: "case-sys-id-closed" });
    });

    it("should handle case not found error", async () => {
      mockCaseRepo.close.mockRejectedValue(
        new Error("Case SCS1234567 not found")
      );

      const result = await tool.execute({
        sysId: "invalid-sys-id",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("not found");
    });

    it("should handle case already closed error", async () => {
      mockCaseRepo.close.mockRejectedValue(
        new Error("Cannot close: Case is already closed")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("already closed");
    });

    it("should handle invalid close code error", async () => {
      mockCaseRepo.close.mockRejectedValue(
        new Error("Invalid closeCode: 'bad_code' is not recognized")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "bad_code",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle authentication errors", async () => {
      mockCaseRepo.close.mockRejectedValue(
        new Error("Unauthorized: Access denied")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockCaseRepo.close.mockRejectedValue("Unexpected error");

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to close case");
    });

    it("should include sysId in error details for debugging", async () => {
      mockCaseRepo.close.mockRejectedValue(new Error("Close failed"));

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "resolved",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({ sysId: "case-sys-id-closed" });
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass all parameters to repository.close", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "Issue resolved and verified",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        "resolved",
        "Issue resolved and verified"
      );
    });

    it("should call repository.close exactly once", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined for optional parameters not provided", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(mockCaseRepo.close).toHaveBeenCalledWith(
        "case-sys-id-closed",
        undefined,
        undefined
      );
    });
  });

  describe("Result Format Validation", () => {
    it("should return success result with correct structure", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        case: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should return error result with correct structure", async () => {
      mockCaseRepo.close.mockRejectedValue(new Error("Close failed"));

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toMatchObject({
        code: "FETCH_ERROR",
        message: expect.any(String),
        details: expect.any(Object),
      });
      expect(result).not.toHaveProperty("data");
    });

    it("should include case number in success message", async () => {
      const mockCase = createMockCase({
        number: "SCS9999999",
      });
      mockCaseRepo.close.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("SCS9999999");
    });
  });

  describe("Logging", () => {
    it("should log error when close fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockCaseRepo.close.mockRejectedValue(new Error("DB error"));

      await tool.execute({
        sysId: "case-sys-id-closed",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[close_case] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
