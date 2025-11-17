/**
 * Unit Tests for Get Case Journal Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGetCaseJournalTool } from "@/agent/tools/servicenow/case/get-case-journal.tool";
import type { Case } from "@/infrastructure/servicenow/types/domain-models";

// Mock dependencies
vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
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

vi.mock("../../../../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getCaseJournal: vi.fn(),
  },
}));

vi.mock("../../../../../lib/services/servicenow-formatters", () => ({
  formatJournalEntriesForLLM: vi.fn((entries, ref) => ({
    summary: `Journal entries for ${ref}`,
    rawData: entries,
  })),
}));

vi.mock("../../../../../lib/agent/tools/servicenow/shared/attachment-utils", () => ({
  extractReference: vi.fn((value) => value),
}));

import { getCaseRepository } from "@/infrastructure/servicenow/repositories";
import { serviceNowClient } from "@/tools/servicenow";
import { formatJournalEntriesForLLM } from "@/services/servicenow-formatters";

describe("Get Case Journal Tool", () => {
  let mockCaseRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-789",
    number: "SCS7654321",
    shortDescription: "Test case for journal",
    state: "Open",
    priority: "3",
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-789",
    ...overrides,
  });

  const createMockJournalEntries = () => [
    { sys_id: "j1", value: "First comment", sys_created_on: "2025-01-01T10:00:00Z", sys_created_by: "user1" },
    { sys_id: "j2", value: "Second comment", sys_created_on: "2025-01-02T11:00:00Z", sys_created_by: "user2" },
    { sys_id: "j3", value: "Third comment", sys_created_on: "2025-01-03T12:00:00Z", sys_created_by: "user3" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockCaseRepo = {
      findByNumber: vi.fn(),
      findBySysId: vi.fn(),
    };

    (getCaseRepository as any).mockReturnValue(mockCaseRepo);

    tool = createGetCaseJournalTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Journal Retrieval by caseSysId", () => {
    it("should retrieve journal entries using caseSysId", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(serviceNowClient.getCaseJournal).toHaveBeenCalledWith(
        "case-sys-id-789",
        { limit: 20 },
        expect.any(Object)
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is fetching journal entries for case-sys-id-789")
      );
      expect(result.success).toBe(true);
      expect(result.data?.entries).toEqual(mockJournals);
      expect(result.data?.totalEntries).toBe(3);
    });

    it("should use custom limit when provided", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({
        caseSysId: "case-sys-id-789",
        limit: 50,
      });

      expect(serviceNowClient.getCaseJournal).toHaveBeenCalledWith(
        "case-sys-id-789",
        { limit: 50 },
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it("should include formatted summary in result", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(formatJournalEntriesForLLM).toHaveBeenCalledWith(mockJournals, "case-sys-id-789");
      expect(result.success).toBe(true);
      expect(result.data?.summary).toBe("Journal entries for case-sys-id-789");
      expect(result.data?.rawData).toEqual(mockJournals);
    });
  });

  describe("Successful Journal Retrieval by Case Number", () => {
    it("should look up case first when number is provided", async () => {
      const mockCase = createMockCase();
      const mockJournals = createMockJournalEntries();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ number: "SCS7654321" });

      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS7654321");
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is looking up case SCS7654321")
      );
      expect(serviceNowClient.getCaseJournal).toHaveBeenCalledWith(
        "case-sys-id-789",
        { limit: 20 },
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });

    it("should normalize case number without SCS prefix", async () => {
      const mockCase = createMockCase();
      const mockJournals = createMockJournalEntries();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ number: "7654321" });

      expect(mockCaseRepo.findByNumber).toHaveBeenCalledWith("SCS7654321");
      expect(result.success).toBe(true);
    });

    it("should return error when case not found by number", async () => {
      mockCaseRepo.findByNumber.mockResolvedValue(null);

      const result = await tool.execute({ number: "SCS9999999" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RECORD_NOT_FOUND");
      expect(result.error?.message).toContain("SCS9999999 was not found");
      expect(result.error?.message).toContain("Cannot retrieve journal entries");
    });

    it("should return error when case has no sys_id", async () => {
      const mockCase = { ...createMockCase(), sysId: null as any };
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);

      const result = await tool.execute({ number: "SCS7654321" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unable to access sys_id");
    });
  });

  describe("Input Validation", () => {
    it("should return error when neither caseSysId nor number is provided", async () => {
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_INPUT");
      expect(result.error?.message).toContain("Either caseSysId or number must be provided");
    });

    it("should accept caseSysId alone", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(result.success).toBe(true);
      expect(mockCaseRepo.findByNumber).not.toHaveBeenCalled();
    });

    it("should accept number alone", async () => {
      const mockCase = createMockCase();
      const mockJournals = createMockJournalEntries();
      mockCaseRepo.findByNumber.mockResolvedValue(mockCase);
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      const result = await tool.execute({ number: "SCS7654321" });

      expect(result.success).toBe(true);
    });
  });

  describe("Default Limit Behavior", () => {
    it("should use default limit of 20 when not specified", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(serviceNowClient.getCaseJournal).toHaveBeenCalledWith(
        "case-sys-id-789",
        { limit: 20 },
        expect.any(Object)
      );
    });

    it("should respect custom limit parameter", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      await tool.execute({ caseSysId: "case-sys-id-789", limit: 5 });

      expect(serviceNowClient.getCaseJournal).toHaveBeenCalledWith(
        "case-sys-id-789",
        { limit: 5 },
        expect.any(Object)
      );
    });
  });

  describe("Empty Journal Handling", () => {
    it("should handle empty journal entries gracefully", async () => {
      (serviceNowClient.getCaseJournal as any).mockResolvedValue([]);

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(result.success).toBe(true);
      expect(result.data?.entries).toEqual([]);
      expect(result.data?.totalEntries).toBe(0);
    });

    it("should handle null journal response", async () => {
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(null);

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(result.success).toBe(true);
      expect(result.data?.entries).toEqual([]);
      expect(result.data?.totalEntries).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle serviceNowClient errors gracefully", async () => {
      (serviceNowClient.getCaseJournal as any).mockRejectedValue(new Error("API timeout"));

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("API timeout");
    });

    it("should handle repository errors when looking up by number", async () => {
      mockCaseRepo.findByNumber.mockRejectedValue(new Error("Database error"));

      const result = await tool.execute({ number: "SCS7654321" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Database error");
    });

    it("should handle unknown errors", async () => {
      (serviceNowClient.getCaseJournal as any).mockRejectedValue("Unknown error");

      const result = await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to retrieve journal entries from ServiceNow");
    });
  });

  describe("Logging and Status Updates", () => {
    it("should log the lookup process", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[get_case_journal] Fetched 3 journal entries")
      );

      consoleLogSpy.mockRestore();
    });

    it("should update status during execution", async () => {
      const mockJournals = createMockJournalEntries();
      (serviceNowClient.getCaseJournal as any).mockResolvedValue(mockJournals);

      await tool.execute({ caseSysId: "case-sys-id-789" });

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        expect.stringContaining("is fetching journal entries for")
      );
    });
  });
});
