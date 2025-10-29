/**
 * Unit Tests for Case Data Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CaseDataService,
  getCaseDataService,
  __resetCaseDataService,
  __setCaseDataService,
} from "../lib/services/case-data";
import type { ServiceNowCaseResult, ServiceNowCaseJournalEntry } from "../lib/tools/servicenow";

describe("CaseDataService", () => {
  let mockClient: any;
  let service: CaseDataService;

  // Mock case data
  const mockCase: ServiceNowCaseResult = {
    number: "SCS0001234",
    sys_id: "abc123",
    state: "New",
    priority: "3 - Moderate",
    short_description: "Test case",
    description: "Test case description",
    opened_by: { display_value: "John Doe" },
    assigned_to: { display_value: "Jane Smith" },
    company: { display_value: "Acme Corp" },
  } as ServiceNowCaseResult;

  const mockJournal: ServiceNowCaseJournalEntry[] = [
    {
      sys_id: "journal1",
      sys_created_on: "2025-01-01 10:00:00",
      created_by: { display_value: "John Doe" },
      value: "Journal entry 1",
      element: "work_notes",
    } as ServiceNowCaseJournalEntry,
    {
      sys_id: "journal2",
      sys_created_on: "2025-01-02 11:00:00",
      created_by: { display_value: "Jane Smith" },
      value: "Journal entry 2",
      element: "work_notes",
    } as ServiceNowCaseJournalEntry,
  ];

  beforeEach(() => {
    // Create mock ServiceNow client
    mockClient = {
      isConfigured: vi.fn().mockReturnValue(true),
      getCase: vi.fn().mockResolvedValue(mockCase),
      getCaseBySysId: vi.fn().mockResolvedValue(mockCase),
      getCaseJournal: vi.fn().mockResolvedValue(mockJournal),
    };

    service = new CaseDataService(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetCaseDataService();
  });

  describe("isConfigured", () => {
    it("should return true when ServiceNow is configured", () => {
      expect(service.isConfigured()).toBe(true);
      expect(mockClient.isConfigured).toHaveBeenCalled();
    });

    it("should return false when ServiceNow is not configured", () => {
      mockClient.isConfigured.mockReturnValue(false);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe("getCase", () => {
    it("should fetch a case by case number", async () => {
      const result = await service.getCase("SCS0001234");

      expect(mockClient.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(result).toEqual(mockCase);
    });

    it("should return null when ServiceNow is not configured", async () => {
      mockClient.isConfigured.mockReturnValue(false);

      const result = await service.getCase("SCS0001234");

      expect(mockClient.getCase).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      mockClient.getCase.mockRejectedValue(new Error("API error"));

      const result = await service.getCase("SCS0001234");

      expect(result).toBeNull();
    });

    it("should handle case not found", async () => {
      mockClient.getCase.mockResolvedValue(null);

      const result = await service.getCase("NOTFOUND");

      expect(result).toBeNull();
    });
  });

  describe("getCaseBySysId", () => {
    it("should fetch a case by sys_id", async () => {
      const result = await service.getCaseBySysId("abc123");

      expect(mockClient.getCaseBySysId).toHaveBeenCalledWith("abc123");
      expect(result).toEqual(mockCase);
    });

    it("should return null when ServiceNow is not configured", async () => {
      mockClient.isConfigured.mockReturnValue(false);

      const result = await service.getCaseBySysId("abc123");

      expect(mockClient.getCaseBySysId).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      mockClient.getCaseBySysId.mockRejectedValue(new Error("Not found"));

      const result = await service.getCaseBySysId("invalid");

      expect(result).toBeNull();
    });
  });

  describe("getCaseJournal", () => {
    it("should fetch journal entries", async () => {
      const result = await service.getCaseJournal("abc123");

      expect(mockClient.getCaseJournal).toHaveBeenCalledWith("abc123", undefined);
      expect(result).toEqual(mockJournal);
    });

    it("should respect limit option", async () => {
      await service.getCaseJournal("abc123", { limit: 10 });

      expect(mockClient.getCaseJournal).toHaveBeenCalledWith("abc123", { limit: 10 });
    });

    it("should return empty array when ServiceNow is not configured", async () => {
      mockClient.isConfigured.mockReturnValue(false);

      const result = await service.getCaseJournal("abc123");

      expect(mockClient.getCaseJournal).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should return empty array on error", async () => {
      mockClient.getCaseJournal.mockRejectedValue(new Error("Journal not found"));

      const result = await service.getCaseJournal("abc123");

      expect(result).toEqual([]);
    });
  });

  describe("getCaseWithJournal", () => {
    it("should fetch case and journal together", async () => {
      const result = await service.getCaseWithJournal("SCS0001234");

      expect(mockClient.getCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockClient.getCaseJournal).toHaveBeenCalledWith("abc123", {});
      expect(result).toEqual({
        case: mockCase,
        journal: mockJournal,
      });
    });

    it("should respect journalLimit option", async () => {
      await service.getCaseWithJournal("SCS0001234", { journalLimit: 5 });

      expect(mockClient.getCaseJournal).toHaveBeenCalledWith("abc123", { limit: 5 });
    });

    it("should return null when case not found", async () => {
      mockClient.getCase.mockResolvedValue(null);

      const result = await service.getCaseWithJournal("NOTFOUND");

      expect(result).toBeNull();
      expect(mockClient.getCaseJournal).not.toHaveBeenCalled();
    });

    it("should still return case even if journal fails", async () => {
      mockClient.getCaseJournal.mockResolvedValue([]);

      const result = await service.getCaseWithJournal("SCS0001234");

      expect(result).toEqual({
        case: mockCase,
        journal: [],
      });
    });
  });

  describe("isResolved", () => {
    it("should return true for resolved cases", async () => {
      mockClient.getCase.mockResolvedValue({
        ...mockCase,
        state: "Resolved",
      });

      const result = await service.isResolved("SCS0001234");

      expect(result).toBe(true);
    });

    it("should return true for closed cases", async () => {
      mockClient.getCase.mockResolvedValue({
        ...mockCase,
        state: "Closed",
      });

      const result = await service.isResolved("SCS0001234");

      expect(result).toBe(true);
    });

    it("should return true for cancelled cases", async () => {
      mockClient.getCase.mockResolvedValue({
        ...mockCase,
        state: "Cancelled",
      });

      const result = await service.isResolved("SCS0001234");

      expect(result).toBe(true);
    });

    it("should return false for active cases", async () => {
      mockClient.getCase.mockResolvedValue({
        ...mockCase,
        state: "In Progress",
      });

      const result = await service.isResolved("SCS0001234");

      expect(result).toBe(false);
    });

    it("should return false when case not found", async () => {
      mockClient.getCase.mockResolvedValue(null);

      const result = await service.isResolved("NOTFOUND");

      expect(result).toBe(false);
    });
  });

  describe("getCaseSafely", () => {
    it("should return case data", async () => {
      const result = await service.getCaseSafely("SCS0001234");

      expect(result).toEqual(mockCase);
    });

    it("should return null on error without throwing", async () => {
      mockClient.getCase.mockRejectedValue(new Error("API error"));

      const result = await service.getCaseSafely("SCS0001234");

      expect(result).toBeNull();
      // Should not throw
    });
  });

  describe("getCases", () => {
    it("should fetch multiple cases in parallel", async () => {
      const case1 = { ...mockCase, number: "SCS0001" };
      const case2 = { ...mockCase, number: "SCS0002" };
      const case3 = { ...mockCase, number: "SCS0003" };

      mockClient.getCase
        .mockResolvedValueOnce(case1)
        .mockResolvedValueOnce(case2)
        .mockResolvedValueOnce(case3);

      const result = await service.getCases(["SCS0001", "SCS0002", "SCS0003"]);

      expect(mockClient.getCase).toHaveBeenCalledTimes(3);
      expect(result.size).toBe(3);
      expect(result.get("SCS0001")).toEqual(case1);
      expect(result.get("SCS0002")).toEqual(case2);
      expect(result.get("SCS0003")).toEqual(case3);
    });

    it("should handle some cases not found", async () => {
      mockClient.getCase
        .mockResolvedValueOnce(mockCase)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCase);

      const result = await service.getCases(["SCS0001", "NOTFOUND", "SCS0003"]);

      expect(result.size).toBe(3);
      expect(result.get("SCS0001")).toEqual(mockCase);
      expect(result.get("NOTFOUND")).toBeNull();
      expect(result.get("SCS0003")).toEqual(mockCase);
    });

    it("should handle empty array", async () => {
      const result = await service.getCases([]);

      expect(result.size).toBe(0);
      expect(mockClient.getCase).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mockClient.getCase
        .mockResolvedValueOnce(mockCase)
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce(mockCase);

      const result = await service.getCases(["SCS0001", "ERROR", "SCS0003"]);

      expect(result.size).toBe(3);
      expect(result.get("SCS0001")).toEqual(mockCase);
      expect(result.get("ERROR")).toBeNull();
      expect(result.get("SCS0003")).toEqual(mockCase);
    });
  });

  describe("Singleton pattern", () => {
    it("should return the same instance", () => {
      // Set a mock instance first
      const mockService = new CaseDataService(mockClient);
      __setCaseDataService(mockService);

      const instance1 = getCaseDataService();
      const instance2 = getCaseDataService();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const mockService1 = new CaseDataService(mockClient);
      __setCaseDataService(mockService1);

      const instance1 = getCaseDataService();

      __resetCaseDataService();

      const mockService2 = new CaseDataService(mockClient);
      __setCaseDataService(mockService2);

      const instance2 = getCaseDataService();

      expect(instance1).not.toBe(instance2);
    });

    it("should allow setting custom instance", () => {
      const customService = new CaseDataService(mockClient);
      __setCaseDataService(customService);

      const instance = getCaseDataService();
      expect(instance).toBe(customService);
    });
  });
});
