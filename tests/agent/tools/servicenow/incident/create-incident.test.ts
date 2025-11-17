/**
 * Unit Tests for Create Incident Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCreateIncidentTool } from "@/agent/tools/servicenow/incident/create-incident.tool";
import type { Incident } from "@/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getIncidentRepository: vi.fn(),
}));

import { getIncidentRepository } from "@/infrastructure/servicenow/repositories";

describe("Create Incident Tool", () => {
  let mockIncidentRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockIncident = (overrides?: Partial<Incident>): Incident => ({
    sysId: "incident-sys-id-new",
    number: "INC0009999",
    shortDescription: "Test Incident",
    description: "Detailed incident description",
    state: "New",
    priority: "3",
    assignedTo: "John Doe",
    assignmentGroup: "IT Support",
    category: "Software",
    subcategory: "Application",
    company: "Acme Corp",
    businessService: "Email Service",
    cmdbCi: "PROD-MAIL-01",
    sysCreatedOn: new Date("2025-01-01T10:00:00Z"),
    sysUpdatedOn: new Date("2025-01-10T15:30:00Z"),
    url: "https://instance.service-now.com/incident.do?sys_id=incident-sys-id-new",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIncidentRepo = {
      create: vi.fn(),
    };
    (getIncidentRepository as any).mockReturnValue(mockIncidentRepo);
    tool = createCreateIncidentTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Incident Creation", () => {
    it("should create incident with required shortDescription only", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        shortDescription: "Network connectivity issue",
      });

      expect(mockIncidentRepo.create).toHaveBeenCalledWith({
        shortDescription: "Network connectivity issue",
        description: undefined,
        caller: undefined,
        category: undefined,
        priority: undefined,
        assignmentGroup: undefined,
        parent: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0009999");
      expect(result.data?.incident.shortDescription).toBe("Test Incident");
      expect(result.data?.message).toContain("Successfully created incident INC0009999");
    });

    it("should create incident with all optional fields", async () => {
      const mockIncident = createMockIncident({
        category: "Hardware",
        priority: "1",
        assignmentGroup: "Database Team",
      });
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        shortDescription: "Database server down",
        description: "Production database server is unresponsive",
        caller: "user123",
        category: "Hardware",
        priority: "1",
        assignmentGroup: "Database Team",
        parent: "parent-sys-id",
      });

      expect(mockIncidentRepo.create).toHaveBeenCalledWith({
        shortDescription: "Database server down",
        description: "Production database server is unresponsive",
        caller: "user123",
        category: "Hardware",
        priority: "1",
        assignmentGroup: "Database Team",
        parent: "parent-sys-id",
      });
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0009999");
    });

    it("should return formatted incident object with all fields", async () => {
      const mockIncident = createMockIncident({
        priority: "2",
        assignmentGroup: "Application Support",
      });
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        shortDescription: "Application crash",
        description: "App crashes on startup",
        priority: "2",
        assignmentGroup: "Application Support",
      });

      expect(result.success).toBe(true);
      expect(result.data?.incident).toMatchObject({
        sysId: "incident-sys-id-new",
        number: "INC0009999",
        shortDescription: "Test Incident",
        description: "Detailed incident description",
        state: "New",
        priority: "2",
        assignmentGroup: "Application Support",
        url: expect.stringContaining("incident.do"),
      });
    });

    it("should update status during creation", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      await tool.execute({
        shortDescription: "Test issue",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is creating incident...");
    });

    it("should handle special characters in description", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const specialDescription = "Issue with & special < > chars";
      const result = await tool.execute({
        shortDescription: "Test incident",
        description: specialDescription,
      });

      expect(mockIncidentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: specialDescription,
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should accept valid shortDescription", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        shortDescription: "Valid incident description",
      });

      expect(mockIncidentRepo.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository creation error", async () => {
      mockIncidentRepo.create.mockRejectedValue(
        new Error("Failed to save incident in ServiceNow")
      );

      const result = await tool.execute({
        shortDescription: "Test incident",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to save incident in ServiceNow");
      expect(result.error?.details).toEqual({
        shortDescription: "Test incident",
        category: undefined,
        priority: undefined,
      });
    });

    it("should handle authentication errors", async () => {
      mockIncidentRepo.create.mockRejectedValue(
        new Error("Unauthorized: Invalid credentials")
      );

      const result = await tool.execute({
        shortDescription: "Urgent issue",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle network timeout errors", async () => {
      mockIncidentRepo.create.mockRejectedValue(
        new Error("Request timeout after 30 seconds")
      );

      const result = await tool.execute({
        shortDescription: "Network connectivity issue",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("timeout");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockIncidentRepo.create.mockRejectedValue("String error thrown");

      const result = await tool.execute({
        shortDescription: "Test incident",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to create incident in ServiceNow");
    });

    it("should include request details in error for debugging", async () => {
      mockIncidentRepo.create.mockRejectedValue(
        new Error("Validation failed: Invalid category")
      );

      const result = await tool.execute({
        shortDescription: "Test incident",
        category: "InvalidCategory",
        priority: "5",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({
        shortDescription: "Test incident",
        category: "InvalidCategory",
        priority: "5",
      });
    });
  });

  describe("Logging", () => {
    it("should log incident creation start", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      await tool.execute({
        shortDescription: "Test incident creation",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[create_incident] Creating incident:")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test incident creation")
      );

      consoleLogSpy.mockRestore();
    });

    it("should log success with incident number and sysId", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockIncident = createMockIncident({
        number: "INC0012345",
        sysId: "sys-id-12345",
      });
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      await tool.execute({
        shortDescription: "Test incident",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[create_incident] Created incident INC0012345")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("sys-id-12345")
      );

      consoleLogSpy.mockRestore();
    });

    it("should log errors with context", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockIncidentRepo.create.mockRejectedValue(new Error("DB connection failed"));

      await tool.execute({
        shortDescription: "Test incident",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[create_incident] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass all parameters to repository.create", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const input = {
        shortDescription: "Server down alert",
        description: "Production server stopped responding",
        caller: "admin@example.com",
        category: "Infrastructure",
        priority: "1",
        assignmentGroup: "System Admin",
        parent: "parent-inc-id",
      };

      await tool.execute(input);

      expect(mockIncidentRepo.create).toHaveBeenCalledWith(input);
    });

    it("should call repository.create exactly once", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      await tool.execute({
        shortDescription: "Test incident",
      });

      expect(mockIncidentRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("Result Format Validation", () => {
    it("should use createSuccessResult for successful operations", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.create.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        shortDescription: "Test incident",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        incident: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should use createErrorResult for failures", async () => {
      mockIncidentRepo.create.mockRejectedValue(new Error("Creation failed"));

      const result = await tool.execute({
        shortDescription: "Test incident",
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
  });
});
