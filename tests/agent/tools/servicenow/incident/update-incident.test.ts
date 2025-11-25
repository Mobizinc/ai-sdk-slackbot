/**
 * Unit Tests for Update Incident Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUpdateIncidentTool } from "../../../../../lib/agent/tools/servicenow/incident/update-incident.tool";
import type { Incident } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getIncidentRepository: vi.fn(),
}));

import { getIncidentRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Update Incident Tool", () => {
  let mockIncidentRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockIncident = (overrides?: Partial<Incident>): Incident => ({
    sysId: "incident-sys-id-123",
    number: "INC0001234",
    shortDescription: "Updated short description",
    description: "Updated incident description",
    state: "In Progress",
    priority: "2",
    assignedTo: "Jane Smith",
    assignmentGroup: "Application Support",
    category: "Software",
    subcategory: "Application",
    company: "Acme Corp",
    businessService: "Email Service",
    cmdbCi: "PROD-MAIL-01",
    sysCreatedOn: new Date("2025-01-01T10:00:00Z"),
    sysUpdatedOn: new Date("2025-01-15T15:30:00Z"),
    url: "https://instance.service-now.com/incident.do?sys_id=incident-sys-id-123",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIncidentRepo = {
      update: vi.fn(),
    };
    (getIncidentRepository as any).mockReturnValue(mockIncidentRepo);
    tool = createUpdateIncidentTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Incident Update", () => {
    it("should update single field - shortDescription", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        shortDescription: "Updated short description",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {
        shortDescription: "Updated short description",
      });
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0001234");
      expect(result.data?.message).toContain("Successfully updated incident INC0001234");
    });

    it("should update single field - state", async () => {
      const mockIncident = createMockIncident({ state: "Closed" });
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "Closed",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {
        state: "Closed",
      });
      expect(result.success).toBe(true);
    });

    it("should update single field - priority", async () => {
      const mockIncident = createMockIncident({ priority: "1" });
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "1",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {
        priority: "1",
      });
      expect(result.success).toBe(true);
    });

    it("should update multiple fields at once", async () => {
      const mockIncident = createMockIncident({
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Database Team",
      });
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Database Team",
        description: "Working on resolution",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {
        state: "In Progress",
        priority: "1",
        assignmentGroup: "Database Team",
        description: "Working on resolution",
      });
      expect(result.success).toBe(true);
    });

    it("should update all available fields", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const updates = {
        shortDescription: "New short description",
        description: "New detailed description",
        state: "Resolved",
        priority: "4",
        assignmentGroup: "Level 3 Support",
      };

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        ...updates,
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", updates);
      expect(result.success).toBe(true);
    });

    it("should return formatted incident object with all fields", async () => {
      const mockIncident = createMockIncident({
        state: "In Progress",
        priority: "2",
      });
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "In Progress",
        priority: "2",
      });

      expect(result.success).toBe(true);
      expect(result.data?.incident).toMatchObject({
        sysId: "incident-sys-id-123",
        number: "INC0001234",
        shortDescription: expect.any(String),
        state: "In Progress",
        url: expect.stringContaining("incident.do"),
      });
    });

    it("should update status during operation", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "2",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is updating incident...");
    });
  });

  describe("Required Field Validation", () => {
    it("should require sysId parameter", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "2",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should handle updates with no optional fields", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {});
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository update error", async () => {
      mockIncidentRepo.update.mockRejectedValue(
        new Error("Failed to update incident in ServiceNow")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "In Progress",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update incident in ServiceNow");
      expect(result.error?.details).toEqual({ sysId: "incident-sys-id-123" });
    });

    it("should handle incident not found error", async () => {
      mockIncidentRepo.update.mockRejectedValue(
        new Error("Incident INC0001234 not found")
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
      mockIncidentRepo.update.mockRejectedValue(
        new Error("Invalid priority value: 99")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "99",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle authentication errors", async () => {
      mockIncidentRepo.update.mockRejectedValue(
        new Error("Unauthorized: Access denied")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "Closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockIncidentRepo.update.mockRejectedValue("Unknown error occurred");

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to update incident");
    });

    it("should include sysId in error details for debugging", async () => {
      mockIncidentRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "2",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({ sysId: "incident-sys-id-123" });
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass sysId and updates to repository.update", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const updates = {
        shortDescription: "Updated title",
        state: "In Progress",
        priority: "1",
      };

      await tool.execute({
        sysId: "incident-sys-id-123",
        ...updates,
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", updates);
    });

    it("should call repository.update exactly once", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "1",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledTimes(1);
    });

    it("should pass empty object when no updates provided", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-123",
      });

      expect(mockIncidentRepo.update).toHaveBeenCalledWith("incident-sys-id-123", {});
    });
  });

  describe("Result Format Validation", () => {
    it("should return success result with correct structure", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "In Progress",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        incident: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should return error result with correct structure", async () => {
      mockIncidentRepo.update.mockRejectedValue(new Error("Update failed"));

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
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

    it("should include incident number in success message", async () => {
      const mockIncident = createMockIncident({
        number: "INC0009999",
      });
      mockIncidentRepo.update.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-123",
        state: "Resolved",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("INC0009999");
    });
  });

  describe("Logging", () => {
    it("should log error when update fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockIncidentRepo.update.mockRejectedValue(new Error("DB error"));

      await tool.execute({
        sysId: "incident-sys-id-123",
        priority: "1",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[update_incident] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
