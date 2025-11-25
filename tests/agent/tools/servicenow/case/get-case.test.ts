/**
 * Unit Tests for Get Case Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGetCaseTool } from "../../../../../lib/agent/tools/servicenow/case/get-case.tool";
import type { Case, Incident } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
  getIncidentRepository: vi.fn(),
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
  detectTableFromPrefix: vi.fn((number: string) => {
    if (number.startsWith("REQ")) return { prefix: "REQ", table: "sc_request" };
    if (number.startsWith("RITM")) return { prefix: "RITM", table: "sc_req_item" };
    if (number.startsWith("SCTASK")) return { prefix: "SCTASK", table: "sc_task" };
    return null;
  }),
}));

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getCaseJournal: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock("../../../../../lib/agent/tools/servicenow/shared/attachment-utils", () => ({
  fetchAttachments: vi.fn(() => Promise.resolve([])),
  extractReference: vi.fn((value) => value),
}));

import { getCaseRepository, getIncidentRepository } from "../../../../../lib/infrastructure/servicenow/repositories";
import { serviceNowClient } from "../../../../../lib/tools/servicenow";
import { fetchAttachments } from "../../../../../lib/agent/tools/servicenow/shared/attachment-utils";

describe("Get Case Tool", () => {
  let mockCaseRepo: any;
  let mockIncidentRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-456",
    number: "SCS1234567",
    shortDescription: "Test case",
    description: "Detailed case description",
    state: "Open",
    priority: "3",
    impact: "2",
    assignedTo: "Jane Smith",
    assignmentGroup: "Customer Support",
    accountName: "Acme Corp",
    companyName: "Acme Industries",
    category: "Support",
    subcategory: "Technical",
    contactName: "John Customer",
    openedAt: new Date("2025-01-01T10:00:00Z"),
    updatedOn: new Date("2025-01-10T15:30:00Z"),
    ageDays: 9,
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-456",
    ...overrides,
  });

  const createMockIncident = (overrides?: Partial<Incident>): Incident => ({
    sysId: "incident-sys-id-123",
    number: "INC0001234",
    shortDescription: "Test incident",
    state: "Open",
    priority: "2",
    assignedTo: "John Doe",
    assignmentGroup: "IT Support",
    url: "https://instance.service-now.com/incident.do?sys_id=incident-sys-id-123",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockCaseRepo = {
      findByNumber: vi.fn(),
      findBySysId: vi.fn(),
      getJournalEntries: vi.fn().mockResolvedValue([]),
    };

    mockIncidentRepo = {
      findByNumber: vi.fn(),
      findBySysId: vi.fn(),
    };

    (getCaseRepository as any).mockReturnValue(mockCaseRepo);
    (getIncidentRepository as any).mockReturnValue(mockIncidentRepo);

    tool = createGetCaseTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Case Retrieval", () => {
    it("should retrieve case by full number (SCS prefix)", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "SCS1234567" });

      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS1234567");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is looking up case SCS1234567")
      );
      expect(result.success).toBe(true);
      expect(result.data?.case.number).toBe("SCS1234567");
      expect(result.data?.case.shortDescription).toBe("Test case");
    });

    it("should normalize case number without SCS prefix", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "1234567" });

      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS1234567");
      expect(result.success).toBe(true);
    });

    it("should include all case fields in result", async () => {
      const mockCase = createMockCase({
        accountName: "Tech Co",
        contactName: "Jane Contact",
        ageDays: 15,
      });
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "SCS1234567" });

      expect(result.success).toBe(true);
      expect(result.data?.case).toMatchObject({
        number: "SCS1234567",
        shortDescription: "Test case",
        state: "Open",
        priority: "3",
        impact: "2",
        assignedTo: "Jane Smith",
        account: "Tech Co",
        contact: "Jane Contact",
        ageDays: 15,
      });
    });
  });

  describe("Journal Entry Retrieval", () => {
    it("should fetch journal entries by default (includeJournal=true)", async () => {
      const mockCase = createMockCase();
      const mockJournals = [
        { sysId: "j1", value: "Comment 1" },
        { sysId: "j2", value: "Comment 2" },
      ];
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      // Journal entries are now fetched via repository, not serviceNowClient

      const result = await tool.execute({ number: "SCS1234567" });

      expect(mockCaseRepo.getJournalEntries).toHaveBeenCalledWith(
        "case-sys-id-456",
        { limit: 20 }
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is fetching recent activity for case SCS1234567")
      );
      expect(result.success).toBe(true);
      expect(result.data?.journals).toEqual(mockJournals);
    });

    it("should skip journal entries when includeJournal=false", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({
        number: "SCS1234567",
        includeJournal: false,
      });

      expect(mockCaseRepo.getJournalEntries).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data?.journals).toEqual([]);
    });

    it("should continue if journal fetch fails", async () => {
      const mockCase = createMockCase();
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      mockCaseRepo.getJournalEntries.mockRejectedValue(new Error("Journal fetch failed"));

      const result = await tool.execute({ number: "SCS1234567" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_case] Failed to fetch journal for SCS1234567"),
        expect.any(Error)
      );
      expect(result.success).toBe(true);
      expect(result.data?.journals).toEqual([]);

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Fallback to Incident Table", () => {
    it("should fall back to incident table when case not found", async () => {
      const mockIncident = createMockIncident();
      mockCaseRepo.findByNumber.mockResolvedValue(null);
      mockIncidentRepo.findByNumber.mockResolvedValue(mockIncident);

      const result = await tool.execute({ number: "1234567" });

      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS1234567");
      expect(mockIncidentRepo.findByNumber).toHaveBeenCalledWith("INC1234567");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is looking up SCS1234567 in incident table")
      );
      expect(result.success).toBe(true);
      expect(result.data?.incident).toBeDefined();
      expect(result.data?.message).toContain("Use get_incident tool for incident records");
    });

    it("should return error when not found in either table", async () => {
      mockCaseRepo.findByNumber.mockResolvedValue(null);
      mockIncidentRepo.findByNumber.mockResolvedValue(null);

      const result = await tool.execute({ number: "SCS9999999" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RECORD_NOT_FOUND");
      expect(result.error?.message).toContain("SCS9999999 was not found");
      expect(result.error?.message).toContain("Verified in both case table");
    });
  });

  describe("Service Catalog Detection", () => {
    it("should reject REQ numbers with appropriate error", async () => {
      const result = await tool.execute({ number: "REQ0012345" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("appears to be a REQ record");
      expect(result.error?.message).toContain("use get_request tool");
    });

    it("should reject RITM numbers with appropriate error", async () => {
      const result = await tool.execute({ number: "RITM0012345" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("appears to be a RITM record");
      expect(result.error?.message).toContain("use get_requested_item tool");
    });

    it("should reject SCTASK numbers with appropriate error", async () => {
      const result = await tool.execute({ number: "SCTASK0012345" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("appears to be a SCTASK record");
      expect(result.error?.message).toContain("use get_catalog_task tool");
    });
  });

  describe("Attachment Handling", () => {
    it("should fetch attachments when includeAttachments is true", async () => {
      const mockCase = createMockCase();
      const mockAttachments = [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "xyz789" } },
      ];
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      (fetchAttachments as any).mockResolvedValue(mockAttachments);

      const result = await tool.execute({
        number: "SCS1234567",
        includeAttachments: true,
        maxAttachments: 5,
      });

      expect(fetchAttachments).toHaveBeenCalledWith(
        "sn_customerservice_case",
        "case-sys-id-456",
        true,
        5
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is fetching attachments for case SCS1234567")
      );
      expect(result.success).toBe(true);
      expect(result._attachmentBlocks).toEqual(mockAttachments);
      expect(result._attachmentCount).toBe(1);
    });

    it("should not fetch attachments by default", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "SCS1234567" });

      expect(fetchAttachments).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository errors gracefully", async () => {
      mockCaseRepo.findByNumber.mockRejectedValue(new Error("Network timeout"));

      const result = await tool.execute({ number: "SCS1234567" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Network timeout");
    });

    it("should handle unknown errors", async () => {
      mockCaseRepo.findByNumber.mockRejectedValue("Unknown error");

      const result = await tool.execute({ number: "SCS1234567" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to retrieve case from ServiceNow");
    });
  });

  describe("Logging and Status Updates", () => {
    it("should log the lookup process", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      await tool.execute({ number: "SCS1234567" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_case] Looking up case:")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_case] Found case SCS1234567:")
      );

      consoleLogSpy.mockRestore();
    });

    it("should update status multiple times during execution", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      await tool.execute({ number: "SCS1234567" });

      expect(mockUpdateStatus).toHaveBeenCalledTimes(2); // lookup + journal fetch
    });
  });
});
