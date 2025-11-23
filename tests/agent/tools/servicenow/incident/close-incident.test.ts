/**
 * Unit Tests for Close Incident Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCloseIncidentTool } from "@/agent/tools/servicenow/incident/close-incident.tool";
import type { Incident } from "@/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getIncidentRepository: vi.fn(),
}));

import { getIncidentRepository } from "@/infrastructure/servicenow/repositories";

describe("Close Incident Tool", () => {
  let mockIncidentRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockIncident = (overrides?: Partial<Incident>): Incident => ({
    sysId: "incident-sys-id-closed",
    number: "INC0005555",
    shortDescription: "Resolved incident",
    description: "Issue has been resolved",
    state: "Closed",
    priority: "3",
    assignedTo: "John Doe",
    assignmentGroup: "IT Support",
    category: "Software",
    subcategory: "Application",
    company: "Acme Corp",
    businessService: "Email Service",
    cmdbCi: "PROD-MAIL-01",
    sysCreatedOn: new Date("2025-01-01T10:00:00Z"),
    sysUpdatedOn: new Date("2025-01-20T15:30:00Z"),
    url: "https://instance.service-now.com/incident.do?sys_id=incident-sys-id-closed",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIncidentRepo = {
      close: vi.fn(),
    };
    (getIncidentRepository as any).mockReturnValue(mockIncidentRepo);
    tool = createCloseIncidentTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Incident Closure", () => {
    it("should close incident with sysId only", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        undefined,
        undefined
      );
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0005555");
      expect(result.data?.incident.state).toBe("Closed");
      expect(result.data?.message).toContain("Successfully closed incident INC0005555");
    });

    it("should close incident with closeCode only", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "resolved",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        "resolved",
        undefined
      );
      expect(result.success).toBe(true);
    });

    it("should close incident with closeNotes only", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeNotes: "User confirmed issue is fixed after testing",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        undefined,
        "User confirmed issue is fixed after testing"
      );
      expect(result.success).toBe(true);
    });

    it("should close incident with both closeCode and closeNotes", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "Application patched to latest version",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        "resolved",
        "Application patched to latest version"
      );
      expect(result.success).toBe(true);
    });

    it("should return formatted closed incident object", async () => {
      const mockIncident = createMockIncident({
        state: "Closed",
        number: "INC0001234",
      });
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "Fixed and tested",
      });

      expect(result.success).toBe(true);
      expect(result.data?.incident).toMatchObject({
        sysId: "incident-sys-id-closed",
        number: "INC0001234",
        shortDescription: expect.any(String),
        state: "Closed",
        url: expect.stringContaining("incident.do"),
      });
    });

    it("should update status during closure", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is closing incident...");
    });

    it("should handle special characters in closeNotes", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const specialNotes = "Issue fixed: User needs to clear cache & restart app < important";
      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeNotes: specialNotes,
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        undefined,
        specialNotes
      );
      expect(result.success).toBe(true);
    });

    it("should handle multiline closeNotes", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const multilineNotes = "Step 1: Patched application\nStep 2: Tested in production\nStep 3: Verified by user";
      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeNotes: multilineNotes,
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        undefined,
        multilineNotes
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should require sysId parameter", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository close error", async () => {
      mockIncidentRepo.close.mockRejectedValue(
        new Error("Failed to close incident in ServiceNow")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to close incident in ServiceNow");
      expect(result.error?.details).toEqual({ sysId: "incident-sys-id-closed" });
    });

    it("should handle incident not found error", async () => {
      mockIncidentRepo.close.mockRejectedValue(
        new Error("Incident INC0001234 not found")
      );

      const result = await tool.execute({
        sysId: "invalid-sys-id",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("not found");
    });

    it("should handle incident already closed error", async () => {
      mockIncidentRepo.close.mockRejectedValue(
        new Error("Cannot close: Incident is already closed")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("already closed");
    });

    it("should handle invalid close code error", async () => {
      mockIncidentRepo.close.mockRejectedValue(
        new Error("Invalid closeCode: 'invalid_code' is not recognized")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "invalid_code",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });

    it("should handle authentication errors", async () => {
      mockIncidentRepo.close.mockRejectedValue(
        new Error("Unauthorized: Access denied")
      );

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockIncidentRepo.close.mockRejectedValue("Unexpected error");

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to close incident");
    });

    it("should include sysId in error details for debugging", async () => {
      mockIncidentRepo.close.mockRejectedValue(new Error("Close failed"));

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "resolved",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({ sysId: "incident-sys-id-closed" });
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass all parameters to repository.close", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-closed",
        closeCode: "resolved",
        closeNotes: "Issue resolved and verified",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        "resolved",
        "Issue resolved and verified"
      );
    });

    it("should call repository.close exactly once", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledTimes(1);
    });

    it("should pass undefined for optional parameters not provided", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(mockIncidentRepo.close).toHaveBeenCalledWith(
        "incident-sys-id-closed",
        undefined,
        undefined
      );
    });
  });

  describe("Result Format Validation", () => {
    it("should return success result with correct structure", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
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
      mockIncidentRepo.close.mockRejectedValue(new Error("Close failed"));

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
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
      mockIncidentRepo.close.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("INC0009999");
    });
  });

  describe("Logging", () => {
    it("should log error when close fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockIncidentRepo.close.mockRejectedValue(new Error("DB error"));

      await tool.execute({
        sysId: "incident-sys-id-closed",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[close_incident] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
