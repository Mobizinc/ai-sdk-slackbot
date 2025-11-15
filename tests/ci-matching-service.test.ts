import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CIMatchingService } from "../lib/services/ci-matching-service";
import { getCmdbRepository } from "../lib/infrastructure/servicenow/repositories/factory";
import { readFileSync } from "fs";
import { join } from "path";

// Mock the dependencies
vi.mock("../lib/infrastructure/servicenow/repositories/factory");
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));
vi.mock("path", () => ({
  join: vi.fn(),
}));

const mockCmdbRepo = {
  findByIpAddress: vi.fn(),
  findByFqdn: vi.fn(),
  search: vi.fn(),
};

describe("CIMatchingService", () => {
  let service: CIMatchingService;
  const mockVeloCloudInventory = {
    generated_at: "2025-01-01T00:00:00Z",
    source: "velocloud-api",
    customers: [
      {
        customer: "Test Customer",
        base_url: "https://test.velocloud.net",
        enterprise_id: 12345,
        edge_count: 2,
        records: [
          {
            edge_id: 1,
            edge_name: "edge-ACCT0242146-01",
            logical_id: "edge-logical-id-1",
            enterprise_id: 12345,
            site_name: "Main Office",
            edge_state: "CONNECTED",
            activation_state: "ACTIVE",
            model_number: "VCE-1100",
            last_contact: "2025-01-01T12:00:00Z",
            account_hint: "ACCT0242146",
          },
          {
            edge_id: 2,
            edge_name: "edge-ACCT0242147-01",
            logical_id: "edge-logical-id-2",
            enterprise_id: 12346,
            site_name: "Branch Office",
            edge_state: "DISCONNECTED",
            activation_state: "INACTIVE",
            model_number: "VCE-1100",
            last_contact: "2024-12-31T12:00:00Z",
            account_hint: "ACCT0242147",
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCmdbRepository).mockReturnValue(mockCmdbRepo);
    vi.mocked(join).mockReturnValue("/mocked/path/velocloud-edges.json");
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockVeloCloudInventory));
    service = new CIMatchingService(70);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("✓ Loads VeloCloud inventory on initialization", () => {
      expect(readFileSync).toHaveBeenCalledWith(
        "/mocked/path/velocloud-edges.json",
        "utf-8"
      );
      expect(service).toBeInstanceOf(CIMatchingService);
    });

    it("✓ Handles inventory loading failure gracefully", () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });
      
      const serviceWithFailedLoad = new CIMatchingService(70);
      // Should not throw, just log error and continue
      expect(serviceWithFailedLoad).toBeInstanceOf(CIMatchingService);
    });
  });

  describe("Account Number Extraction", () => {
    it("✓ Extracts account numbers from text (ACCT format)", () => {
      const text = "The edge ACCT0242146 is having issues with ACCT0242147";
      const accountNumbers = service["extractAccountNumbers"](text);
      
      expect(accountNumbers).toEqual(["ACCT0242146", "ACCT0242147"]);
    });

    it("✓ Handles case insensitive account numbers", () => {
      const text = "Issues with acct0242146 and AcCt0242147";
      const accountNumbers = service["extractAccountNumbers"](text);
      
      expect(accountNumbers).toEqual(["ACCT0242146", "ACCT0242147"]);
    });

    it("✓ Removes duplicate account numbers", () => {
      const text = "ACCT0242146 appears twice: ACCT0242146";
      const accountNumbers = service["extractAccountNumbers"](text);
      
      expect(accountNumbers).toEqual(["ACCT0242146"]);
    });
  });

  describe("VeloCloud Edge Matching", () => {
    it("✓ Matches VeloCloud edges by exact name (100% confidence)", async () => {
      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        sys_id: "edge-logical-id-1",
        name: "edge-ACCT0242146-01",
        class: "VeloCloud Edge",
        confidence: 100,
        source: "inventory",
        match_reason: "Exact edge name match",
      });
    });

    it("✓ Matches VeloCloud edges by partial name (85% confidence)", async () => {
      const entities = {
        edge_names: ["ACCT0242146"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        sys_id: "edge-logical-id-1",
        name: "edge-ACCT0242146-01",
        class: "VeloCloud Edge",
        confidence: 85,
        source: "inventory",
        match_reason: "Partial edge name match",
      });
    });

    it("✓ Matches VeloCloud edges by account number (90% active, 75% inactive)", async () => {
      const entities = {
        account_numbers: ["ACCT0242146", "ACCT0242147"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(2);
      
      // Active edge should have 90% confidence
      const activeMatch = result.matches.find(m => m.confidence === 90);
      expect(activeMatch).toMatchObject({
        name: "edge-ACCT0242146-01",
        confidence: 90,
        match_reason: "Account number match (ACCT0242146) - Active",
      });

      // Inactive edge should have 75% confidence
      const inactiveMatch = result.matches.find(m => m.confidence === 75);
      expect(inactiveMatch).toMatchObject({
        name: "edge-ACCT0242147-01",
        confidence: 75,
        match_reason: "Account number match (ACCT0242147) - Inactive",
      });
    });

    it("✓ Matches by site name (80% confidence)", async () => {
      const entities = {
        system_names: ["Main Office"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        name: "edge-ACCT0242146-01",
        confidence: 80,
        match_reason: "Site name match: Main Office",
      });
    });
  });

  describe("CMDB Matching", () => {
    it("✓ Matches CMDB CIs by IP address (95% confidence)", async () => {
      const mockCIs = [
        {
          sysId: "ci-123",
          name: "server01",
          className: "cmdb_ci_server",
        },
      ];

      mockCmdbRepo.findByIpAddress.mockResolvedValue(mockCIs);

      const entities = {
        ip_addresses: ["192.168.1.100"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        sys_id: "ci-123",
        name: "server01",
        class: "cmdb_ci_server",
        confidence: 95,
        source: "cmdb",
        match_reason: "IP address match: 192.168.1.100",
      });

      expect(mockCmdbRepo.findByIpAddress).toHaveBeenCalledWith("192.168.1.100");
    });

    it("✓ Matches CMDB CIs by hostname/FQDN (95% confidence)", async () => {
      const mockCIs = [
        {
          sysId: "ci-456",
          name: "webserver.example.com",
          className: "cmdb_ci_web_server",
        },
      ];

      mockCmdbRepo.findByFqdn.mockResolvedValue(mockCIs);

      const entities = {
        hostnames: ["webserver.example.com"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        sys_id: "ci-456",
        name: "webserver.example.com",
        class: "cmdb_ci_web_server",
        confidence: 95,
        source: "cmdb",
        match_reason: "Hostname match: webserver.example.com",
      });

      expect(mockCmdbRepo.findByFqdn).toHaveBeenCalledWith("webserver.example.com");
    });

    it("✓ Matches CMDB CIs by name using search (85% confidence)", async () => {
      const mockCIs = [
        {
          sysId: "ci-789",
          name: "database-server",
          className: "cmdb_ci_database",
        },
      ];

      mockCmdbRepo.search.mockResolvedValue(mockCIs);

      const entities = {
        system_names: ["database-server"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        sys_id: "ci-789",
        name: "database-server",
        class: "cmdb_ci_database",
        confidence: 85,
        source: "cmdb",
        match_reason: "Name match: database-server",
      });

      expect(mockCmdbRepo.search).toHaveBeenCalledWith({ name: "database-server", limit: 5 });
    });

    it("✓ Handles CMDB errors gracefully (logs warning, continues)", async () => {
      mockCmdbRepo.findByIpAddress.mockRejectedValue(new Error("CMDB connection failed"));

      const entities = {
        ip_addresses: ["192.168.1.100"],
        hostnames: ["test.example.com"],
      };

      // Should not throw, just log warning and continue
      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(0);
    });
  });

  describe("Deduplication and Confidence", () => {
    it("✓ Deduplicates matches (keeps highest confidence)", async () => {
      // Mock both inventory and CMDB to return matches for the same CI
      mockCmdbRepo.findByIpAddress.mockResolvedValue([
        {
          sysId: "edge-logical-id-1", // Same sys_id as inventory match
          name: "edge-ACCT0242146-01",
          className: "cmdb_ci_edge_device",
        },
      ]);

      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
        ip_addresses: ["192.168.1.100"],
      };

      const result = await service.matchEntities(entities);

      // Should only have one match (deduplicated)
      expect(result.matches).toHaveLength(1);
      // Should keep the highest confidence (100 from inventory vs 95 from CMDB)
      expect(result.matches[0].confidence).toBe(100);
      expect(result.matches[0].source).toBe("inventory");
    });

    it("✓ Separates high vs low confidence matches by threshold", async () => {
      mockCmdbRepo.findByIpAddress.mockResolvedValue([
        {
          sysId: "ci-low",
          name: "low-confidence-server",
          className: "cmdb_ci_server",
        },
      ]);

      const entities = {
        edge_names: ["edge-ACCT0242146-01"], // 100 confidence
        ip_addresses: ["192.168.1.100"], // 95 confidence
      };

      const result = await service.matchEntities(entities);

      expect(result.highConfidenceMatches).toHaveLength(2); // Both >= 70
      expect(result.lowConfidenceMatches).toHaveLength(0);

      // Test with lower threshold
      const serviceWithHighThreshold = new CIMatchingService(95);
      const highThresholdResult = await serviceWithHighThreshold.matchEntities(entities);

      expect(highThresholdResult.highConfidenceMatches).toHaveLength(2); // 100 and 95
      expect(highThresholdResult.lowConfidenceMatches).toHaveLength(0);
    });

    it("✓ Returns empty array when no matches found", async () => {
      const entities = {
        edge_names: ["non-existent-edge"],
        ip_addresses: ["1.2.3.4"],
        hostnames: ["nonexistent.example.com"],
      };

      const result = await service.matchEntities(entities);

      expect(result.matches).toHaveLength(0);
      expect(result.highConfidenceMatches).toHaveLength(0);
      expect(result.lowConfidenceMatches).toHaveLength(0);
      expect(result.overallConfidence).toBe(0);
    });

    it("✓ Calculates overall confidence correctly", async () => {
      mockCmdbRepo.findByIpAddress.mockResolvedValue([
        { sysId: "ci-1", name: "server1", className: "cmdb_ci_server" },
      ]);

      const entities = {
        edge_names: ["edge-ACCT0242146-01"], // 100 confidence
        ip_addresses: ["192.168.1.100"], // 95 confidence
      };

      const result = await service.matchEntities(entities);

      // Should be average of all matches: (100 + 95) / 2 = 97.5
      expect(result.overallConfidence).toBe(97.5);
    });
  });

  describe("Service Methods", () => {
    it("✓ Returns recommended CI (highest confidence match)", async () => {
      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
      };

      const recommended = await service.getRecommendedCI(entities);

      expect(recommended).toMatchObject({
        sys_id: "edge-logical-id-1",
        name: "edge-ACCT0242146-01",
        confidence: 100,
      });
    });

    it("✓ Returns null for recommended CI when no high confidence matches", async () => {
      const entities = {
        edge_names: ["non-existent"],
      };

      const recommended = await service.getRecommendedCI(entities);

      expect(recommended).toBeNull();
    });

    it("✓ Refreshes inventory", () => {
      const serviceWithRefresh = new CIMatchingService(70);
      
      // Clear the mock to test refresh
      vi.clearAllMocks();
      vi.mocked(join).mockReturnValue("/mocked/path/velocloud-edges.json");
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockVeloCloudInventory));

      serviceWithRefresh.refreshInventory();

      expect(readFileSync).toHaveBeenCalledWith(
        "/mocked/path/velocloud-edges.json",
        "utf-8"
      );
    });
  });

  describe("Error Handling", () => {
    it("✓ Handles missing VeloCloud inventory gracefully", async () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      const serviceWithNoInventory = new CIMatchingService(70);
      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
      };

      const result = await serviceWithNoInventory.matchEntities(entities);

      // Should still work with CMDB matches only
      expect(result.matches).toHaveLength(0); // No CMDB mocks in this test
    });

    it("✓ Handles CMDB repository errors", async () => {
      vi.mocked(getCmdbRepository).mockImplementation(() => {
        throw new Error("CMDB repository unavailable");
      });

      const serviceWithBrokenCMDB = new CIMatchingService(70);
      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
      };

      // Should not throw
      const result = await serviceWithBrokenCMDB.matchEntities(entities);

      // Should still have inventory matches
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].source).toBe("inventory");
    });
  });
});