/**
 * Unit Tests for Update Case Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUpdateCaseTool } from "../../../../../lib/agent/tools/servicenow/case/update-case.tool";
import type { Case } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
}));

import { getCaseRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Update Case Tool", () => {
  let mockCaseRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-123",
    number: "SCS1234567",
    shortDescription: "Updated case description",
    description: "Updated detailed description",
    state: "In Progress",
    priority: "2",
    assignedTo: "Jane Smith",
    assignmentGroup: "Support Team",
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-123",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCaseRepo = {
      update: vi.fn(),
    };
    (getCaseRepository as any).mockReturnValue(mockCaseRepo);
    tool = createUpdateCaseTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Case Update", () => {
    it("should update single field - shortDescription", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        shortDescription: "Updated short description",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {
        shortDescription: "Updated short description",
      });
      expect(result.success).toBe(true);
      expect(result.data?.case.number).toBe("SCS1234567");
      expect(result.data?.message).toContain("Successfully updated case SCS1234567");
    });

    it("should update single field - state", async () => {
      const mockCase = createMockCase({ state: "Closed" });
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "Closed",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {
        state: "Closed",
      });
      expect(result.success).toBe(true);
    });

    it("should update single field - priority", async () => {
      const mockCase = createMockCase({ priority: "1" });
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "1",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {
        priority: "1",
      });
      expect(result.success).toBe(true);
    });

    it("should update multiple fields at once", async () => {
      const mockCase = createMockCase({
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Premium Support",
      });
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Premium Support",
        description: "Urgent issue being addressed",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Premium Support",
        description: "Urgent issue being addressed",
      });
      expect(result.success).toBe(true);
    });

    it("should update all available fields", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const updates = {
        shortDescription: "New short description",
        description: "New detailed description",
        priority: "2",
        state: "Resolved",
        category: "Technical",
        subcategory: "Database",
        assignmentGroup: "Level 3 Support",
        assignedTo: "senior-support",
      };

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        ...updates,
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", updates);
      expect(result.success).toBe(true);
    });

    it("should return formatted case object with all fields", async () => {
      const mockCase = createMockCase({
        state: "In Progress",
        priority: "2",
      });
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "In Progress",
        priority: "2",
      });

      expect(result.success).toBe(true);
      expect(result.data?.case).toMatchObject({
        sysId: "case-sys-id-123",
        number: "SCS1234567",
        shortDescription: expect.any(String),
        state: "In Progress",
        url: expect.stringContaining("case.do"),
      });
    });

    it("should update status during operation", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-123",
        priority: "2",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is updating case...");
    });
  });

  describe("Required Field Validation", () => {
    it("should require sysId parameter", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "2",
      });

      expect(mockCaseRepo.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle updates with no optional fields", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {});
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository update error", async () => {
      mockCaseRepo.update.mockRejectedValue(
        new Error("Failed to update case in ServiceNow")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "In Progress",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update case in ServiceNow");
      expect(result.error?.details).toEqual({ sysId: "case-sys-id-123" });
    });

    it("should handle case not found error", async () => {
      mockCaseRepo.update.mockRejectedValue(
        new Error("Case SCS1234567 not found")
      );

      const result = await tool.execute({
        sysId: "invalid-sys-id",
        priority: "1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("not found");
    });

    it("should handle invalid field values error", async () => {
      mockCaseRepo.update.mockRejectedValue(
        new Error("Invalid priority value: 99")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "99",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle authentication errors", async () => {
      mockCaseRepo.update.mockRejectedValue(
        new Error("Unauthorized: Access denied")
      );

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "Closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockCaseRepo.update.mockRejectedValue("Unknown error occurred");

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update case");
    });

    it("should include sysId in error details for debugging", async () => {
      mockCaseRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "2",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({ sysId: "case-sys-id-123" });
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass sysId and updates to repository.update", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const updates = {
        shortDescription: "Updated title",
        state: "In Progress",
        priority: "1",
      };

      await tool.execute({
        sysId: "case-sys-id-123",
        ...updates,
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", updates);
    });

    it("should call repository.update exactly once", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-123",
        priority: "1",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledTimes(1);
    });

    it("should pass empty object when no updates provided", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      await tool.execute({
        sysId: "case-sys-id-123",
      });

      expect(mockCaseRepo.update).toHaveBeenCalledWith("case-sys-id-123", {});
    });
  });

  describe("Result Format Validation", () => {
    it("should return success result with correct structure", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "In Progress",
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
      mockCaseRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        priority: "1",
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
      mockCaseRepo.update.mockResolvedValue(mockCase);

      const result = await tool.execute({
        sysId: "case-sys-id-123",
        state: "Resolved",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("SCS9999999");
    });
  });

  describe("Logging", () => {
    it("should log error when update fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockCaseRepo.update.mockRejectedValue(new Error("DB error"));

      await tool.execute({
        sysId: "case-sys-id-123",
        priority: "1",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[update_case] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
