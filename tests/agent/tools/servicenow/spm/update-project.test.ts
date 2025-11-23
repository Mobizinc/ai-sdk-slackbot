/**
 * Unit Tests for Update Project Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUpdateProjectTool } from "@/agent/tools/servicenow/spm/update-project.tool";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getSPMRepository: vi.fn(),
}));

import { getSPMRepository } from "@/infrastructure/servicenow/repositories";

describe("Update Project Tool", () => {
  let mockSPMRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockProject = (overrides?: any) => ({
    sysId: "project-sys-id-123",
    number: "PRJ0001234",
    shortDescription: "Updated project",
    description: "Updated description",
    state: "In Progress",
    priority: "2",
    url: "https://instance.service-now.com/project.do?sys_id=project-sys-id-123",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSPMRepo = {
      update: vi.fn(),
    };
    (getSPMRepository as any).mockReturnValue(mockSPMRepo);
    tool = createUpdateProjectTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Project Update", () => {
    it("should update single field - shortDescription", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        shortDescription: "Updated project name",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        shortDescription: "Updated project name",
      });
      expect(result.success).toBe(true);
      expect(result.data?.project.number).toBe("PRJ0001234");
      expect(result.data?.message).toContain("Successfully updated project PRJ0001234");
    });

    it("should update single field - state", async () => {
      const mockProject = createMockProject({ state: "Execution" });
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "Execution",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        state: "Execution",
      });
      expect(result.success).toBe(true);
    });

    it("should update single field - percentComplete", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        percentComplete: 50,
      });
      expect(result.success).toBe(true);
    });

    it("should update multiple fields at once", async () => {
      const mockProject = createMockProject({
        state: "Execution",
        priority: "1",
      });
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "Execution",
        priority: "1",
        percentComplete: 75,
        projectManager: "pm-user-new",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        state: "Execution",
        priority: "1",
        percentComplete: 75,
        projectManager: "pm-user-new",
      });
      expect(result.success).toBe(true);
    });

    it("should update all available fields", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const updates = {
        shortDescription: "New name",
        description: "New description",
        state: "Closed",
        assignedTo: "user-new",
        assignmentGroup: "PMO",
        percentComplete: 100,
        priority: "4",
        dueDate: "2025-12-31",
        projectManager: "pm-new",
        sponsor: "sponsor-new",
        lifecycleStage: "Closure",
      };

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        ...updates,
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", updates);
      expect(result.success).toBe(true);
    });

    it("should return formatted project object with all fields", async () => {
      const mockProject = createMockProject({
        state: "In Progress",
        priority: "2",
      });
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "In Progress",
        percentComplete: 45,
      });

      expect(result.success).toBe(true);
      expect(result.data?.project).toMatchObject({
        sysId: "project-sys-id-123",
        number: "PRJ0001234",
        shortDescription: expect.any(String),
        state: "In Progress",
        url: expect.stringContaining("project.do"),
      });
    });

    it("should update status during operation", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is updating project...");
    });

    it("should handle percentComplete with numeric value", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 85,
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        percentComplete: 85,
      });
      expect(result.success).toBe(true);
    });

    it("should handle date updates in ISO format", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        dueDate: "2025-11-30",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {
        dueDate: "2025-11-30",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should require sysId parameter", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        priority: "2",
      });

      expect(mockSPMRepo.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle updates with no optional fields", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {});
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository update error", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Failed to update project in ServiceNow")
      );

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "In Progress",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update project in ServiceNow");
      expect(result.error?.details).toEqual({ sysId: "project-sys-id-123" });
    });

    it("should handle project not found error", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Project PRJ0001234 not found")
      );

      const result = await tool.execute({
        sysId: "invalid-sys-id",
        percentComplete: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("not found");
    });

    it("should handle invalid field values error", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Invalid percentComplete: must be between 0 and 100")
      );

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 150,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle invalid state error", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Invalid state: 'BadState' is not recognized")
      );

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "BadState",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle authentication errors", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Unauthorized: Access denied")
      );

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockSPMRepo.update.mockRejectedValue("Unknown error occurred");

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "Execution",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update project");
    });

    it("should include sysId in error details for debugging", async () => {
      mockSPMRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        priority: "1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({ sysId: "project-sys-id-123" });
    });

    it("should handle date format validation error", async () => {
      mockSPMRepo.update.mockRejectedValue(
        new Error("Invalid date format: expected ISO format (YYYY-MM-DD)")
      );

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        dueDate: "31-12-2025", // Wrong format
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass sysId and updates to repository.update", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const updates = {
        shortDescription: "Updated title",
        state: "Execution",
        percentComplete: 50,
      };

      await tool.execute({
        sysId: "project-sys-id-123",
        ...updates,
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", updates);
    });

    it("should call repository.update exactly once", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
      });

      expect(mockSPMRepo.update).toHaveBeenCalledTimes(1);
    });

    it("should pass empty object when no updates provided", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      await tool.execute({
        sysId: "project-sys-id-123",
      });

      expect(mockSPMRepo.update).toHaveBeenCalledWith("project-sys-id-123", {});
    });
  });

  describe("Result Format Validation", () => {
    it("should return success result with correct structure", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "In Progress",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        project: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should return error result with correct structure", async () => {
      mockSPMRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
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

    it("should include project number in success message", async () => {
      const mockProject = createMockProject({
        number: "PRJ0099999",
      });
      mockSPMRepo.update.mockResolvedValue(mockProject);

      const result = await tool.execute({
        sysId: "project-sys-id-123",
        state: "Closed",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("PRJ0099999");
    });
  });

  describe("Logging", () => {
    it("should log error when update fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockSPMRepo.update.mockRejectedValue(new Error("DB error"));

      await tool.execute({
        sysId: "project-sys-id-123",
        percentComplete: 50,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[update_project] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
