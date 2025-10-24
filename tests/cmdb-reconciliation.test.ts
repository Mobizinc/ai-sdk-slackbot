import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CmdbReconciliationService } from "../lib/services/cmdb-reconciliation";
import { getCmdbReconciliationRepository } from "../lib/db/repositories/cmdb-reconciliation-repository";
import { getBusinessContextService } from "../lib/services/business-context";
import { ServiceNowClient } from "../lib/tools/servicenow";

// Mock the dependencies
vi.mock("../lib/db/repositories/cmdb-reconciliation-repository");
vi.mock("../lib/services/business-context");
vi.mock("../lib/tools/servicenow");

// Mock Slack client
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true }),
    },
  })),
}));

describe("CmdbReconciliationService", () => {
  let service: CmdbReconciliationService;
  let mockRepository: any;
  let mockBusinessContextService: any;
  let mockServiceNowClient: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mock instances
    mockRepository = {
      create: vi.fn(),
      getByCaseNumber: vi.fn(),
      updateWithMatch: vi.fn(),
      updateWithChildTask: vi.fn(),
      markAsSkipped: vi.fn(),
      markAsAmbiguous: vi.fn(),
      getCaseStatistics: vi.fn(),
      getRecent: vi.fn(),
      getUnmatchedEntities: vi.fn(),
      findById: vi.fn(),
    };

    mockBusinessContextService = {
      searchContextsByEntity: vi.fn(),
    };

    mockServiceNowClient = {
      searchConfigurationItems: vi.fn(),
      addCaseWorkNote: vi.fn(),
      createChildTask: vi.fn(),
    };

    // Mock the singleton getters
    vi.mocked(getCmdbReconciliationRepository).mockReturnValue(mockRepository);
    vi.mocked(getBusinessContextService).mockReturnValue(mockBusinessContextService);
    vi.mocked(ServiceNowClient).mockImplementation(() => mockServiceNowClient);

    // Create service instance
    service = new CmdbReconciliationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      // Mock business context search (no matches)
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      // Mock CMDB search (no matches)
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([]);

      // Mock repository methods
      mockRepository.create.mockResolvedValue({
        id: 1,
        caseNumber: input.caseNumber,
        entityValue: "192.168.1.1",
        entityType: "IP_ADDRESS",
        reconciliationStatus: "skipped",
      });

      // Mock findById for child task creation
      mockRepository.findById.mockResolvedValue({
        id: 1,
        caseNumber: input.caseNumber,
        entityValue: "192.168.1.1",
        entityType: "IP_ADDRESS",
        confidence: 0.8,
      } as any);

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 5,
        matched: 0,
        unmatched: 0,
        skipped: 5,
        ambiguous: 0,
      });

      // Mock ServiceNow task creation
      mockServiceNowClient.createChildTask.mockResolvedValue({
        sys_id: "task_sys_id_123",
        number: "TASK001001",
        url: "http://servicenow.com/task_sys_id_123",
      });

      const result = await service.reconcileEntities(input);

      expect(result.caseNumber).toBe("CASE001");
      expect(result.totalEntities).toBe(5);
      expect(result.matched).toBe(0);
      expect(result.skipped).toBe(5);
      expect(mockRepository.create).toHaveBeenCalledTimes(5);
      expect(mockServiceNowClient.createChildTask).toHaveBeenCalledTimes(3); // Only IP_ADDRESS, SYSTEM, SOFTWARE are CI-worthy
    });

    it("should handle errors gracefully and continue processing other entities", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: ["192.168.1.1", "192.168.1.2"],
          systems: [],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      // Mock business context to throw error for first entity
      mockBusinessContextService.searchContextsByEntity
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("Service unavailable"));

      mockRepository.create.mockResolvedValue({
        id: 1,
        reconciliationStatus: "skipped",
        errorMessage: "Service unavailable",
      });

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 2,
        matched: 0,
        unmatched: 0,
        skipped: 2,
        ambiguous: 0,
      });

      const result = await service.reconcileEntities(input);

      expect(result.totalEntities).toBe(2);
      expect(result.skipped).toBe(2);
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("entity alias resolution", () => {
    it("should resolve entity aliases using business context", async () => {
      const mockContext = {
        entityName: "Legal File Server",
        aliases: ["L drive", "L:", "\\fileserver01\\legal-docs"],
        cmdbIdentifiers: [{
          ciName: "\\fileserver01\\legal-docs",
          sysId: "ci_sys_id_123",
          ipAddresses: ["192.168.1.100"],
        }],
      };

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([mockContext]);

      // Test the private method through the public reconcileEntities method
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: [],
          systems: ["L drive"],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([{
        sys_id: "ci_sys_id_123",
        name: "\\fileserver01\\legal-docs",
        sys_class_name: "cmdb_ci_server",
        url: "http://servicenow.com/ci_sys_id_123",
        ip_addresses: ["192.168.1.100"],
      }]);

      mockRepository.create.mockResolvedValue({ id: 1 });
      mockRepository.updateWithMatch.mockResolvedValue({
        id: 1,
        cmdbSysId: "ci_sys_id_123",
        cmdbName: "\\fileserver01\\legal-docs",
      });

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 1,
        unmatched: 0,
        skipped: 0,
        ambiguous: 0,
      });

      const result = await service.reconcileEntities(input);

      expect(mockBusinessContextService.searchContextsByEntity).toHaveBeenCalledWith("L drive");
      expect(mockServiceNowClient.searchConfigurationItems).toHaveBeenCalledWith({
        name: "\\fileserver01\\legal-docs",
        limit: 5,
      });
      expect(result.matched).toBe(1);
    });

    it("should skip entities with unresolved aliases", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: [],
          systems: ["unknown alias"],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      // No business context matches
      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      // No CMDB matches
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([]);

      mockRepository.create.mockResolvedValue({ 
        id: 1,
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "unknown alias",
        entityType: "SYSTEM",
        confidence: 0.8,
      });
      
      mockRepository.findById.mockResolvedValue({
        id: 1,
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "unknown alias",
        entityType: "SYSTEM",
        confidence: 0.8,
      } as any);
      
      mockRepository.updateWithChildTask.mockResolvedValue({
        id: 1,
        childTaskNumber: "TASK001001",
        childTaskSysId: "task_sys_id_123",
      });
      
      mockRepository.markAsSkipped.mockResolvedValue({ id: 1 });
      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 0,
        unmatched: 0,
        skipped: 1,
        ambiguous: 0,
      });

      // Mock ServiceNow task creation
      mockServiceNowClient.createChildTask.mockResolvedValue({
        sys_id: "task_sys_id_123",
        number: "TASK001001",
        url: "http://servicenow.com/task_sys_id_123",
      });

      const result = await service.reconcileEntities(input);

      expect(result.skipped).toBe(1);
      expect(mockServiceNowClient.createChildTask).toHaveBeenCalledWith({
        caseSysId: "sys_id_123",
        caseNumber: "CASE001",
        description: expect.stringContaining("unknown alias"),
        assignmentGroup: "CMDB Administrators",
        shortDescription: "Create CMDB CI: unknown alias",
        priority: "3",
      });
      expect(mockRepository.updateWithChildTask).toHaveBeenCalledWith(1, {
        childTaskNumber: "TASK001001",
        childTaskSysId: "task_sys_id_123",
      });
    });

    it("should skip non-CI-worthy entities like users", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: [],
          systems: [],
          users: ["user1"],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      mockRepository.create.mockResolvedValue({ id: 1 });
      mockRepository.markAsSkipped.mockResolvedValue({ id: 1 });
      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 0,
        unmatched: 0,
        skipped: 1,
        ambiguous: 0,
      });

      const result = await service.reconcileEntities(input);

      expect(result.skipped).toBe(1);
      expect(mockBusinessContextService.searchContextsByEntity).not.toHaveBeenCalled();
    });
  });

  describe("CMDB matching", () => {
    it("should link CI to case when exact match is found", async () => {
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

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const mockCi = {
        sys_id: "ci_sys_id_123",
        name: "server01",
        sys_class_name: "cmdb_ci_server",
        url: "http://servicenow.com/ci_sys_id_123",
        ip_addresses: ["192.168.1.1"],
      };

      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([mockCi]);

      mockRepository.create.mockResolvedValue({ id: 1 });
      mockRepository.updateWithMatch.mockResolvedValue({
        id: 1,
        cmdbSysId: "ci_sys_id_123",
        cmdbName: "server01",
      });

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 1,
        unmatched: 0,
        skipped: 0,
        ambiguous: 0,
      });

      const result = await service.reconcileEntities(input);

      expect(mockServiceNowClient.addCaseWorkNote).toHaveBeenCalledWith(
        "sys_id_123",
        expect.stringContaining("Linked Configuration Item")
      );
      expect(mockRepository.updateWithMatch).toHaveBeenCalledWith(1, {
        cmdbSysId: "ci_sys_id_123",
        cmdbName: "server01",
        cmdbClass: "cmdb_ci_server",
        cmdbUrl: "http://servicenow.com/ci_sys_id_123",
        confidence: 0.9,
      });
      expect(result.matched).toBe(1);
    });

    it("should create child task when no CMDB match is found", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: [],
          systems: ["missing-server"],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);
      mockServiceNowClient.searchConfigurationItems.mockResolvedValue([]);

      // Mock repository methods
      mockRepository.create.mockResolvedValue({ 
        id: 1,
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "missing-server",
        entityType: "SYSTEM",
        confidence: 0.8,
      });
      
      mockRepository.findById.mockResolvedValue({
        id: 1,
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entityValue: "missing-server",
        entityType: "SYSTEM",
        confidence: 0.8,
      } as any);

      mockRepository.updateWithChildTask.mockResolvedValue({
        id: 1,
        childTaskNumber: "TASK001001",
        childTaskSysId: "task_sys_id_123",
      });

      mockRepository.markAsSkipped.mockResolvedValue({ id: 1 });

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 0,
        unmatched: 0,
        skipped: 1,
        ambiguous: 0,
      });

      // Mock ServiceNow task creation
      mockServiceNowClient.createChildTask.mockResolvedValue({
        sys_id: "task_sys_id_123",
        number: "TASK001001",
        url: "http://servicenow.com/task_sys_id_123",
      });

      const result = await service.reconcileEntities(input);

      expect(mockServiceNowClient.createChildTask).toHaveBeenCalledWith({
        caseSysId: "sys_id_123",
        caseNumber: "CASE001",
        description: expect.stringContaining("missing-server"),
        assignmentGroup: "CMDB Administrators",
        shortDescription: "Create CMDB CI: missing-server",
        priority: "3",
      });
      
      expect(mockRepository.updateWithChildTask).toHaveBeenCalledWith(1, {
        childTaskNumber: "TASK001001",
        childTaskSysId: "task_sys_id_123",
      });
      
      expect(result.skipped).toBe(1);
    });

    it("should mark as ambiguous when multiple CMDB matches are found", async () => {
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        entities: {
          ip_addresses: [],
          systems: ["ambiguous-server"],
          users: [],
          software: [],
          error_codes: [],
          network_devices: [],
        },
      };

      mockBusinessContextService.searchContextsByEntity.mockResolvedValue([]);

      const mockCis = [
        { sys_id: "ci_1", name: "ambiguous-server-1" },
        { sys_id: "ci_2", name: "ambiguous-server-2" },
      ];

      mockServiceNowClient.searchConfigurationItems.mockResolvedValue(mockCis);

      mockRepository.create.mockResolvedValue({ id: 1 });
      mockRepository.markAsAmbiguous.mockResolvedValue({ id: 1 });

      mockRepository.getCaseStatistics.mockResolvedValue({
        total: 1,
        matched: 0,
        unmatched: 0,
        skipped: 0,
        ambiguous: 1,
      });

      const result = await service.reconcileEntities(input);

      expect(mockRepository.markAsAmbiguous).toHaveBeenCalledWith(
        1,
        "Found 2 matches: ambiguous-server-1, ambiguous-server-2"
      );
      expect(result.ambiguous).toBe(1);
    });
  });

  describe("utility methods", () => {
    it("should get case statistics", async () => {
      const mockStats = {
        total: 10,
        matched: 5,
        unmatched: 3,
        skipped: 1,
        ambiguous: 1,
      };

      mockRepository.getCaseStatistics.mockResolvedValue(mockStats);

      const result = await service.getCaseStatistics("CASE001");

      expect(result).toEqual(mockStats);
      expect(mockRepository.getCaseStatistics).toHaveBeenCalledWith("CASE001");
    });

    it("should get recent results", async () => {
      const mockResults = [
        { id: 1, caseNumber: "CASE001", entityValue: "server01" },
        { id: 2, caseNumber: "CASE002", entityValue: "server02" },
      ];

      mockRepository.getRecent.mockResolvedValue(mockResults);

      const result = await service.getRecentResults(10);

      expect(result).toEqual(mockResults);
      expect(mockRepository.getRecent).toHaveBeenCalledWith(10);
    });

    it("should get unmatched entities", async () => {
      const mockUnmatched = [
        { id: 1, entityValue: "missing-server1" },
        { id: 2, entityValue: "missing-server2" },
      ];

      mockRepository.getUnmatchedEntities.mockResolvedValue(mockUnmatched);

      const result = await service.getUnmatchedEntities(5);

      expect(result).toEqual(mockUnmatched);
      expect(mockRepository.getUnmatchedEntities).toHaveBeenCalledWith(5);
    });
  });
});