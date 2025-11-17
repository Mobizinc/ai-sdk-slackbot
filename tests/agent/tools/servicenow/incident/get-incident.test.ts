/**
 * Unit Tests for Get Incident Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGetIncidentTool } from "@/agent/tools/servicenow/incident/get-incident.tool";
import type { Incident } from "@/infrastructure/servicenow/types/domain-models";
import type { Case } from "@/infrastructure/servicenow/types/domain-models";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getIncidentRepository: vi.fn(),
  getCaseRepository: vi.fn(),
}));

vi.mock("../../../../../lib/infrastructure/servicenow-context", () => ({
  createServiceNowContext: vi.fn(() => ({ channelId: "test-channel" })),
}));

vi.mock("../../../../../lib/utils/case-number-normalizer", () => ({
  normalizeCaseId: vi.fn((prefix: string, number: string) => {
    if (number.startsWith(prefix)) return number;
    const numPart = number.replace(/\D/g, "");
    return `${prefix}${numPart.padStart(7, "0")}`;
  }),
  findMatchingCaseNumber: vi.fn(() => null),
}));

vi.mock("../../../../../lib/services/servicenow-formatters", () => ({
  formatIncidentForLLM: vi.fn((incident) => ({
    summary: `Incident: ${incident.short_description}`,
    rawData: incident,
  })),
}));

vi.mock("../../../../../lib/agent/tools/servicenow/shared/attachment-utils", () => ({
  fetchAttachments: vi.fn(() => Promise.resolve([])),
}));

import { getIncidentRepository, getCaseRepository } from "@/infrastructure/servicenow/repositories";
import { formatIncidentForLLM } from "@/services/servicenow-formatters";
import { fetchAttachments } from "@/agent/tools/servicenow/shared/attachment-utils";

describe("Get Incident Tool", () => {
  let mockIncidentRepo: any;
  let mockCaseRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockIncident = (overrides?: Partial<Incident>): Incident => ({
    sysId: "incident-sys-id-123",
    number: "INC0001234",
    shortDescription: "Test incident",
    description: "Detailed incident description",
    state: "Open",
    priority: "2",
    assignedTo: "John Doe",
    assignmentGroup: "IT Support",
    category: "Software",
    subcategory: "Application",
    company: "Acme Corp",
    businessService: "Email Service",
    cmdbCi: "PROD-MAIL-01",
    sysCreatedOn: new Date("2025-01-01T10:00:00Z"),
    sysUpdatedOn: new Date("2025-01-10T15:30:00Z"),
    url: "https://instance.service-now.com/incident.do?sys_id=incident-sys-id-123",
    ...overrides,
  });

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-456",
    number: "SCS1234567",
    shortDescription: "Test case",
    description: "Detailed case description",
    state: "Open",
    priority: "3",
    assignedTo: "Jane Smith",
    assignmentGroup: "Customer Support",
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-456",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockIncidentRepo = {
      findByNumber: vi.fn(),
      findBySysId: vi.fn(),
    };

    mockCaseRepo = {
      findByNumber: vi.fn(),
      findBySysId: vi.fn(),
    };

    (getIncidentRepository as any).mockReturnValue(mockIncidentRepo);
    (getCaseRepository as any).mockReturnValue(mockCaseRepo);

    tool = createGetIncidentTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Incident Retrieval", () => {
    it("should retrieve incident by full number (INC prefix)", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "INC0001234" });

      expect(mockIncidentRepo.findByNumber).toHaveBeenCalledWith("INC0001234");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is looking up incident INC0001234")
      );
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0001234");
      expect(result.data?.incident.shortDescription).toBe("Test incident");
      expect(formatIncidentForLLM).toHaveBeenCalled();
    });

    it("should normalize incident number without INC prefix", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "1234" });

      expect(mockIncidentRepo.findByNumber).toHaveBeenCalledWith("INC0001234");
      expect(result.success).toBe(true);
      expect(result.data?.incident.number).toBe("INC0001234");
    });

    it("should include formatted summary in result", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "INC0001234" });

      expect(result.success).toBe(true);
      expect(result.data?.summary).toBe("Incident: Test incident");
      expect(result.data?.rawData).toBeDefined();
    });

    it("should return all incident fields correctly", async () => {
      const mockIncident = createMockIncident({
        category: "Hardware",
        subcategory: "Laptop",
        company: "Tech Co",
      });
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "INC0001234" });

      expect(result.success).toBe(true);
      expect(result.data?.incident).toMatchObject({
        number: "INC0001234",
        shortDescription: "Test incident",
        state: "Open",
        priority: "2",
        assignedTo: "John Doe",
        assignmentGroup: "IT Support",
        category: "Hardware",
        subcategory: "Laptop",
        company: "Tech Co",
      });
    });
  });

  describe("Fallback to Case Table", () => {
    it("should fall back to case table when incident not found", async () => {
      const mockCase = createMockCase();
      mockIncidentRepo.findByNumber.mockResolvedValue(null);
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "1234567" });

      expect(mockIncidentRepo.findByNumber).toHaveBeenCalledWith("INC1234567");
      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS1234567");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is looking up INC1234567 in case table")
      );
      expect(result.success).toBe(true);
      expect(result.data?.case).toBeDefined();
      expect(result.data?.case.number).toBe("SCS1234567");
      expect(result.data?.message).toContain("Use get_case tool for case records");
    });

    it("should return error when not found in either table", async () => {
      mockIncidentRepo.findByNumber.mockResolvedValue(null);
      mockCaseRepo.findByNumber.mockResolvedValue(null);

      const result = await tool.execute({ number: "INC9999999" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RECORD_NOT_FOUND");
      expect(result.error?.message).toContain("INC9999999 was not found");
      expect(result.error?.message).toContain("Verified in both incident table");
    });
  });

  describe("Attachment Handling", () => {
    it("should fetch attachments when includeAttachments is true", async () => {
      const mockIncident = createMockIncident();
      const mockAttachments = [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
      ];
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);
      (fetchAttachments as any).mockResolvedValue(mockAttachments);

      const result = await tool.execute({
        number: "INC0001234",
        includeAttachments: true,
        maxAttachments: 3,
      });

      expect(fetchAttachments).toHaveBeenCalledWith(
        "incident",
        "incident-sys-id-123",
        true,
        3
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is fetching attachments for incident INC0001234")
      );
      expect(result.success).toBe(true);
      expect(result._attachmentBlocks).toEqual(mockAttachments);
      expect(result._attachmentCount).toBe(1);
    });

    it("should not fetch attachments when includeAttachments is false", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({
        number: "INC0001234",
        includeAttachments: false,
      });

      expect(fetchAttachments).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result._attachmentBlocks).toBeUndefined();
    });

    it("should use default maxAttachments when not specified", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);
      (fetchAttachments as any).mockResolvedValue([]);

      await tool.execute({
        number: "INC0001234",
        includeAttachments: true,
      });

      expect(fetchAttachments).toHaveBeenCalledWith(
        "incident",
        "incident-sys-id-123",
        true,
        undefined // Will use default in fetchAttachments
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle repository errors gracefully", async () => {
      mockIncidentRepo.findByNumber.mockRejectedValue(new Error("Database connection failed"));

      const result = await tool.execute({ number: "INC0001234" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Database connection failed");
      expect(result.error?.details).toEqual({ number: "INC0001234" });
    });

    it("should handle unknown errors", async () => {
      mockIncidentRepo.findByNumber.mockRejectedValue("Unknown error");

      const result = await tool.execute({ number: "INC0001234" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to retrieve incident from ServiceNow");
    });
  });

  describe("Input Validation", () => {
    it("should accept valid incident number with INC prefix", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "INC0012345" });

      expect(result.success).toBe(true);
    });

    it("should accept valid incident number without prefix", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "12345" });

      expect(result.success).toBe(true);
    });
  });

  describe("Logging and Status Updates", () => {
    it("should log the lookup process", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      await tool.execute({ number: "INC0001234" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_incident] Looking up incident:")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_incident] Found incident INC0001234:")
      );

      consoleLogSpy.mockRestore();
    });

    it("should update status during execution", async () => {
      const mockIncident = createMockIncident();
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      await tool.execute({ number: "INC0001234" });

      expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is looking up incident INC0001234..."
      );
    });
  });
});
