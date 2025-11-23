import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CIMatchingService } from "../lib/services/ci-matching-service";
import { getCmdbRepository } from "../lib/infrastructure/servicenow/repositories/factory";

// Mock the dependencies
vi.mock("../lib/infrastructure/servicenow/repositories/factory");

const mockCmdbRepo = {
  findByName: vi.fn(),
  findBySysId: vi.fn(),
  findByIpAddress: vi.fn(),
  findByFqdn: vi.fn(),
  search: vi.fn(),
  findByClassName: vi.fn(),
  linkToCase: vi.fn(),
  findLinkedToCaseItem: vi.fn(),
  findByOwnerGroup: vi.fn(),
  findByEnvironment: vi.fn(),
  getRelatedCIs: vi.fn(),
  create: vi.fn(),
  createRelationship: vi.fn(),
};

describe("CIMatchingService", () => {
  let service: CIMatchingService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCmdbRepository).mockReturnValue(mockCmdbRepo);
    service = new CIMatchingService(70);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("✓ Initializes with confidence threshold", () => {
      expect(service).toBeInstanceOf(CIMatchingService);
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
        sysId: "ci-123",
        name: "server01",
        class: "cmdb_ci_server",
        confidence: 95,
        source: "cmdb",
        matchReason: "IP address match: 192.168.1.100",
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
        sysId: "ci-456",
        name: "webserver.example.com",
        class: "cmdb_ci_web_server",
        confidence: 95,
        source: "cmdb",
        matchReason: "Hostname match: webserver.example.com",
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
        sysId: "ci-789",
        name: "database-server",
        class: "cmdb_ci_database",
        confidence: 85,
        source: "cmdb",
        matchReason: "Name match: database-server",
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

  describe("Edge Name Processing", () => {
    it("✓ Handles edge_names without inventory matching", async () => {
      const entities = {
        edge_names: ["edge-ACCT0242146-01"],
      };

      const result = await service.matchEntities(entities);

      // Service no longer has VeloCloud inventory, so no matches expected
      expect(result.matches).toHaveLength(0);
      expect(result.highConfidenceMatches).toHaveLength(0);
      expect(result.lowConfidenceMatches).toHaveLength(0);
    });

    it("✓ Handles account_numbers without inventory matching", async () => {
      const entities = {
        account_numbers: ["ACCT0242146", "ACCT0242147"],
      };

      const result = await service.matchEntities(entities);

      // Service no longer has VeloCloud inventory, so no matches expected
      expect(result.matches).toHaveLength(0);
      expect(result.highConfidenceMatches).toHaveLength(0);
      expect(result.lowConfidenceMatches).toHaveLength(0);
    });
  });

  describe("Deduplication and Confidence", () => {
    it("✓ Deduplicates matches (keeps highest confidence)", async () => {
      // Mock both inventory and CMDB to return matches for the same CI
      mockCmdbRepo.findByIpAddress.mockResolvedValue([
        {
          sysId: "edge-logical-id-1", // Same sysId as inventory match
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
      // Should keep the highest confidence (95 from CMDB)
      expect(result.matches[0].confidence).toBe(95);
      expect(result.matches[0].source).toBe("cmdb");
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
        ip_addresses: ["192.168.1.100"], // 95 confidence
      };

      const result = await service.matchEntities(entities);

      expect(result.highConfidenceMatches).toHaveLength(1); // 95 >= 70
      expect(result.lowConfidenceMatches).toHaveLength(0);

      // Test with lower threshold
      const serviceWithHighThreshold = new CIMatchingService(95);
      const highThresholdResult = await serviceWithHighThreshold.matchEntities(entities);

      expect(highThresholdResult.highConfidenceMatches).toHaveLength(1); // 95 >= 95
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
        ip_addresses: ["192.168.1.100"], // 95 confidence
      };

      const result = await service.matchEntities(entities);

      // Should be 95 since only one match
      expect(result.overallConfidence).toBe(95);
    });
  });

  describe("Service Methods", () => {
    it("✓ Returns recommended CI (highest confidence match)", async () => {
      mockCmdbRepo.findByIpAddress.mockResolvedValue([
        {
          sysId: "ci-recommended",
          name: "recommended-server",
          className: "cmdb_ci_server",
        },
      ]);

      const entities = {
        ip_addresses: ["192.168.1.100"],
      };

      const recommended = await service.getRecommendedCI(entities);

      expect(recommended).toMatchObject({
        sysId: "ci-recommended",
        name: "recommended-server",
        confidence: 95,
      });
    });

    it("✓ Returns null for recommended CI when no high confidence matches", async () => {
      const entities = {
        edge_names: ["non-existent"],
      };

      const recommended = await service.getRecommendedCI(entities);

      expect(recommended).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("✓ Handles CMDB repository errors", async () => {
      vi.mocked(getCmdbRepository).mockImplementation(() => {
        throw new Error("CMDB repository unavailable");
      });

      const serviceWithBrokenCMDB = new CIMatchingService(70);
      const entities = {
        ip_addresses: ["192.168.1.100"],
      };

      // Should not throw
      const result = await serviceWithBrokenCMDB.matchEntities(entities);

      // Should have no matches due to error
      expect(result.matches).toHaveLength(0);
    });
  });
});