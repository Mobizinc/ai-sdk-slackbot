import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReconciliationOrchestrator } from "../../lib/services/cmdb/reconciliation-orchestrator";
import { getCmdbReconciliationRepository } from "../../lib/db/repositories/cmdb-reconciliation-repository";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";
import { ServiceNowClient } from "../../lib/tools/servicenow";

// Mock all dependencies
vi.mock("../../lib/db/repositories/cmdb-reconciliation-repository");
vi.mock("../../lib/services/slack-messaging");
vi.mock("../../lib/tools/servicenow");
vi.mock("../../lib/config", () => ({
  config: {
    cmdbReconciliationAssignmentGroup: "CMDB Administrators",
    cmdbReconciliationSlackChannel: "cmdb-alerts",
  },
}));

describe("ReconciliationOrchestrator", () => {
  let orchestrator: ReconciliationOrchestrator;
  let mockRepository: any;
  let mockSlackMessaging: any;
  let mockServiceNowClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      updateWithMatch: vi.fn(),
      updateWithChildTask: vi.fn(),
      markAsSkipped: vi.fn(),
      markAsAmbiguous: vi.fn(),
      getCaseStatistics: vi.fn(),
      getRecent: vi.fn(),
      getUnmatchedEntities: vi.fn(),
    };

    mockSlackMessaging = {
      postMessage: vi.fn(),
    };

    mockServiceNowClient = {
      searchConfigurationItems: vi.fn(),
      addCaseWorkNote: vi.fn(),
      createChildTask: vi.fn(),
    };

    vi.mocked(getCmdbReconciliationRepository).mockReturnValue(mockRepository);
    vi.mocked(getSlackMessagingService).mockReturnValue(mockSlackMessaging);
    vi.mocked(ServiceNowClient).mockImplementation(() => mockServiceNowClient);

    orchestrator = new ReconciliationOrchestrator();
  });

  describe("reconcileEntities", () => {
    it("should process all entities and return reconciliation results", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: ["192.168.1.1"],
          systems: ["server01"],
          users: ["user1"],
          software: ["software1"],
          error_codes: ["ERR001"],
          network_devices: [],
        },
      };

      // Mock repository methods
      mockRepository.create.mockResolvedValue({ id: 1 });
      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 5,
        matched: 0,
        unmatched: 0,
        skipped: 5,
        ambiguous: 0,
      });

      // Mock ServiceNow client to return empty results
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([]);
      mockServiceNowClient.createChildTask.mockResolvedValue({
        sys_id: "task_sys_id_123",
        number: "TASK001001",
      });

      const result = await orchestrator.reconcileEntities(input);

      expect(result.caseNumber).toBe("CASE001");
      expect(result.totalEntities).toBe(5);
      expect(result.skipped).toBe(5);
      expect(mockRepository.create).toHaveBeenCalledTimes(5);
    });

    it("should handle errors gracefully and continue processing", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: ["192.168.1.1"],
          systems: [],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      // Mock repository to throw error for first call
      mockRepository.create.mockRejectedValueOnce(new Error("Database error"));
      mockRepository.create.mockResolvedValue({ id: 2 });
      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 0,
        unmatched: 0,
        skipped: 1,
        ambiguous: 0,
      });

      const result = await orchestrator.reconcileEntities(input);

      expect(result.totalEntities).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCaseStatistics", () => {
    it("should delegate to repository", async () => {
      const mockStats = {
        total: 10,
        matched: 5,
        unmatched: 3,
        skipped: 1,
        ambiguous: 1,
      };

      mockRepository.getCaseStatistics.mockResolvedValue(mockStats);

      const result = await orchestrator.getCaseStatistics("CASE001");

      expect(result).toEqual(mockStats);
      expect(mockRepository.getCaseStatistics).toHaveBeenCalledWith("CASE001");
    });
  });

  describe("getRecentResults", () => {
    it("should delegate to repository", async () => {
      const mockResults = [
        { id: 1, caseNumber: "CASE001" },
        { id: 2, caseNumber: "CASE002" },
      ];

      mockRepository.getRecent.mockResolvedValue(mockResults);

      const result = await orchestrator.getRecentResults(10);

      expect(result).toEqual(mockResults);
      expect(mockRepository.getRecent).toHaveBeenCalledWith(10);
    });
  });

  describe("getUnmatchedEntities", () => {
    it("should delegate to repository", async () => {
      const mockUnmatched = [
        { id: 1, entityValue: "missing-server1" },
        { id: 2, entityValue: "missing-server2" },
      ];

      mockRepository.getUnmatchedEntities.mockResolvedValue(mockUnmatched);

      const result = await orchestrator.getUnmatchedEntities(5);

      expect(result).toEqual(mockUnmatched);
      expect(mockRepository.getUnmatchedEntities).toHaveBeenCalledWith(5);
    });
  });
});