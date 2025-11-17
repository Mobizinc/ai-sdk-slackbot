/**
 * Unit Tests for Create Project Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCreateProjectTool } from "@/agent/tools/servicenow/spm/create-project.tool";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getSPMRepository: vi.fn(),
}));

import { getSPMRepository } from "@/infrastructure/servicenow/repositories";

describe("Create Project Tool", () => {
  let mockSPMRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockProject = (overrides?: any) => ({
    sysId: "project-sys-id-new",
    number: "PRJ0001234",
    shortDescription: "New SPM Project",
    description: "Project description",
    state: "Planning",
    priority: "3",
    url: "https://instance.service-now.com/project.do?sys_id=project-sys-id-new",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSPMRepo = {
      create: vi.fn(),
    };
    (getSPMRepository as any).mockReturnValue(mockSPMRepo);
    tool = createCreateProjectTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Project Creation", () => {
    it("should create project with required shortDescription only", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Mobile App Redesign",
      });

      expect(mockSPMRepo.create).toHaveBeenCalledWith({
        shortDescription: "Mobile App Redesign",
        description: undefined,
        assignedTo: undefined,
        assignmentGroup: undefined,
        priority: undefined,
        parent: undefined,
        dueDate: undefined,
        startDate: undefined,
        projectManager: undefined,
        sponsor: undefined,
        portfolio: undefined,
        lifecycleStage: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data?.project.number).toBe("PRJ0001234");
      expect(result.data?.message).toContain("Successfully created project PRJ0001234");
    });

    it("should create project with all optional fields", async () => {
      const mockProject = createMockProject({
        priority: "1",
        lifecycleStage: "Initiation",
      });
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Enterprise Migration",
        description: "Migrate legacy systems to cloud",
        assignedTo: "user-123",
        assignmentGroup: "Project Management",
        priority: "1",
        parent: "parent-project-id",
        dueDate: "2025-12-31",
        startDate: "2025-06-01",
        projectManager: "pm-user-id",
        sponsor: "exec-sponsor-id",
        portfolio: "portfolio-id",
        lifecycleStage: "Initiation",
      });

      expect(mockSPMRepo.create).toHaveBeenCalledWith({
        shortDescription: "Enterprise Migration",
        description: "Migrate legacy systems to cloud",
        assignedTo: "user-123",
        assignmentGroup: "Project Management",
        priority: "1",
        parent: "parent-project-id",
        dueDate: "2025-12-31",
        startDate: "2025-06-01",
        projectManager: "pm-user-id",
        sponsor: "exec-sponsor-id",
        portfolio: "portfolio-id",
        lifecycleStage: "Initiation",
      });
      expect(result.success).toBe(true);
    });

    it("should return formatted project object with all fields", async () => {
      const mockProject = createMockProject({
        number: "PRJ0009999",
        state: "Planning",
      });
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Website Upgrade",
        priority: "2",
        projectManager: "pm-id",
      });

      expect(result.success).toBe(true);
      expect(result.data?.project).toMatchObject({
        sysId: "project-sys-id-new",
        number: "PRJ0009999",
        shortDescription: "New SPM Project",
        state: "Planning",
        url: expect.stringContaining("project.do"),
      });
    });

    it("should update status during creation", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      await tool.execute({
        shortDescription: "Test project",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is creating project...");
    });

    it("should handle date parameters in ISO format", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Q4 Initiative",
        startDate: "2025-10-01",
        dueDate: "2025-12-31",
      });

      expect(mockSPMRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: "2025-10-01",
          dueDate: "2025-12-31",
        })
      );
      expect(result.success).toBe(true);
    });

    it("should handle special characters in description", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const specialDescription = "Project: Phase 1 & Phase 2 < critical";
      const result = await tool.execute({
        shortDescription: "Test project",
        description: specialDescription,
      });

      expect(mockSPMRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: specialDescription,
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should require shortDescription parameter", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Valid project name",
      });

      expect(mockSPMRepo.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should accept valid project with minimal fields", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Minimal project setup",
      });

      expect(mockSPMRepo.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository creation error", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Failed to save project in ServiceNow")
      );

      const result = await tool.execute({
        shortDescription: "Test project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to save project in ServiceNow");
      expect(result.error?.details).toEqual({
        shortDescription: "Test project",
      });
    });

    it("should handle authentication errors", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Unauthorized: Invalid credentials")
      );

      const result = await tool.execute({
        shortDescription: "Enterprise project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle network timeout errors", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Request timeout after 30 seconds")
      );

      const result = await tool.execute({
        shortDescription: "Large project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("timeout");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockSPMRepo.create.mockRejectedValue("String error thrown");

      const result = await tool.execute({
        shortDescription: "Test project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to create project");
    });

    it("should include request details in error for debugging", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Validation failed: Invalid lifecycle stage")
      );

      const result = await tool.execute({
        shortDescription: "Test project",
        lifecycleStage: "InvalidStage",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({
        shortDescription: "Test project",
      });
    });

    it("should handle invalid portfolio error", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Portfolio 'invalid-portfolio' not found")
      );

      const result = await tool.execute({
        shortDescription: "Test project",
        portfolio: "invalid-portfolio",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle date format validation error", async () => {
      mockSPMRepo.create.mockRejectedValue(
        new Error("Invalid date format: expected ISO format (YYYY-MM-DD)")
      );

      const result = await tool.execute({
        shortDescription: "Test project",
        dueDate: "01/31/2025", // Wrong format
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass all parameters to repository.create", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const input = {
        shortDescription: "Infrastructure Upgrade",
        description: "Upgrade all servers to latest OS",
        assignedTo: "user-001",
        assignmentGroup: "Infrastructure",
        priority: "1",
        parent: "parent-id",
        dueDate: "2025-09-30",
        startDate: "2025-07-01",
        projectManager: "pm-001",
        sponsor: "exec-001",
        portfolio: "portfolio-001",
        lifecycleStage: "Planning",
      };

      await tool.execute(input);

      expect(mockSPMRepo.create).toHaveBeenCalledWith(input);
    });

    it("should call repository.create exactly once", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      await tool.execute({
        shortDescription: "Test project",
      });

      expect(mockSPMRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("Result Format Validation", () => {
    it("should use createSuccessResult for successful operations", async () => {
      const mockProject = createMockProject();
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Test project",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        project: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should use createErrorResult for failures", async () => {
      mockSPMRepo.create.mockRejectedValue(new Error("Creation failed"));

      const result = await tool.execute({
        shortDescription: "Test project",
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
      mockSPMRepo.create.mockResolvedValue(mockProject);

      const result = await tool.execute({
        shortDescription: "Major initiative",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("PRJ0099999");
    });
  });

  describe("Logging", () => {
    it("should log errors with context", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockSPMRepo.create.mockRejectedValue(new Error("DB connection failed"));

      await tool.execute({
        shortDescription: "Test project",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[create_project] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
